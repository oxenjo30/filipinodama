import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { checkoutSchema } from "@dama/shared";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { env, features } from "../config/env.js";
import { requireAuth } from "../auth/guards.js";
import { applyLedger, applyLedgerTx } from "../economy/ledger.js";

/**
 * PayMongo payments — the ONLY path that credits Diamonds is the
 * signature-verified webhook, on the single event `checkout_session.payment.paid`
 * (we deliberately ignore `payment.paid` to avoid double-crediting). Amounts are
 * PHP centavos. If PayMongo keys are absent, checkout returns notConfigured.
 */

const DIAMOND_PACKS = [
  { id: "pack_diamonds_80", diamonds: 80, bonus: 0, priceCents: 4900, label: "Pouch" },
  { id: "pack_diamonds_250", diamonds: 250, bonus: 20, priceCents: 14900, label: "Sack" },
  { id: "pack_diamonds_550", diamonds: 550, bonus: 70, priceCents: 29900, label: "Chest" },
  { id: "pack_diamonds_1200", diamonds: 1200, bonus: 200, priceCents: 59900, label: "Vault" },
  { id: "pack_diamonds_2600", diamonds: 2600, bonus: 600, priceCents: 119900, label: "Hoard" },
] as const;

const PACK = (id: string) => DIAMOND_PACKS.find((p) => p.id === id);
const basicAuth = () => "Basic " + Buffer.from(`${env.PAYMONGO_SECRET_KEY}:`).toString("base64");

/** Verify the Paymongo-Signature header against the raw request body. */
function verifySignature(rawBody: string, header: string | undefined): boolean {
  if (!header || !env.PAYMONGO_WEBHOOK_SECRET) return false;
  // Header format: "t=<ts>,te=<sig>,li=<sig>" (te = test-mode, li = live-mode).
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const ts = parts.t;
  const sig = parts.te || parts.li;
  if (!ts || !sig) return false;
  const expected = createHmac("sha256", env.PAYMONGO_WEBHOOK_SECRET).update(`${ts}.${rawBody}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function paymentRoutes(app: FastifyInstance) {
  // Capture the RAW body for the webhook route so the signature can be verified.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as unknown as { rawBody?: string }).rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (e) {
      done(e as Error, undefined);
    }
  });

  // GET /api/payments/packs — the diamond top-up packs (public)
  app.get("/payments/packs", async () => ok({ packs: DIAMOND_PACKS, enabled: features.payments, currency: "PHP" }));

  // POST /api/payments/checkout — create a PayMongo Checkout Session, return its url
  app.post("/payments/checkout", { preHandler: requireAuth }, async (req) => {
    if (!features.payments) throw err.notConfigured("Payments");
    const { packId } = checkoutSchema.parse(req.body);
    const pack = PACK(packId);
    if (!pack) throw err.notFound("PACK_NOT_FOUND", "Diamond pack not found");
    const userId = req.userId!;
    const totalDiamonds = pack.diamonds + pack.bonus;

    // Record a pending Payment first so the webhook can settle it idempotently.
    const payment = await prisma.payment.create({
      data: {
        userId,
        provider: "paymongo",
        providerRef: `pending_${packId}_${userId}_${Date.now()}`,
        amountCents: pack.priceCents,
        currencyCode: "php",
        diamonds: totalDiamonds,
        status: "pending",
      },
    });

    const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: { Authorization: basicAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              { name: `${totalDiamonds} Diamonds — ${pack.label}`, amount: pack.priceCents, currency: "PHP", quantity: 1 },
            ],
            payment_method_types: ["gcash", "paymaya", "card"],
            success_url: `${env.WEB_ORIGIN}/store?purchase=success`,
            cancel_url: `${env.WEB_ORIGIN}/store?purchase=cancelled`,
            description: `FilipinoDama Royal — ${pack.label}`,
            metadata: { userId, packId, paymentId: payment.id, diamonds: String(totalDiamonds) },
          },
        },
      }),
    });
    if (!res.ok) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
      throw err.badRequest("CHECKOUT_FAILED", "Could not start checkout");
    }
    const json = (await res.json()) as { data: { id: string; attributes: { checkout_url: string } } };
    // Store the real checkout session id as the providerRef for reconciliation.
    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: json.data.id },
    });
    return ok({ url: json.data.attributes.checkout_url, checkoutId: json.data.id });
  });

  // POST /api/payments/webhook — the ONLY diamond-crediting path (signature-verified)
  app.post("/payments/webhook", async (req, reply) => {
    const raw = (req as unknown as { rawBody?: string }).rawBody ?? "";
    const sigHeader = req.headers["paymongo-signature"] as string | undefined;
    if (!verifySignature(raw, sigHeader)) {
      return reply.status(401).send({ ok: false, error: { code: "BAD_SIGNATURE", message: "Invalid signature" } });
    }

    const evt = JSON.parse(raw) as {
      data: { id: string; attributes: { type: string; data: { attributes: { metadata?: Record<string, string> } } } };
    };
    const eventId = evt.data.id;
    const type = evt.data.attributes.type;

    // Credit ONLY on checkout_session.payment.paid (ignore payment.paid → no double-credit).
    if (type === "checkout_session.payment.paid") {
      const meta = evt.data.attributes.data.attributes.metadata ?? {};
      const paymentId = meta.paymentId;

      if (paymentId) {
        const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
        if (payment) {
          // Settle + credit in ONE transaction, gated by a conditional
          // compare-and-swap on the Payment status. PayMongo retries and may
          // deliver the same event concurrently; only the ONE delivery that
          // actually flips pending→settled (count===1) credits diamonds — the
          // status column is the idempotency key, so no double-credit is
          // possible even without a DB-level ledger uniqueness constraint.
          await prisma.$transaction(async (tx) => {
            const flip = await tx.payment.updateMany({
              where: { id: payment.id, status: { not: "settled" } },
              data: { status: "settled", settledAt: new Date() },
            });
            if (flip.count === 0) return; // already settled by another delivery
            await applyLedgerTx(tx, {
              userId: payment.userId,
              currency: "DIAMONDS",
              amount: payment.diamonds,
              reason: "purchase",
              refType: "payment",
              refId: eventId,
            });
          });
        }
      }
    } else if (type === "payment.refunded") {
      // Reverse a settled purchase: revoke the credited diamonds.
      const meta = evt.data.attributes.data.attributes.metadata ?? {};
      const paymentId = meta.paymentId;
      if (paymentId) {
        const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
        if (payment && payment.status === "settled") {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: "refunded" } });
          await applyLedger(prisma, {
            userId: payment.userId,
            currency: "DIAMONDS",
            amount: -payment.diamonds,
            reason: "refund",
            refType: "payment",
            refId: `refund_${eventId}`,
          }).catch(() => {/* if they already spent them, balance guard applies */});
        }
      }
    }

    return reply.send({ ok: true });
  });
}
