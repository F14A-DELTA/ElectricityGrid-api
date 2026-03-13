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
 
  satisfies
  satisfiess

  satisfies
  webkitURLg

  AbortSignalg
  arguments3


  ef