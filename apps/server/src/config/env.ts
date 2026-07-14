import "dotenv/config";
import { z } from "zod";

/**
 * Environment config, zod-validated once at boot. Anything not set falls back to
 * a safe dev default where possible; secrets have no default (empty = feature
 * off). Import { env } anywhere on the server.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  JWT_ACCESS_SECRET: z.string().min(1).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(1).default("dev-refresh-secret-change-me"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Parent domain the auth cookies are scoped to, so the SPA (filipinodama.com)
  // and API (api.filipinodama.com) share them. Leave empty for same-origin/local.
  COOKIE_DOMAIN: z.string().default(""),

  // oauth (empty ⇒ that provider is disabled, returns "not configured")
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  FACEBOOK_CLIENT_ID: z.string().default(""),
  FACEBOOK_CLIENT_SECRET: z.string().default(""),
  OAUTH_CALLBACK_BASE: z.string().default("http://localhost:4000"),

  // email (Resend). Empty ⇒ verification emails are logged, not sent.
  // Sends come from the mail.filipinodama.com subdomain (verified in Resend).
  // EMAIL_FROM is env-overridable and will be admin-panel configurable later.
  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("FilipinoDama Royal <no-reply@mail.filipinodama.com>"),

  // payments (PayMongo). Empty ⇒ diamond top-ups disabled.
  PAYMONGO_SECRET_KEY: z.string().default(""),
  PAYMONGO_WEBHOOK_SECRET: z.string().default(""),
  PAYMONGO_PUBLIC_KEY: z.string().default(""),
  // Master key for encrypting admin-entered secrets (gateway credentials, Play
  // Billing service-account JSON) at rest in the Config table. Defaults to
  // JWT_ACCESS_SECRET so it works out of the box, but SET A DEDICATED VALUE in
  // production so secrets survive a JWT-secret rotation. Rotating this key makes
  // previously-encrypted admin secrets undecryptable (they must be re-entered).
  SECRETS_KEY: z.string().default(""),
  // Real-money diamond top-up master switch. Default OFF for legal compliance —
  // the store is gold-only. Set DIAMOND_TOPUP_ENABLED=true (with live PayMongo
  // keys) to reactivate buying diamonds. The PayMongo wiring stays intact and
  // dormant behind this flag; an admin toggle can later drive it.
  DIAMOND_TOPUP_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),

  // storage (Cloudflare R2 / S3). Empty ⇒ avatar upload disabled.
  S3_ENDPOINT: z.string().default(""),
  S3_BUCKET: z.string().default("dama-uploads"),
  S3_ACCESS_KEY: z.string().default(""),
  S3_SECRET_KEY: z.string().default(""),

  WEB_ORIGIN: z.string().default("http://localhost:5173"),
});

export const env = schema.parse(process.env);

export const isProd = env.NODE_ENV === "production";

/**
 * PRODUCTION SAFETY GATE. The JWT secrets and CORS origin have dev-friendly
 * defaults so local dev "just works" — but those defaults are published in this
 * repo, so booting production with them would let anyone forge a valid (even
 * admin) token and would open CORS to localhost. Refuse to start in production
 * unless real, non-default, sufficiently-strong values are supplied.
 */
const DEV_ACCESS_SECRET = "dev-access-secret-change-me";
const DEV_REFRESH_SECRET = "dev-refresh-secret-change-me";
const LOCALHOST_ORIGIN = "http://localhost:5173";
if (isProd) {
  const problems: string[] = [];
  if (env.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < 32)
    problems.push("JWT_ACCESS_SECRET must be set to a strong value (>=32 chars), not the dev default");
  if (env.JWT_REFRESH_SECRET === DEV_REFRESH_SECRET || env.JWT_REFRESH_SECRET.length < 32)
    problems.push("JWT_REFRESH_SECRET must be set to a strong value (>=32 chars), not the dev default");
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET)
    problems.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
  if (!env.CORS_ORIGIN || env.CORS_ORIGIN === LOCALHOST_ORIGIN)
    problems.push("CORS_ORIGIN must be set to the production web origin, not localhost");
  if (!env.WEB_ORIGIN || env.WEB_ORIGIN === LOCALHOST_ORIGIN)
    problems.push("WEB_ORIGIN must be set to the production web origin, not localhost");
  if (problems.length) {
    // Fail fast and loud — never boot an insecure production server.
    throw new Error(
      "FATAL: insecure production configuration:\n  - " + problems.join("\n  - ") +
        "\nSet these in the Railway service variables before deploying.",
    );
  }
}
/** Which optional integrations are configured (drives "not configured" responses). */
export const features = {
  googleOAuth: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  facebookOAuth: !!(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET),
  email: !!env.RESEND_API_KEY,
  // Real-money diamond top-up is available ONLY when explicitly enabled AND the
  // PayMongo keys are configured. Default: OFF (gold-only store).
  payments: env.DIAMOND_TOPUP_ENABLED && !!(env.PAYMONGO_SECRET_KEY && env.PAYMONGO_WEBHOOK_SECRET),
  storage: !!(env.S3_ENDPOINT && env.S3_ACCESS_KEY),
};
