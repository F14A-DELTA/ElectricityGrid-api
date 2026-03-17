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

const summarySchema = {
  type: "object",
  properties: {
    net_generation_mw: { type: "number", nullable: true },
    renewables_mw:     { type: "number", nullable: true },
    renewables_pct:    { type: "number", nullable: true },
    demand_mw:         { type: "number", nullable: true },
  },
};
 
const emissionsSchema = {
  type: "object",
  properties: {
    volume_tco2e_per_30m:     { type: "number", nullable: true },
    intensity_kgco2e_per_mwh: { type: "number", nullable: true },
  },
};
 
const generationItemSchema = {
  type: "object",
  properties: {
    fueltech:             { type: "string" },
    label:                { type: "string" },
    power_mw:             { type: "number", nullable: true },
    proportion_pct:       { type: "number", nullable: true },
    price_dollar_per_mwh: { type: "number", nullable: true },
    total_energy_mwh:     { type: "number", nullable: true },
  },
};
 
const curtailmentItemSchema = {
  type: "object",
  properties: {
    fueltech:       { type: "string" },
    label:          { type: "string" },
    power_mw:       { type: "number", nullable: true },
    proportion_pct: { type: "number", nullable: true },
  },
};
 
const regionSnapshotSchema = {
  type: "object",
  properties: {
    price_dollar_per_mwh: { type: "number", nullable: true },
    demand_mw:            { type: "number", nullable: true },
    summary:              summarySchema,
    emissions:            emissionsSchema,
    generation:           { type: "array", items: generationItemSchema },
    loads:                { type: "array", items: generationItemSchema },
    curtailment:          { type: "array", items: curtailmentItemSchema },
  },
};
 
const energySnapshotSchema = {
  type: "object",
  properties: {
    updated_at:  { type: "string", format: "date-time" },
    network:     { type: "string", enum: ["NEM", "WEM"] },
    summary:     summarySchema,
    emissions:   emissionsSchema,
    generation:  { type: "array", items: generationItemSchema },
    loads:       { type: "array", items: generationItemSchema },
    curtailment: { type: "array", items: curtailmentItemSchema },
    regions: {
      type: "object",
      additionalProperties: regionSnapshotSchema,
    },
  },
};
 
const errorSchema = {
  type: "object",
  properties: {
    success: { type: "boolean", example: false },
    error:   { type: "string" },
  },
};
 
