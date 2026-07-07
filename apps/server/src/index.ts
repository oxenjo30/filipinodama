import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { Server as IOServer } from "socket.io";
import { env, isProd } from "./config/env.js";
import { prisma } from "./db/client.js";
import { ApiError, fail } from "./lib/errors.js";
import { authRoutes } from "./auth/routes.js";
import { userRoutes } from "./modules/users.js";
import { friendRoutes } from "./modules/friends.js";
import { guildRoutes } from "./modules/guilds.js";
import { storeRoutes } from "./modules/store.js";
import { questRoutes } from "./modules/quests.js";
import { seasonRoutes } from "./modules/seasons.js";
import { leaderboardRoutes } from "./modules/leaderboard.js";
import { matchRoutes } from "./modules/matches.js";
import { learnRoutes } from "./modules/learn.js";
import { notificationRoutes } from "./modules/notifications.js";
import { paymentRoutes } from "./modules/payments.js";
import { registerRealtime } from "./realtime/index.js";

export { prisma };

async function main() {
  const app = Fastify({ logger: true });

  // Security headers. This is a JSON API (no first-party HTML), so the default
  // CSP is unnecessary and would only complicate the separately-served SPA;
  // HSTS is enabled only in production (behind Railway TLS).
  await app.register(helmet, {
    contentSecurityPolicy: false,
    hsts: isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(cookie);

  // Global rate limit — a sane ceiling on every route (keyed by client IP).
  // Auth routes add their own stricter per-route limits via config in routes.ts.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    // The PayMongo webhook must never be throttled (their retries are legitimate).
    allowList: (req) => req.url.startsWith("/api/payments/webhook"),
  });

  // Uniform error envelope: ApiError → its status; ZodError → 400; else 500.
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ApiError) return reply.status(error.status).send(fail(error.code, error.message));
    if (error instanceof ZodError)
      return reply.status(400).send(fail("VALIDATION", error.issues.map((i) => i.message).join("; ")));
    app.log.error(error);
    return reply.status(500).send(fail("INTERNAL", "Something went wrong"));
  });

  app.get("/health", async () => ({ ok: true, ts: Date.now() }));

  // ── feature modules (REST) ──
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes, { prefix: "/api" });
  await app.register(friendRoutes, { prefix: "/api" });
  await app.register(guildRoutes, { prefix: "/api" });
  await app.register(storeRoutes, { prefix: "/api" });
  await app.register(questRoutes, { prefix: "/api" });
  await app.register(seasonRoutes, { prefix: "/api" });
  await app.register(leaderboardRoutes, { prefix: "/api" });
  await app.register(matchRoutes, { prefix: "/api" });
  await app.register(learnRoutes, { prefix: "/api" });
  await app.register(notificationRoutes, { prefix: "/api" });
  await app.register(paymentRoutes, { prefix: "/api" });
  // more modules register here as they land

  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  const io = new IOServer(app.server, {
    path: "/rt",
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });
  registerRealtime(io);

  app.log.info(`FilipinoDama server listening on :${env.PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
