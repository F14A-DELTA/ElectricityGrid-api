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

function mergeGenerationArrays(regions: RegionSnapshot[]): EnergySnapshot["generation"] {
  const fueltechMap = new Map<string, { power: number; energy: number; label: string }>();

  for (const r of regions) {
    for (const item of r.generation) {
      const existing = fueltechMap.get(item.fueltech) ?? { power: 0, energy: 0, label: item.label };
      existing.power += item.power_mw ?? 0;
      existing.energy += item.total_energy_mwh ?? 0;
      fueltechMap.set(item.fueltech, existing);
    }
  }

  const totalPower = Array.from(fueltechMap.values()).reduce((t, i) => t + Math.max(0, i.power), 0);

  return Array.from(fueltechMap.entries()).map(([fueltech, item]) => ({
    fueltech,
    label: item.label,
    power_mw: round(item.power, 1),
    proportion_pct: totalPower > 0 ? round((item.power / totalPower) * 100, 1) : null,
    price_dollar_per_mwh: null,
    total_energy_mwh: round(item.energy, 1),
  }));
}

function mergeLoadsArrays(regions: RegionSnapshot[]): EnergySnapshot["loads"] {
  const fueltechMap = new Map<string, { power: number; energy: number; label: string }>();
  let totalNetGen = 0;

  for (const r of regions) {
    totalNetGen += r.summary.net_generation_mw ?? 0;
    for (const item of r.loads) {
      const existing = fueltechMap.get(item.fueltech) ?? { power: 0, energy: 0, label: item.label };
      existing.power += item.power_mw ?? 0;
      existing.energy += item.total_energy_mwh ?? 0;
      fueltechMap.set(item.fueltech, existing);
    }
  }

  return Array.from(fueltechMap.entries()).map(([fueltech, item]) => ({
    fueltech,
    label: item.label,
    power_mw: round(item.power, 1),
    proportion_pct: totalNetGen > 0 ? round((item.power / totalNetGen) * 100, 1) : null,
    price_dollar_per_mwh: null,
    total_energy_mwh: round(item.energy, 1),
  }));
}

function mergeCurtailmentArrays(regions: RegionSnapshot[]): EnergySnapshot["curtailment"] {
  const curtailMap = new Map<string, { power: number; label: string }>();
  let totalNetGen = 0;

  for (const r of regions) {
    totalNetGen += r.summary.net_generation_mw ?? 0;
    for (const item of r.curtailment) {
      const existing = curtailMap.get(item.fueltech) ?? { power: 0, label: item.label };
      existing.power += item.power_mw ?? 0;
      curtailMap.set(item.fueltech, existing);
    }
  }

  return Array.from(curtailMap.entries()).map(([fueltech, item]) => ({
    fueltech,
    label: item.label,
    power_mw: round(item.power, 1),
    proportion_pct: totalNetGen > 0 ? round((item.power / totalNetGen) * 100, 1) : null,
  }));
}

debugger
debugger
3
3
3
this2g

3
r
23
CanvasRenderingContext2D
3r
23
r
2
r32
recomputeEmissionsFromRegions3r
3
recomputeEmissionsFromRegions23
r
23
r3
2r
