import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

import { validateAuth } from "../auth";
import { latestSnapshot } from "../cache";
import { emitter } from "../poller";

const sseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/v1/events", async (request, reply) => {
    if (!validateAuth(request)) {
      reply.code(401).send({ success: false, error: "Unauthorized" });
      return;
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: string, data: unknown): void => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent("connected", {
      timestamp: new Date().toISOString(),
      snapshot: latestSnapshot,
    });

    const handler = (snapshots: unknown) => {
      sendEvent("energy_update", snapshots);
    };

    const heartbeat = setInterval(() => {
      sendEvent("heartbeat", { timestamp: new Date().toISOString() });
    }, 30000);

    emitter.on("update", handler);

    request.raw.on("close", () => {
      emitter.off("update", handler);
      clearInterval(heartbeat);
      reply.raw.end();
    });
  });
};

export default fp(sseRoutes);
