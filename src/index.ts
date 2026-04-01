import "dotenv/config";
// import Fastify from "fastify";
// import websocket from "@fastify/websocket";
// import cors from "@fastify/cors";

import { warmCache } from "./cache";
import { startPoller } from "./poller";
// import restRoutes from "./routes/rest";
// import sseRoutes from "./routes/sse";
// import wsRoutes from "./routes/ws";
import { buildApp } from "./app";

function getRequiredEnv(name: string, fallbacks: string[] = []): string {
  const value = process.env[name] ?? fallbacks.map((fallback) => process.env[fallback]).find((candidate) => candidate);
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main(): Promise<void> {
  getRequiredEnv("OPENELECTRICITY_API_KEY");
  getRequiredEnv("S3_BUCKET", ["OBJECT_STORAGE_BUCKET"]);
  getRequiredEnv("AWS_REGION", ["OBJECT_STORAGE_REGION"]);
  getRequiredEnv("API_KEY");
  const port = Number(getRequiredEnv("PORT"));

  const fastify = await buildApp();

  await warmCache(["NEM", "WEM"]);
  fastify.log.info("Warm cache completed.");

  await fastify.listen({
    port,
    host: "0.0.0.0",
  });

  fastify.log.info("First poll is starting.");
  startPoller();
}

void main().catch((error) => {
  console.error("Failed to start server.", error);
  process.exit(1);
});