const rangeStatSchema = {
  type: "object",
  properties: {
    min: {
      type: "object",
      properties: {
        value:     { type: "number", nullable: true },
        timestamp: { type: "string", nullable: true },
      },
    },
    max: {
      type: "object",
      properties: {
        value:     { type: "number", nullable: true },
        timestamp: { type: "string", nullable: true },
      },
    },
  },
};

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

  fastify.get("/v1/health", {
    schema: {
      summary: "Health check",
      tags: ["System"],
      security: [],
      response: {
        200: {
          description: "Server is healthy",
          type: "object",
          properties: {
            success:    { type: "boolean", example: true },
            updated_at: { type: "string", format: "date-time" },
            data: {
              type: "object",
              properties: {
                uptime:       { type: "number" },
                last_poll_at: { type: "string", format: "date-time" },
                buffer_size:  { type: "integer" },
                status:       { type: "string", example: "ok" },
              },
            },
          },
        },
      },
    },
  }, async (_request, reply) => {
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

  fastify.get("/v1/live", {
     schema: {
      summary: "Live snapshot for all networks or a specific network",
      description: "Returns the latest energy snapshot. Optionally filter to a single network (NEM or WEM).",
      tags: ["Live Data"],
      querystring: {
        type: "object",
        properties: {
          network: {
            type: "string",
            enum: ["NEM", "WEM"],
            description: "Filter results to a specific network",
          },
        },
      },
      response: {
        200: {
          description: "Live snapshot data",
          type: "object",
          properties: {
            success:    { type: "boolean", example: true },
            updated_at: { type: "string", format: "date-time" },
            data: {
              type: "object",
              description: "Map of network code to EnergySnapshot",
              additionalProperties: energySnapshotSchema,
            },
          },
        },
        400: { description: "Invalid network code",   ...errorSchema },
        404: { description: "Snapshot not available", ...errorSchema },
        503: { description: "Cache not yet warm",     ...errorSchema },
      },
    },
  }, async (request, reply) => {
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

  fastify.get("/v1/live/region/:region", {
    schema: {
      summary: "Live snapshot for a specific region",
      description: "Returns the latest energy snapshot for a single NEM/WEM region including generation mix, price, demand, and emissions.",
      tags: ["Live Data"],
      params: {
        type: "object",
        required: ["region"],
        properties: {
          region: {
            type: "string",
            enum: ["NSW1", "QLD1", "VIC1", "SA1", "TAS1", "WEM"],
            description: "Region code",
          },
        },
      },
      response: {
        200: {
          description: "Region snapshot data",
          type: "object",
          properties: {
            success:    { type: "boolean", example: true },
            updated_at: { type: "string", format: "date-time" },
            data: {
              type: "object",
              properties: {
                region:               { type: "string", example: "NSW1" },
                network:              { type: "string", enum: ["NEM", "WEM"] },
                updated_at:           { type: "string", format: "date-time" },
                price_dollar_per_mwh: { type: "number", nullable: true },
                demand_mw:            { type: "number", nullable: true },
                summary:              summarySchema,
                emissions:            emissionsSchema,
                generation:           { type: "array", items: generationItemSchema },
                loads:                { type: "array", items: generationItemSchema },
                curtailment:          { type: "array", items: curtailmentItemSchema },
              },
            },
          },
        },
        404: { description: "Unknown or unavailable region", ...errorSchema },
        503: { description: "Cache not yet warm",            ...errorSchema },
      },
    },
  }, async (request, reply) => {
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

  fastify.get("/v1/live/price", {
    schema: {
      summary: "Live price and demand across all regions",
      description: "Returns the current spot price ($/MWh) and demand (MW) for every available region across all networks.",
      tags: ["Live Data"],
      response: {
        200: {
          description: "Price and demand for all regions",
          type: "object",
          properties: {
            success:    { type: "boolean", example: true },
            updated_at: { type: "string", format: "date-time" },
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  network:              { type: "string", enum: ["NEM", "WEM"] },
                  region:               { type: "string", example: "NSW1" },
                  price_dollar_per_mwh: { type: "number", nullable: true },
                  demand_mw:            { type: "number", nullable: true },
                },
              },
            },
          },
        },
        503: { description: "Cache not yet warm", ...errorSchema },
      },
    },
  }, async (_request, reply) => {
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

  fastify.get("/v1/stats", {
    schema: {
      summary: "Aggregated network statistics over a time range",
      description: "Returns min/max statistics for demand, renewables percentage, and price. Note: 24h range is not supported — use /v1/history instead.",
      tags: ["Historical Data"],
      querystring: {
        type: "object",
        properties: {
          network: {
            type: "string",
            enum: ["NEM", "WEM"],
            default: "NEM",
            description: "Network to query",
          },
          range: {
            type: "string",
            enum: ["7d", "30d", "90d"],
            default: "7d",
            description: "Time range (24h not supported for stats)",
          },
          region: {
            type: "string",
            enum: ["NSW1", "QLD1", "VIC1", "SA1", "TAS1", "WEM"],
            description: "Optional — filter to a specific region",
          },
        },
      },
      response: {
        200: {
          description: "Network statistics",
          type: "object",
          properties: {
            success:    { type: "boolean", example: true },
            updated_at: { type: "string", format: "date-time" },
            data: {
              type: "object",
              properties: {
                demand_mw:      rangeStatSchema,
                renewables_pct: rangeStatSchema,
                price:          rangeStatSchema,
              },
            },
          },
        },
        400: { description: "Invalid query params", ...errorSchema },
      },
    },
  }, async (request, reply) => {
    const query = request.query as { range?: "7d" | "30d" | "90d" | "24h"; network?: NetworkCode; region?: string };
    const range = query.range ?? "7d";
    const network = query.network ?? "NEM";

    if (range === "24h" || !VALID_RANGES.has(range) || !VALID_NETWORKS.has(network)) {
      return reply.code(400).send({ success: false, error: "Invalid stats query" });
    }

    const stats = await computeStats(network, range, query.region);
    return sendSuccess(reply, stats, updatedAtForResponse(network));
  });

  fastify.get("/v1/history", {
    schema: {
      summary: "Time series history for a specific metric",
      description: "Returns a time series array for the requested metric, aggregated at the specified interval over the given range. Optionally filter by region or fuel technology.",
      tags: ["Historical Data"],
      querystring: {
        type: "object",
        required: ["metric"],
        properties: {
          metric: {
            type: "string",
            enum: ["generation_mw", "price", "emissions_volume", "emission_intensity", "demand_mw", "renewables_pct"],
            description: "The metric to retrieve time series data for",
          },
          interval: {
            type: "string",
            enum: ["5m", "1h", "1d"],
            default: "1h",
            description: "Aggregation interval",
          },
          range: {
            type: "string",
            enum: ["24h", "7d", "30d", "90d"],
            default: "7d",
            description: "Time window to query",
          },
          network: {
            type: "string",
            enum: ["NEM", "WEM"],
            default: "NEM",
            description: "Network to query",
          },
          region: {
            type: "string",
            enum: ["NSW1", "QLD1", "VIC1", "SA1", "TAS1", "WEM"],
            description: "Optional — filter to a specific region",
          },
          fueltech: {
            type: "string",
            description: "Optional — filter by fuel technology e.g. solar, wind, coal, gas_ccgt",
          },
        },
      },
      response: {
        200: {
          description: "Time series data",
          type: "object",
          properties: {
            success:    { type: "boolean", example: true },
            updated_at: { type: "string", format: "date-time" },
            data: {
              type: "object",
              properties: {
                metric:   { type: "string", example: "price" },
                interval: { type: "string", example: "1h" },
                range:    { type: "string", example: "7d" },
                series: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      timestamp: { type: "string", format: "date-time" },
                      value:     { type: "number", nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Invalid query params — metric is required", ...errorSchema },
      },
    },
  }, async (request, reply) => {
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
