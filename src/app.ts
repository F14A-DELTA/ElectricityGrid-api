// src/app.ts
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
// import swaggerUi from "@fastify/swagger-ui";

import restRoutes from "./routes/rest";
import sseRoutes from "./routes/sse";
import wsRoutes from "./routes/ws";
// import { swaggerOpenApi } from "./swagger";

export async function buildApp() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: true });
  // await fastify.register(swagger, { openapi: swaggerOpenApi });
  // await fastify.register(swaggerUi, { routePrefix: "/docs" });
  await fastify.register(websocket);
  await fastify.register(restRoutes);
  await fastify.register(sseRoutes);
  await fastify.register(wsRoutes);

  return fastify;
}