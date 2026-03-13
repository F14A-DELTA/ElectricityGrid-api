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

function applyMetricSubscriptions(snapshot: EnergySnapshot, metrics: Set<string>): Partial<EnergySnapshot> {
  if (metrics.size === 0) return snapshot;

  const filteredRegions = Object.fromEntries(
    Object.entries(snapshot.regions).map(([region, data]) => [
      region,
      data ? filterRegionByMetrics(data, metrics) : data,
    ]),
  ) as Partial<Record<RegionCode, RegionSnapshot>>;

  return {
    updated_at: snapshot.updated_at,
    network: snapshot.network,
    summary: {
      net_generation_mw: metrics.has("generation_mw") ? snapshot.summary.net_generation_mw : null,
      renewables_mw: metrics.has("renewables_pct") ? snapshot.summary.renewables_mw : null,
      renewables_pct: metrics.has("renewables_pct") ? snapshot.summary.renewables_pct : null,
      demand_mw: metrics.has("demand_mw") ? snapshot.summary.demand_mw : null,
    },
    generation: metrics.has("generation_mw") || metrics.has("price") ? snapshot.generation : [],
    loads: metrics.has("generation_mw") || metrics.has("price") ? snapshot.loads : [],
    curtailment: metrics.has("generation_mw") ? snapshot.curtailment : [],
    emissions:
      metrics.has("emissions_volume") || metrics.has("emission_intensity")
        ? snapshot.emissions
        : { volume_tco2e_per_30m: null, intensity_kgco2e_per_mwh: null },
    regions: filteredRegions,
  };
}

export function applySubscriptions(snapshots: LiveSnapshots, subscriptions: SubscriptionState): LiveSnapshots {
  const networks = Object.entries(snapshots) as Array<[NetworkCode, EnergySnapshot]>;

  return Object.fromEntries(
    networks.map(([network, snapshot]) => {
      let workingSnapshot = snapshot;

      if (subscriptions.regions.size > 0) {
        const filteredRegionEntries = Object.entries(snapshot.regions).filter(([region]) =>
          subscriptions.regions.has(region),
        );
        const filteredRegions = Object.fromEntries(filteredRegionEntries) as Partial<Record<RegionCode, RegionSnapshot>>;
        const selectedRegionData = filteredRegionEntries
          .map(([, data]) => data)
          .filter((d): d is RegionSnapshot => d !== undefined);

        workingSnapshot = {
          ...snapshot,
          summary: recomputeSummaryFromRegions(selectedRegionData),
          generation: mergeGenerationArrays(selectedRegionData),
          loads: mergeLoadsArrays(selectedRegionData),
          curtailment: mergeCurtailmentArrays(selectedRegionData),
          emissions: recomputeEmissionsFromRegions(selectedRegionData),
          regions: filteredRegions,
        };
      }

      return [network, applyMetricSubscriptions(workingSnapshot, subscriptions.metrics)];
    }),
  );
}

const wsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/v1/ws",
    {
      websocket: true,
      preValidation: async (request, reply) => {
        if (!validateAuth(request)) {
          reply.code(401).send({ success: false, error: "Unauthorized" });
        }
      },
    },
    (socket, _request) => {
      const subscriptions: SubscriptionState = {
        regions: new Set<string>(),
        metrics: new Set<string>(),
      };

      socket.send(
        JSON.stringify({
          event: "energy_update",
          data: latestSnapshot,
        }),
      );

      const handler = (snapshots: { nem: EnergySnapshot; wem: EnergySnapshot }) => {
        socket.send(
          JSON.stringify({
            event: "energy_update",
            data: applySubscriptions(
              {
                NEM: snapshots.nem,
                WEM: snapshots.wem,
              },
              subscriptions,
            ),
          }),
        );
      };

      emitter.on("update", handler);

      socket.on("message", (message: unknown) => {
        try {
          const payload = JSON.parse(String(message)) as {
            action?: "subscribe" | "unsubscribe";
            regions?: string[];
            metrics?: string[];
          };

          if (payload.action === "subscribe") {
            payload.regions?.forEach((region) => subscriptions.regions.add(region));
            payload.metrics?.forEach((metric) => subscriptions.metrics.add(metric));
            return;
          }

          if (payload.action === "unsubscribe") {
            payload.regions?.forEach((region) => subscriptions.regions.delete(region));
            payload.metrics?.forEach((metric) => subscriptions.metrics.delete(metric));
          }
        } catch (error) {
          socket.send(
            JSON.stringify({
              event: "error",
              error: "Invalid subscription message",
            }),
          );
        }
      });

      const cleanup = () => {
        emitter.off("update", handler);
      };

      socket.on("close", cleanup);
      socket.on("error", cleanup);
    },
  );
};

export default fp(wsRoutes);
