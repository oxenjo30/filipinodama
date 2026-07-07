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

  // oauth (empty ⇒ that provider is disabled, returns "not configured")
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  FACEBOOK_CLIENT_ID: z.string().default(""),
  FACEBOOK_CLIENT_SECRET: z.string().default(""),
  OAUTH_CALLBACK_BASE: z.string().default("http://localhost:4000"),

  // email (Resend). Empty ⇒ verification emails are logged, not sent.
  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("FilipinoDama Royal <no-reply@filipinodama.gg>"),

  // payments (PayMongo). Empty ⇒ diamond top-ups disabled.
  PAYMONGO_SECRET_KEY: z.string().default(""),
  PAYMONGO_WEBHOOK_SECRET: z.string().default(""),
  PAYMONGO_PUBLIC_KEY: z.string().default(""),

  // storage (Cloudflare R2 / S3). Empty ⇒ avatar upload disabled.
  S3_ENDPOINT: z.string().default(""),
  S3_BUCKET: z.string().default("dama-uploads"),
  S3_ACCESS_KEY: z.string().default(""),
  S3_SECRET_KEY: z.string().default(""),

  WEB_ORIGIN: z.string().default("http://localhost:5173"),
});

export const env = schema.parse(process.env);

export const isProd = env.NODE_ENV === "production";
/** Which optional integrations are configured (drives "not configured" responses). */
export const features = {
  googleOAuth: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  facebookOAuth: !!(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET),
  email: !!env.RESEND_API_KEY,
  payments: !!(env.PAYMONGO_SECRET_KEY && env.PAYMONGO_WEBHOOK_SECRET),
  storage: !!(env.S3_ENDPOINT && env.S3_ACCESS_KEY),
};
