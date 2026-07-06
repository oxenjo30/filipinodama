import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { Server as IOServer } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { registerRealtime } from "./realtime/index.js";

export const prisma = new PrismaClient();
const PORT = Number(process.env.PORT ?? 4000);

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true, credentials: true });
  await app.register(cookie);

  app.get("/health", async () => ({ ok: true, ts: Date.now() }));

  // TODO: register module routes here as you build them (ROADMAP M2+)
  // await app.register(authRoutes, { prefix: "/api/auth" });
  // await app.register(storeRoutes, { prefix: "/api/store" });
  // ...

  // Stripe webhook needs the RAW body — register with a content-type parser
  // before the JSON parser. See modules/payments.
  // app.post("/api/payments/webhook", { config: { rawBody: true } }, paymentsWebhook);

  await app.listen({ port: PORT, host: "0.0.0.0" });

  const io = new IOServer(app.server, {
    path: "/rt",
    cors: { origin: process.env.CORS_ORIGIN ?? true, credentials: true },
  });
  // In production attach the Redis adapter so multiple instances share rooms:
  //   import { createAdapter } from "@socket.io/redis-adapter";
  //   io.adapter(createAdapter(pub, sub));
  registerRealtime(io);

  app.log.info(`FilipinoDama server listening on :${PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
