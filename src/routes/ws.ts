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

function filterRegionByMetrics(regionData: RegionSnapshot, metrics: Set<string>): RegionSnapshot {
  if (metrics.size === 0) return regionData;

  return {
    price_dollar_per_mwh: metrics.has("price") ? regionData.price_dollar_per_mwh : null,
    demand_mw: metrics.has("demand_mw") ? regionData.demand_mw : null,
    summary: {
      net_generation_mw: metrics.has("generation_mw") ? regionData.summary.net_generation_mw : null,
      renewables_mw: metrics.has("renewables_pct") ? regionData.summary.renewables_mw : null,
      renewables_pct: metrics.has("renewables_pct") ? regionData.summary.renewables_pct : null,
      demand_mw: metrics.has("demand_mw") ? regionData.summary.demand_mw : null,
    },
    generation: metrics.has("generation_mw") || metrics.has("price") ? regionData.generation : [],
    loads: metrics.has("generation_mw") || metrics.has("price") ? regionData.loads : [],
    curtailment: metrics.has("generation_mw") ? regionData.curtailment : [],
    emissions:
      metrics.has("emissions_volume") || metrics.has("emission_intensity")
        ? regionData.emissions
        : { volume_tco2e_per_30m: null, intensity_kgco2e_per_mwh: null },
  };
}

function recomputeSummaryFromRegions(regions: RegionSnapshot[]): SnapshotSummary {
  let netGen = 0;
  let renewables = 0;
  let demand = 0;

  for (const r of regions) {
    netGen += r.summary.net_generation_mw ?? 0;
    renewables += r.summary.renewables_mw ?? 0;
    demand += r.summary.demand_mw ?? 0;
  }

  return {
    net_generation_mw: round(netGen, 1),
    renewables_mw: round(renewables, 1),
    renewables_pct: netGen > 0 ? round((renewables / netGen) * 100, 1) : null,
    demand_mw: round(demand, 1),
  };
}

function recomputeEmissionsFromRegions(regions: RegionSnapshot[]): SnapshotEmissions {
  let volume = 0;
  const intensities: number[] = [];

  for (const r of regions) {
    volume += r.emissions.volume_tco2e_per_30m ?? 0;
    if (typeof r.emissions.intensity_kgco2e_per_mwh === "number") {
      intensities.push(r.emissions.intensity_kgco2e_per_mwh);
    }
  }

  const avgIntensity =
    intensities.length > 0
      ? intensities.reduce((total, value) => total + value, 0) / intensities.length
      : null;

  return {
    volume_tco2e_per_30m: round(volume, 1),
    intensity_kgco2e_per_mwh: round(avgIntensity, 2),
  };
}
