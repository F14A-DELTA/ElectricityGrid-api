import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { enforceAuth } from "../auth";
import { latestSnapshot, recentBuffer } from "../cache";
import { lastPollAt } from "../poller";
import { computeStats, queryHistory } from "../s3-query";
import type { HistoryQueryParams, NetworkCode } from "../types";

const VALID_NETWORKS = new Set<NetworkCode>(["NEM", "WEM"]);
const VALID_REGIONS = new Set(["NSW1", "QLD1", "VIC1", "SA1", "TAS1", "WEM"]);
const VALID_RANGES = new Set<HistoryQueryParams["range"]>(["24h", "7d", "30d", "90d"]);
const VALID_INTERVALS = new Set<HistoryQueryParams["interval"]>(["5m", "1h", "1d"]);
const VALID_METRICS = new Set<HistoryQueryParams["metric"]>([
  "generation_mw",
  "price",
  "emissions_volume",
  "emission_intensity",
  "demand_mw",
  "renewables_pct",
]);

function updatedAtForResponse(network?: NetworkCode): string {
  if (network && latestSnapshot?.[network]) {
    return latestSnapshot[network]!.updated_at;
  }

  const timestamps = Object.values(latestSnapshot ?? {})
    .map((snapshot) => snapshot.updated_at)
    .sort();

  return timestamps.at(-1) ?? new Date().toISOString();
}

function sendSuccess(reply: FastifyReply, payload: unknown, updatedAt: string) {
  return reply.send({
    success: true,
    updated_at: updatedAt,
    data: payload,
  });
}

const restRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.method === "GET" && request.url.startsWith("/v1/health")) {
      return;
    }

    await enforceAuth(request, reply);
  });

  fastify.get("/v1/health", async (_request, reply) => {
    return sendSuccess(
      reply,
      {
        uptime: process.uptime(),
        last_poll_at: lastPollAt ? lastPollAt.toISOString() : null,
        buffer_size: recentBuffer.length,
        status: "ok",
      },
      new Date().toISOString(),
    );
  });

  fastify.get("/v1/live", async (request, reply) => {
    const query = request.query as { network?: NetworkCode };

    if (!latestSnapshot || Object.keys(latestSnapshot).length === 0) {
      return reply.code(503).send({ success: false, error: "Cache not yet warm" });
    }

    if (query.network) {
      if (!VALID_NETWORKS.has(query.network)) {
        return reply.code(400).send({ success: false, error: "Invalid network" });
      }

      const snapshot = latestSnapshot[query.network];
      if (!snapshot) {
        return reply.code(404).send({ success: false, error: "Snapshot not available" });
      }

      return sendSuccess(reply, snapshot, snapshot.updated_at);
    }

    return sendSuccess(reply, latestSnapshot, updatedAtForResponse());
  });

  fastify.get("/v1/live/region/:region", async (request, reply) => {
    const params = request.params as { region: string };

    if (!VALID_REGIONS.has(params.region)) {
      return reply.code(404).send({ success: false, error: "Unknown region" });
    }

    if (!latestSnapshot || Object.keys(latestSnapshot).length === 0) {
      return reply.code(503).send({ success: false, error: "Cache not yet warm" });
    }

    const network: NetworkCode = params.region === "WEM" ? "WEM" : "NEM";
    const snapshot = latestSnapshot[network];
    const regionData = snapshot?.regions[params.region as keyof typeof snapshot.regions];

    if (!snapshot || !regionData) {
      return reply.code(404).send({ success: false, error: "Region snapshot not available" });
    }

    return sendSuccess(
      reply,
      {
        region: params.region,
        network,
        updated_at: snapshot.updated_at,
        ...regionData,
      },
      snapshot.updated_at,
    );
  });

  fastify.get("/v1/live/price", async (_request, reply) => {
    if (!latestSnapshot || Object.keys(latestSnapshot).length === 0) {
      return reply.code(503).send({ success: false, error: "Cache not yet warm" });
    }

    const prices = Object.entries(latestSnapshot).flatMap(([network, snapshot]) =>
      Object.entries(snapshot.regions).map(([region, regionData]) => ({
        network,
        region,
        price_dollar_per_mwh: regionData?.price_dollar_per_mwh ?? null,
        demand_mw: regionData?.demand_mw ?? null,
      })),
    );

    return sendSuccess(reply, prices, updatedAtForResponse());
  });

  fastify.get("/v1/stats", async (request, reply) => {
    const query = request.query as { range?: "7d" | "30d" | "90d" | "24h"; network?: NetworkCode; region?: string };
    const range = query.range ?? "7d";
    const network = query.network ?? "NEM";

    if (range === "24h" || !VALID_RANGES.has(range) || !VALID_NETWORKS.has(network)) {
      return reply.code(400).send({ success: false, error: "Invalid stats query" });
    }

    const stats = await computeStats(network, range, query.region);
    return sendSuccess(reply, stats, updatedAtForResponse(network));
  });

  fastify.get("/v1/history", async (request, reply) => {
    const query = request.query as Partial<HistoryQueryParams>;
    const metric = query.metric;
    const interval = query.interval ?? "1h";
    const range = query.range ?? "7d";
    const network = query.network ?? "NEM";

    if (!metric || !VALID_METRICS.has(metric) || !VALID_INTERVALS.has(interval) || !VALID_RANGES.has(range) || !VALID_NETWORKS.has(network)) {
      return reply.code(400).send({ success: false, error: "Invalid history query" });
    }

    const series = await queryHistory({
      metric,
      interval,
      range,
      network,
      region: query.region,
      fueltech: query.fueltech,
    });

    return sendSuccess(
      reply,
      {
        metric,
        interval,
        range,
        series,
      },
      updatedAtForResponse(network),
    );
  });
};

export default fp(restRoutes);
