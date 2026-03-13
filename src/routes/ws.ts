import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

import { validateAuth } from "../auth";
import { latestSnapshot } from "../cache";
import { emitter } from "../poller";
import { round } from "../normalise";
import type {
  EnergySnapshot,
  LiveSnapshots,
  NetworkCode,
  RegionCode,
  RegionSnapshot,
  SnapshotEmissions,
  SnapshotSummary,
} from "../types";

type SubscriptionState = {
  regions: Set<string>;
  metrics: Set<string>;
};
