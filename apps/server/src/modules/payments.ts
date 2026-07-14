import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { checkoutSchema } from "@dama/shared";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { env, features } from "../config/env.js";
import { requireAuth } from "../auth/guards.js";
import { applyLedger, applyLedgerTx } from "../economy/ledger.js";
import { getCredential } from "../lib/gateway-credentials.js";
import { getPlayBillingRuntime, packForPlayProduct } from "../lib/play-billing-config.js";
import { verifyPlayPurchase } from "../lib/play-verify.js";

/**
 * PayMongo payments — the ONLY path that credits Diamonds is the
 * signature-verified webhook, on the single event `checkout_session.payment.paid`
 * (we deliberately ignore `payment.paid` to avoid double-crediting). Amounts are
 * PHP centavos. If PayMongo keys are absent, checkout returns notConfigured.
 *
 * ── Monetization dark-launch (2026-07-12) ──
 * The full diamond top-up feature (this module, the web Store "Currency" tab +
 * TopUpModal, the AppLayout diamond pill/top-up button, and Purchase History
 * top-up receipts in GET /api/orders) is built and production-ready, but ships
 * DARK: hidden from every player until the owner clears it for legal reasons.
 *
 * The single master switch is `DIAMOND_TOPUP_ENABLED` (config/env.ts), combined
 * with the presence of PayMongo keys into `features.payments`:
 *   features.payments = DIAMOND_TOPUP_ENABLED && PAYMONGO_SECRET_KEY && PAYMONGO_WEBHOOK_SECRET
 * `/payments/checkout` throws notConfigured and `/payments/packs` reports
 * `enabled:false` whenever `features.payments` is false — this is enforced HERE,
 * server-side, not by the client hiding a button. The client mirrors the same
 * gate for UX (GET /api/auth/providers → `diamondTopUp`, and GET
 * /api/config/public → `DIAMOND_TOPUP_ENABLED`), so the "Get Diamonds" UI never
 * even renders while dark, but the server-side gate is what actually protects it.
 *
 * To go live: in Railway, set `DIAMOND_TOPUP_ENABLED=true` AND swap
 * `PAYMONGO_WEBHOOK_SECRET` to PayMongo's LIVE webhook secret (Test and Live
 * webhooks are separate — see the paymongo-webhook-modes lesson; a mode mismatch
 * silently drops every credit). No other switch exists by design — there is no
 * admin runtime toggle. The webhook's crediting/verification logic never changes
 * and needs no redeploy-time edits; it starts firing for real the moment the env
 * flag flips. The admin dashboard/refunds/gateways panels already read live
 * Payment rows, so they light up automatically once real payments start flowing.
 */

export const DIAMOND_PACKS = [
  { id: "pack_diamonds_80", diamonds: 80, bonus: 0, priceCents: 4900, label: "Pouch" },
  { id: "pack_diamonds_250", diamonds: 250, bonus: 20, priceCents: 14900, label: "Sack" },
  { id: "pack_diamonds_550", diamonds: 550, bonus: 70, priceCents: 29900, label: "Chest" },
  { id: "pack_diamonds_1200", diamonds: 1200, bonus: 200, priceCents: 59900, label: "Vault" },
  { id: "pack_diamonds_2600", diamonds: 2600, bonus: 600, priceCents: 119900, label: "Hoard" },
] as const;

const PACK = (id: string) => DIAMOND_PACKS.find((p) => p.id === id);
// PayMongo credentials resolve "admin overrides env": an admin-entered key
// (encrypted at rest) wins; otherwise fall back to the PAYMONGO_* env var.
const basicAuth = async () =>
  "Basic " + Buffer.from(`${await getCredential("paymongo.secretKey")}:`).toString("base64");

/** Verify the Paymongo-Signature header against the raw request body, using the
 *  supplied webhook secret (resolved by the caller: stored-or-env). */
