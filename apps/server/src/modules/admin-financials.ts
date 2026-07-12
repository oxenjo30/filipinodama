import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAdmin } from "../auth/guards.js";
import { audit } from "../lib/audit.js";
import { applyLedgerTx } from "../economy/ledger.js";

/**
 * Admin — Financials: live Diamond top-up revenue dashboard + refunds
 * (handoffv3 rows 8-15 / v3-delta Cluster A2). Reads REAL `Payment` rows
 * only — top-ups are the settled/refunded Payment rows written by the
 * PayMongo webhook (modules/payments.ts). Real-money top-up purchasing is
 * currently DISABLED (DIAMOND_TOPUP_ENABLED=false, gold-only economy), so in
 * production this endpoint honestly returns zero top-ups until the standing
 * monetization decision changes — the admin UI renders the approved empty
 * state in that case. NOTHING here seeds or fabricates purchase data.
 *
 * Roles (guards.ts hierarchy): SUPPORT < MODERATOR < ECONOMY < SUPERADMIN.
 * Reads are SUPPORT (consistent with admin.ts /admin/users, /admin/ledger is
 * ECONOMY though — top-up READ is lower-sensitivity than the full ledger
 * explorer, it's a curated purchases view); refund is ECONOMY (same tier as
 * admin.ts's currency grant endpoint — reversing money is an economy action,
 * SUPERADMIN implicitly satisfies it via the rank hierarchy in guards.ts).
 * This is a deliberate fix of the prototype's flagged gap: the mockup's
 * `can('finance.refund')` check always passed because `finance.refund` was
 * never added to its client-side PERMS map (see admin-v2-v3-diff.md "New
 * permission checks"). Here the gate is enforced server-side via
 * requireAdmin("ECONOMY") — a SUPPORT/MODERATOR token cannot reach it.
 */

// Diamond-pack size buckets — thresholds on the CREDITED diamonds (pack + bonus),
// mirroring the mockup's "By pack size" breakdown (Mega/Large/Medium/Small/Starter).
function packSizeBucket(diamonds: number): string {
  if (diamonds >= 3000) return "Mega";
  if (diamonds >= 1000) return "Large";
  if (diamonds >= 500) return "Medium";
  if (diamonds >= 200) return "Small";
  return "Starter";
}

