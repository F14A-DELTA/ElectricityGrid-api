import { DataTable, type ITimeSeriesResponse } from "openelectricity";

import type { EnergySnapshot, NetworkCode, RegionCode, RegionSnapshot, SnapshotCurtailmentItem, SnapshotGenerationItem } from "./types";

export type DataRow = {
  interval: Date;
  fueltech?: string | null;
  region?: string | null;
  network_region?: string | null;
  power?: number | null;
  energy?: number | null;
  market_value?: number | null;
  price?: number | null;
  demand?: number | null;
  emissions?: number | null;
  emissions_intensity?: number | null;
  curtailment_solar_utility?: number | null;
  curtailment_wind?: number | null;
  [key: string]: Date | string | number | boolean | null | undefined;
};

export const FUELTECH_LABELS: Record<string, string> = {
  coal_black: "Coal (Black)",
  coal_brown: "Coal (Brown)",
  gas_ccgt: "Gas (CCGT)",
  gas_ocgt: "Gas (OCGT)",
  gas_steam: "Gas (Steam)",
  gas_recip: "Gas (Reciprocating)",
  gas_wcmg: "Gas (Waste Coal Mine)",
  solar_utility: "Solar (Utility)",
  solar_rooftop: "Solar (Rooftop)",
  wind: "Wind",
  hydro: "Hydro",
  battery_discharging: "Battery (Discharging)",
  battery_charging: "Battery (Charging)",
  distillate: "Distillate",
  bioenergy_biogas: "Bioenergy (Biogas)",
  bioenergy_biomass: "Bioenergy (Biomass)",
  pumps: "Pumps",
  solar_thermal: "Solar (Thermal)",
  nuclear: "Nuclear",
  wind_offshore: "Wind (Offshore)",
  interconnector: "Interconnector",
};

export const RENEWABLE_FUELTECHS = new Set<string>([
  "solar_utility",
  "solar_rooftop",
  "wind",
  "hydro",
  "battery_discharging",
  "bioenergy_biogas",
  "bioenergy_biomass",
]);

export const LOAD_FUELTECHS = new Set<string>(["pumps", "battery_charging"]);

export function round(value: number | null | undefined, decimals: number): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function getRows(apiResponse: ITimeSeriesResponse): DataRow[] {
  const table = apiResponse.datatable ?? DataTable.fromNetworkTimeSeries(apiResponse.response.data);
  return table.getRows() as DataRow[];
}

export function getLatestInterval(apiResponse: ITimeSeriesResponse): DataRow[] {
  const rows = getRows(apiResponse);
  if (rows.length === 0) {
    return [];
  }

  const maxTime = Math.max(...rows.map((row) => row.interval.getTime()));
  return rows.filter((row) => row.interval.getTime() === maxTime);
}

function sumMetric(rows: DataRow[], metric: keyof DataRow): number {
  return rows.reduce((total, row) => total + (typeof row[metric] === "number" ? (row[metric] as number) : 0), 0);
}

function getLabel(fueltech: string | null | undefined): string {
  if (!fueltech) {
    return "Unknown";
  }

  return FUELTECH_LABELS[fueltech] ?? fueltech;
}

function getRegion(row: DataRow): string | null {
  if (typeof row.region === "string" && row.region.length > 0) {
    return row.region;
  }

  if (typeof row.network_region === "string" && row.network_region.length > 0) {
    return row.network_region;
  }

  return null;
}

function buildGenerationItems(
  rows: DataRow[],
  totalNetPower: number,
): SnapshotGenerationItem[] {
  return rows.map((row) => {
    const power = Number(row.power ?? 0);
    const energy = Number(row.energy ?? 0);
    const marketValue = Number(row.market_value ?? 0);

    return {
      fueltech: String(row.fueltech ?? "unknown"),
      label: getLabel(row.fueltech),
      power_mw: round(power, 1),
      proportion_pct: totalNetPower > 0 ? round((power / totalNetPower) * 100, 1) : null,
      price_dollar_per_mwh: energy > 0 ? round(marketValue / energy, 2) : null,
      total_energy_mwh: round(energy, 1),
    };
  });
}

function buildLoadItems(
  rows: DataRow[],
  totalNetPower: number,
): SnapshotGenerationItem[] {
  return rows.map((row) => {
    const power = Math.abs(Number(row.power ?? 0));
    const energy = Math.abs(Number(row.energy ?? 0));
    const marketValue = Number(row.market_value ?? 0);

    return {
      fueltech: String(row.fueltech ?? "unknown"),
      label: getLabel(row.fueltech),
      power_mw: round(power, 1),
      proportion_pct: totalNetPower > 0 ? round((power / totalNetPower) * 100, 1) : null,
      price_dollar_per_mwh: energy > 0 ? round(marketValue / energy, 2) : null,
      total_energy_mwh: round(energy, 1),
    };
  });
}