function verifySignature(rawBody: string, header: string | undefined, webhookSecret: string): boolean {
  if (!header || !webhookSecret) return false;
  // Header format: "t=<ts>,te=<sig>,li=<sig>" (te = test-mode, li = live-mode).
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const ts = parts.t;
  const sig = parts.te || parts.li;
  if (!ts || !sig) return false;
  const expected = createHmac("sha256", webhookSecret).update(`${ts}.${rawBody}`).digest("hex");
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

  // POST /api/payments/play/verify — Android Google Play Billing verification.
  // The app sends the completed purchase; we verify it against the Play Developer
  // API using the admin-configured service account, then credit diamonds ONCE
  // (idempotent on the purchase token via Payment.providerRef's unique index).
  // This is the ONLY Play-billing crediting path. Disabled → 503.
  app.post("/payments/play/verify", { preHandler: requireAuth }, async (req) => {
    const runtime = await getPlayBillingRuntime();
    if (!runtime.enabled) throw err.notConfigured("Google Play Billing");
    if (req.isGuest) throw err.forbidden("GUEST_CANNOT_TOPUP", "Sign in to buy diamonds.");

    const body = z
      .object({ productId: z.string().min(1), purchaseToken: z.string().min(1) })
      .parse(req.body);
    const userId = req.userId!;

    // Map the Play product id → our diamond pack (admin-configured mapping).
    const pack = await packForPlayProduct(body.productId);
    if (!pack) throw err.badRequest("UNKNOWN_PRODUCT", "That product is not mapped to a diamond pack.");
    const totalDiamonds = pack.diamonds + pack.bonus;

    // Verify with Google. nowSec passed explicitly (Date read here at the edge).
    const nowSec = Math.floor(Date.now() / 1000);
    const result = await verifyPlayPurchase(runtime.packageName, body.productId, body.purchaseToken, nowSec);
    if (!result.ok) {
      // Retriable (token/network/Google 5xx) vs a genuinely invalid purchase.
      // Both surface as 400 (no badGateway helper exists) but with distinct
      // codes so the client can decide whether to retry.
      throw err.badRequest(
        result.retriable ? "PLAY_VERIFY_UNAVAILABLE" : "PLAY_PURCHASE_INVALID",
        result.error,
      );
    }
    if (result.purchaseState !== 0) {
      // 1 = canceled, 2 = pending — never credit.
      throw err.badRequest("PLAY_PURCHASE_NOT_COMPLETE", "Purchase is not in a completed state.");
    }

    // Idempotent credit: providerRef = the purchase token (globally unique). A
    // retry (same token) hits the unique constraint and credits nothing extra.
    const providerRef = `play_${body.purchaseToken}`;
    let credited = false;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { providerRef } });
      if (existing) return; // already recorded/credited by an earlier call
      await tx.payment.create({
        data: {
          userId,
          provider: "play",
          providerRef,
          amountCents: pack.priceCents,
          currencyCode: "usd", // Play prices are set in the store; our pack price is the reference
          diamonds: totalDiamonds,
          status: "settled",
          settledAt: new Date(),
        },
      });
      await applyLedgerTx(tx, {
        userId,
        currency: "DIAMONDS",
        amount: totalDiamonds,
        reason: "topup.play",
        refType: "play_purchase",
        refId: providerRef,
      });
      credited = true;
    });

    return ok({
      credited,
      alreadyProcessed: !credited,
      diamonds: totalDiamonds,
      // Tell the client it's safe to acknowledge/consume the purchase with Play.
      acknowledged: result.acknowledgementState === 1,
    });
  });

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
      headers: { Authorization: await basicAuth(), "Content-Type": "application/json" },
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
    const webhookSecret = await getCredential("paymongo.webhookSecret");
    if (!verifySignature(raw, sigHeader, webhookSecret)) {
      return reply.status(401).send({ ok: false, error: { code: "BAD_SIGNATURE", message: "Invalid signature" } });
    }

    // Signature is valid. From here on, ANY event we cannot process (unknown
    // type, malformed body, missing fields) must still return 200 so PayMongo
    // stops retrying — only a bad signature earns a non-2xx (the 401 above).
    try {
      const evt = JSON.parse(raw) as {
        data: {
          id: string;
          attributes: {
            type: string;
            data: {
              id?: string;
              attributes: {
                metadata?: Record<string, string>;
                // On a refund event this is the Refund resource; it carries the
                // id of the payment it reverses (shape varies by API version).
                payment_id?: string;
                checkout_session_id?: string;
                payment?: { id?: string; attributes?: { checkout_session_id?: string; metadata?: Record<string, string> } };
              };
            };
          };
        };
      };
      const eventId = evt.data.id;
      const type = evt.data.attributes.type;
      const inner = evt.data.attributes.data;

      // Credit ONLY on checkout_session.payment.paid (ignore payment.paid → no double-credit).
      if (type === "checkout_session.payment.paid") {
        const meta = inner.attributes.metadata ?? {};
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
        //
        // Refund events do NOT carry the original checkout metadata, so we
        // canNOT rely on metadata.paymentId here — that lookup would no-op and
        // diamonds would never be clawed back. Instead we resolve the Payment
        // by its providerRef, which at checkout we set to the PayMongo checkout
        // session id (see the checkout handler's payment.update). We pull every
        // provider id the refund payload might expose and match on any of them.
        const a = inner.attributes;
        const candidateRefs = [
          a.checkout_session_id,
          a.payment?.attributes?.checkout_session_id,
          a.payment_id,
          a.payment?.id,
          inner.id, // the refund/payment resource id itself
        ].filter((v): v is string => typeof v === "string" && v.length > 0);

        // Best-effort: metadata may still ride along on the nested payment resource.
        const refundMeta = a.payment?.attributes?.metadata ?? a.metadata ?? {};
        const metaPaymentId = refundMeta.paymentId;

        let payment = metaPaymentId
          ? await prisma.payment.findUnique({ where: { id: metaPaymentId } })
          : null;
        if (!payment && candidateRefs.length > 0) {
          payment = await prisma.payment.findFirst({
            where: { provider: "paymongo", providerRef: { in: candidateRefs } },
          });
        }
        // TODO: if candidateRefs is empty AND no metadata is present for a given
        // PayMongo API version, the refund cannot be matched to a Payment here;
        // reconcile such refunds out-of-band (e.g. a periodic PayMongo refund sync).

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
    } catch {
      // Malformed/unexpected payload — acknowledge so PayMongo stops retrying.
      return reply.send({ ok: true });
    }

    return reply.send({ ok: true });
  });
}