// Player-tier buckets — thresholds on REAL trophies, mirroring the mockup's
// "By player tier" breakdown (Grandmaster/Master/Diamond/Star Guardian/Gold).
function tierBucket(trophies: number): string {
  if (trophies >= 2600) return "Grandmaster";
  if (trophies >= 2000) return "Master";
  if (trophies >= 1700) return "Diamond";
  if (trophies >= 1100) return "Star Guardian";
  return "Gold";
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type PaymentRow = {
  id: string;
  userId: string;
  provider: string;
  amountCents: number;
  diamonds: number;
  status: string;
  createdAt: Date;
  settledAt: Date | null;
  user: { id: string; username: string; displayName: string; tag: string; email: string | null; trophies: number; countryCode: string | null };
};

/** Shared shape mapper for one settled/refunded top-up row → the admin list row. */
function toRow(p: PaymentRow) {
  return {
    id: p.id,
    orderId: p.id,
    player: { id: p.user.id, name: p.user.displayName, tag: p.user.tag, username: p.user.username },
    amountCents: p.amountCents,
    diamonds: p.diamonds,
    provider: p.provider,
    status: p.status, // "settled" | "refunded"
    refunded: p.status === "refunded",
    createdAt: p.settledAt ?? p.createdAt,
  };
}

export async function adminFinancialsRoutes(app: FastifyInstance) {
  // ── GET /admin/payments — live top-up dashboard (list + stats + breakdowns) ──
  app.get("/admin/payments", { preHandler: requireAdmin("SUPPORT") }, async () => {
    // Top-ups = settled or refunded real-money Payment rows only (pending/failed
    // are not yet — or never — real purchases, so they're excluded everywhere).
    const rows = await prisma.payment.findMany({
      where: { status: { in: ["settled", "refunded"] } },
      orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
      include: { user: { select: { id: true, username: true, displayName: true, tag: true, email: true, trophies: true, countryCode: true } } },
    });

    const hasTopups = rows.length > 0;
    if (!hasTopups) {
      return ok({
        hasTopups: false,
        stats: { totalCents: 0, todayCents: 0, orders: 0, avgOrderCents: 0, diamondsSold: 0, refundedCents: 0, refundedCount: 0 },
        chart: [],
        recent: [],
        breakdowns: null,
        regionSource: "none" as const,
      });
    }

    const now = new Date();
    const dayMs = 86_400_000;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const live = rows.filter((r) => r.status === "settled");
    const refunded = rows.filter((r) => r.status === "refunded");

    const totalCents = live.reduce((s, r) => s + r.amountCents, 0);
    const todayCents = live.filter((r) => (r.settledAt ?? r.createdAt) >= todayStart).reduce((s, r) => s + r.amountCents, 0);
    const orders = live.length;
    const avgOrderCents = orders > 0 ? Math.round(totalCents / orders) : 0;
    const diamondsSold = live.reduce((s, r) => s + r.diamonds, 0);
    const refundedCents = refunded.reduce((s, r) => s + r.amountCents, 0);
    const refundedCount = refunded.length;

    // Last 7 days, oldest→newest, $ totals of settled top-ups per UTC-local day.
    const chart: { day: string; label: string; totalCents: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * dayMs);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart.getTime() + dayMs);
      const totalCentsForDay = live
        .filter((r) => {
          const t = r.settledAt ?? r.createdAt;
          return t >= dayStart && t < dayEnd;
        })
        .reduce((s, r) => s + r.amountCents, 0);
      chart.push({ day: dayStart.toISOString(), label: i === 0 ? "Today" : `${i}d`, totalCents: totalCentsForDay });
    }

    // Recent top-ups — up to 10, newest first (rows already sorted desc).
    const recent = rows.slice(0, 10).map(toRow);

    // ── Revenue breakdowns (only meaningful with top-ups present) ──────────────
    function bucketSum(pairs: [string, number][]): { label: string; amountCents: number }[] {
      const m = new Map<string, number>();
      for (const [label, cents] of pairs) m.set(label, (m.get(label) ?? 0) + cents);
      return [...m.entries()].map(([label, amountCents]) => ({ label, amountCents })).sort((a, b) => b.amountCents - a.amountCents);
    }

    const byPackSize = bucketSum(live.map((r) => [packSizeBucket(r.diamonds), r.amountCents]));
    const byPlayerTier = bucketSum(live.map((r) => [tierBucket(r.user.trophies), r.amountCents]));

    // By region: NO deterministic-hash fabrication. The schema has no
    // Philippine-region field (Luzon/Visayas/Mindanao/Metro Manila/Overseas
    // don't exist as data) — only User.countryCode, a free-form, optional,
    // user-set country code. We bucket by that REAL field when present and
    // fall back to a single honest "Unknown" bucket when absent, rather than
    // inventing PH-region buckets we have no data for.
    const regionSource = live.some((r) => r.user.countryCode) ? ("countryCode" as const) : ("none" as const);
    const byRegion = bucketSum(live.map((r) => [r.user.countryCode?.trim() || "Unknown", r.amountCents]));

    const byDayOfWeek = bucketSum(live.map((r) => [DOW[(r.settledAt ?? r.createdAt).getDay()]!, r.amountCents]));
    // Fixed Sun..Sat order (bucketSum sorts by amount desc, which loses day order).
    const byDayOfWeekOrdered = DOW.map((label) => byDayOfWeek.find((b) => b.label === label) ?? { label, amountCents: 0 });

    // New vs returning — "New buyer" = this Payment IS that player's first
    // settled/refunded top-up (by real timestamp); "Returning" otherwise.
    const firstPurchaseByUser = new Map<string, number>();
    for (const r of rows) {
      const t = (r.settledAt ?? r.createdAt).getTime();
      const cur = firstPurchaseByUser.get(r.userId);
      if (cur === undefined || t < cur) firstPurchaseByUser.set(r.userId, t);
    }
    const newVsReturning = bucketSum(
      live.map((r) => {
        const t = (r.settledAt ?? r.createdAt).getTime();
        const isFirst = firstPurchaseByUser.get(r.userId) === t;
        return [isFirst ? "New buyer" : "Returning", r.amountCents];
      }),
    );

    return ok({
      hasTopups: true,
      stats: { totalCents, todayCents, orders, avgOrderCents, diamondsSold, refundedCents, refundedCount },
      chart,
      recent,
      breakdowns: { byPackSize, byPlayerTier, byRegion, byDayOfWeek: byDayOfWeekOrdered, newVsReturning },
      regionSource,
    });
  });

  // ── GET /admin/payments/:id — receipt detail for the modal ─────────────────
  app.get<{ Params: { id: string } }>("/admin/payments/:id", { preHandler: requireAdmin("SUPPORT") }, async (req) => {
    const p = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, username: true, displayName: true, tag: true, email: true } } },
    });
    if (!p || (p.status !== "settled" && p.status !== "refunded")) throw err.notFound("NO_PAYMENT", "Top-up not found");
    return ok({
      id: p.id,
      orderId: p.id,
      player: { id: p.user.id, name: p.user.displayName, tag: p.user.tag, username: p.user.username },
      diamonds: p.diamonds,
      amountCents: p.amountCents,
      currencyCode: p.currencyCode,
      provider: p.provider,
      status: p.status,
      refunded: p.status === "refunded",
      email: p.user.email,
      createdAt: p.settledAt ?? p.createdAt,
    });
  });

  // ── POST /admin/payments/:id/refund — ECONOMY-gated, server-enforced ───────
  const reasonSchema = z.object({ reason: z.string().trim().min(1, "reason required").max(500) });
  app.post<{ Params: { id: string } }>("/admin/payments/:id/refund", { preHandler: requireAdmin("ECONOMY") }, async (req) => {
    const { reason } = reasonSchema.parse(req.body);
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw err.notFound("NO_PAYMENT", "Top-up not found");
    if (payment.status === "refunded") throw err.badRequest("ALREADY_REFUNDED", "Already refunded.");
    if (payment.status !== "settled") throw err.badRequest("NOT_SETTLED", "Only settled top-ups can be refunded.");

    const player = await prisma.user.findUnique({ where: { id: payment.userId }, select: { id: true, displayName: true, username: true, tag: true } });
    if (!player) throw err.notFound("NO_USER", "Player not found");

    // Reverse the credited diamonds via the SAME ledger call the PayMongo
    // webhook's payment.refunded handler uses, then flip status atomically.
    // applyLedgerTx throws a plain Error("INSUFFICIENT_DIAMONDS") if the
    // player already spent them below zero — that's the ledger's existing
    // negative-balance guard. Unlike the webhook (which best-effort/catches
    // that so a refund event never crashes), the admin refund action should
    // fail loudly here so the admin knows it didn't complete — caught below
    // and translated into a clean 400 (same convention as seasons.ts).
    try {
      await prisma.$transaction(async (tx) => {
        const flip = await tx.payment.updateMany({ where: { id: payment.id, status: "settled" }, data: { status: "refunded" } });
        if (flip.count === 0) throw new Error("ALREADY_REFUNDED");
        await applyLedgerTx(tx, {
          userId: payment.userId,
          currency: "DIAMONDS",
          amount: -payment.diamonds,
          reason: "refund",
          refType: "payment",
          refId: `admin_refund_${payment.id}`,
        });
      });
    } catch (e) {
      if (e instanceof Error && e.message === "ALREADY_REFUNDED") throw err.badRequest("ALREADY_REFUNDED", "Already refunded.");
      if (e instanceof Error && e.message === "INSUFFICIENT_DIAMONDS")
        throw err.badRequest("INSUFFICIENT_DIAMONDS", "Player no longer has enough diamonds to reverse this top-up.");
      throw e;
    }

    await audit(prisma, {
      actorId: req.userId!,
      action: "finance.refund",
      targetType: "payment",
      targetId: payment.id,
      before: { status: "settled" },
      after: { status: "refunded", diamondsReversed: payment.diamonds },
      reason,
    });

    return ok({ id: payment.id, status: "refunded", player: { name: player.displayName, tag: player.tag } });
  });
}
