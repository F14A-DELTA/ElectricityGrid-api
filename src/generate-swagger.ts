import "dotenv/config";
import Fastify from "fastify";
import swagger from "@fastify/swagger";
import websocket from "@fastify/websocket";
import * as fs from "fs";
import * as path from "path";

import restRoutes from "./routes/rest";
import sseRoutes from "./routes/sse";
import wsRoutes from "./routes/ws";
import { swaggerOpenApi } from "./swagger";

async function generate(): Promise<void> {
  const fastify = Fastify({ logger: false });

  await fastify.register(swagger, {
    openapi: swaggerOpenApi,
  });

  await fastify.register(websocket);
  await fastify.register(restRoutes);
  await fastify.register(sseRoutes);
  await fastify.register(wsRoutes);

  await fastify.ready();

  const spec = fastify.swagger();

  const outputPath = path.resolve(__dirname, "../../swagger.json");
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));

  console.log(`swagger.json generated at: ${outputPath}`);

  await fastify.close();
}

generate().catch((err) => {
  console.error("Failed to generate swagger.json", err);
  process.exit(1);
});
