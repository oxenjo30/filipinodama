import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { ZodError } from "zod";
import { Server as IOServer } from "socket.io";
import { env } from "./config/env.js";
import { prisma } from "./db/client.js";
import { ApiError, fail } from "./lib/errors.js";
import { authRoutes } from "./auth/routes.js";
import { registerRealtime } from "./realtime/index.js";

export { prisma };

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(cookie);

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
  // more modules register here as they land (users, store, friends, guilds, …)

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
