import { getBufferSince, recentBuffer } from "./cache";
import { getDailyRollupKeysForDays, getHourlyRollupKeysForRange, getNdjsonMany } from "./s3";
import type { EnergySnapshot, HistoryPoint, HistoryQueryParams, RangeStatPoint, RangeStats, RegionSnapshot, RollupRow } from "./types";

function getRangeStart(range: HistoryQueryParams["range"]): Date {
  const now = new Date();
  const days = range === "24h" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function getMetricFromRegion(regionData: RegionSnapshot, params: HistoryQueryParams): number | null {
  if (params.fueltech) {
    const row =
      regionData.generation.find((item) => item.fueltech === params.fueltech) ??
      regionData.loads.find((item) => item.fueltech === params.fueltech) ??
      regionData.curtailment.find((item) => item.fueltech === params.fueltech);

    if (!row) return null;

    if (params.metric === "generation_mw") return row.power_mw ?? null;

    if (params.metric === "price" && "price_dollar_per_mwh" in row) {
      const price = row.price_dollar_per_mwh;
      return typeof price === "number" ? price : null;
    }

    return null;
  }

  switch (params.metric) {
    case "generation_mw":
      return regionData.summary.net_generation_mw ?? null;
    case "price":
      return regionData.price_dollar_per_mwh ?? null;
    case "demand_mw":
      return regionData.demand_mw ?? regionData.summary.demand_mw ?? null;
    case "renewables_pct":
      return regionData.summary.renewables_pct ?? null;
    case "emissions_volume":
      return regionData.emissions.volume_tco2e_per_30m ?? null;
    case "emission_intensity":
      return regionData.emissions.intensity_kgco2e_per_mwh ?? null;
    default:
      return null;
  }
}

function getMetricFromSnapshot(snapshot: EnergySnapshot, params: HistoryQueryParams): number | null {
  if (params.region) {
    const regionData = snapshot.regions[params.region as keyof typeof snapshot.regions];
    if (!regionData) return null;
    return getMetricFromRegion(regionData, params);
  }

  if (params.fueltech) {
    const row =
      snapshot.generation.find((item) => item.fueltech === params.fueltech) ??
      snapshot.loads.find((item) => item.fueltech === params.fueltech) ??
      snapshot.curtailment.find((item) => item.fueltech === params.fueltech);

    if (!row) return null;

    if (params.metric === "generation_mw") return row.power_mw ?? null;

    if (params.metric === "price" && "price_dollar_per_mwh" in row) {
      const price = row.price_dollar_per_mwh;
      return typeof price === "number" ? price : null;
    }

    return null;
  }

  switch (params.metric) {
    case "generation_mw":
      return snapshot.summary.net_generation_mw;
    case "price": {
      const regionValues = Object.values(snapshot.regions)
        .map((region) => region?.price_dollar_per_mwh)
        .filter((value): value is number => typeof value === "number");
      if (regionValues.length === 0) return null;
      return regionValues.reduce((total, value) => total + value, 0) / regionValues.length;
    }
    case "emissions_volume":
      return snapshot.emissions.volume_tco2e_per_30m;
    case "emission_intensity":
      return snapshot.emissions.intensity_kgco2e_per_mwh;
    case "demand_mw":
      return snapshot.summary.demand_mw;
    case "renewables_pct":
      return snapshot.summary.renewables_pct;
    default:
      return null;
  }
}

function getRollupMetricValue(row: RollupRow, metric: HistoryQueryParams["metric"]): number | null {
  switch (metric) {
    case "generation_mw":
      return row.avg_net_generation_mw ?? row.avg_power_mw ?? null;
    case "price":
      return row.avg_price_per_mwh ?? row.avg_price_dollar_per_mwh ?? null;
    case "emissions_volume":
      return row.total_emissions_tco2e ?? null;
    case "emission_intensity":
      return row.avg_intensity_kgco2e_per_mwh ?? null;
    case "demand_mw":
      return row.avg_demand_mw ?? null;
    case "renewables_pct":
      return row.avg_renewables_pct ?? null;
    default:
      return null;
  }
}

// Metrics that represent totals/summaries — for these we exclude per-fueltech rows
// when no fueltech filter is specified, to avoid double-counting or duplicate points.
const SUMMARY_METRICS = new Set<HistoryQueryParams["metric"]>([
  "generation_mw",
  "demand_mw",
  "emissions_volume",
  "emission_intensity",
  "renewables_pct",
  "price",
]);

function filterRollupRows(
  rows: RollupRow[],
  params: Pick<HistoryQueryParams, "region" | "fueltech" | "metric">,
): RollupRow[] {
  return rows.filter((row) => {
    if (params.region && row.region !== params.region) return false;
    if (params.fueltech && row.fueltech !== params.fueltech) return false;

    // When no fueltech filter is requested for summary metrics, skip per-fueltech rows
    // so that only the summary/market row per timestamp is returned.
    if (!params.fueltech && row.fueltech && SUMMARY_METRICS.has(params.metric)) {
      return false;
    }

    return true;
  });
}




