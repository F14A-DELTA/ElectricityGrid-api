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

function buildCurtailmentItems(
  curtailmentSolar: number,
  curtailmentWind: number,
  totalNetPower: number,
): SnapshotCurtailmentItem[] {
  return [
    {
      fueltech: "solar_utility",
      label: getLabel("solar_utility"),
      power_mw: round(curtailmentSolar, 1),
      proportion_pct: totalNetPower > 0 ? round((curtailmentSolar / totalNetPower) * 100, 1) : null,
    },
    {
      fueltech: "wind",
      label: getLabel("wind"),
      power_mw: round(curtailmentWind, 1),
      proportion_pct: totalNetPower > 0 ? round((curtailmentWind / totalNetPower) * 100, 1) : null,
    },
  ];
}

function buildRegionSnapshot(
  regionGenRows: DataRow[],
  regionLoadRows: DataRow[],
  regionMarketRow: DataRow | undefined,
  regionEmissionsRows: DataRow[],
): RegionSnapshot {
  const totalNetPower = regionGenRows.reduce((total, row) => total + Math.max(0, Number(row.power ?? 0)), 0);
  const generation = buildGenerationItems(regionGenRows, totalNetPower);
  const loads = buildLoadItems(regionLoadRows, totalNetPower);

  const curtailmentSolar = typeof regionMarketRow?.curtailment_solar_utility === "number"
    ? regionMarketRow.curtailment_solar_utility
    : 0;
  const curtailmentWind = typeof regionMarketRow?.curtailment_wind === "number"
    ? regionMarketRow.curtailment_wind
    : 0;
  const curtailment = buildCurtailmentItems(curtailmentSolar, curtailmentWind, totalNetPower);

  const renewablesMw = regionGenRows.reduce((total, row) => {
    return total + (RENEWABLE_FUELTECHS.has(String(row.fueltech ?? "")) ? Number(row.power ?? 0) : 0);
  }, 0);

  const emissionsVolume = regionEmissionsRows.reduce((total, row) => total + Number(row.emissions ?? 0), 0);
  const generationEnergy = regionGenRows.reduce((total, row) => total + Math.max(0, Number(row.energy ?? 0)), 0);
  const emissionsIntensity = generationEnergy > 0 ? (emissionsVolume * 1000) / generationEnergy : null;

  const demandMw = typeof regionMarketRow?.demand === "number" ? regionMarketRow.demand : null;

  return {
    price_dollar_per_mwh: round(typeof regionMarketRow?.price === "number" ? regionMarketRow.price : null, 2),
    demand_mw: round(demandMw, 1),
    summary: {
      net_generation_mw: round(totalNetPower, 1),
      renewables_mw: round(renewablesMw, 1),
      renewables_pct: totalNetPower > 0 ? round((renewablesMw / totalNetPower) * 100, 1) : null,
      demand_mw: round(demandMw, 1),
    },
    generation,
    loads,
    curtailment,
    emissions: {
      volume_tco2e_per_30m: round(emissionsVolume, 1),
      intensity_kgco2e_per_mwh: round(emissionsIntensity, 2),
    },
  };
}

export function buildSnapshotFromRows(
  latestGenerationRows: DataRow[],
  latestMarketRows: DataRow[],
  latestEmissionsRows: DataRow[],
  network: NetworkCode,
): EnergySnapshot {
  const updatedAtSource =
    latestGenerationRows[0]?.interval ??
    latestMarketRows[0]?.interval ??
    latestEmissionsRows[0]?.interval;

  // Collect all region codes from all data sources.
  const regionCodes = new Set<string>();
  for (const row of [...latestMarketRows, ...latestGenerationRows, ...latestEmissionsRows]) {
    const r = getRegion(row);
    if (r) regionCodes.add(r);
  }

  // Build per-region snapshots.
  const regionSnapshots: Partial<Record<RegionCode, RegionSnapshot>> = {};
  for (const region of regionCodes) {
    const regionGenRows = latestGenerationRows.filter(
      (row) => getRegion(row) === region && !LOAD_FUELTECHS.has(String(row.fueltech ?? "")),
    );
    const regionLoadRows = latestGenerationRows.filter(
      (row) => getRegion(row) === region && LOAD_FUELTECHS.has(String(row.fueltech ?? "")),
    );
    const regionMarketRow = latestMarketRows.find((row) => getRegion(row) === region);
    const regionEmissionsRows = latestEmissionsRows.filter((row) => getRegion(row) === region);

    regionSnapshots[region as RegionCode] = buildRegionSnapshot(
      regionGenRows,
      regionLoadRows,
      regionMarketRow,
      regionEmissionsRows,
    );
  }

  // Build network-level aggregates by merging across regions.
  // Group generation by fueltech, summing power/energy/market_value across regions.
  const fueltechGenMap = new Map<string, { power: number; energy: number; marketValue: number }>();
  for (const row of latestGenerationRows) {
    if (LOAD_FUELTECHS.has(String(row.fueltech ?? ""))) continue;
    const ft = String(row.fueltech ?? "unknown");
    const existing = fueltechGenMap.get(ft) ?? { power: 0, energy: 0, marketValue: 0 };
    existing.power += Number(row.power ?? 0);
    existing.energy += Number(row.energy ?? 0);
    existing.marketValue += Number(row.market_value ?? 0);
    fueltechGenMap.set(ft, existing);
  }

  const totalNetPower = Array.from(fueltechGenMap.values()).reduce(
    (total, item) => total + Math.max(0, item.power),
    0,
  );

  const generation: EnergySnapshot["generation"] = Array.from(fueltechGenMap.entries()).map(([fueltech, item]) => ({
    fueltech,
    label: getLabel(fueltech),
    power_mw: round(item.power, 1),
    proportion_pct: totalNetPower > 0 ? round((item.power / totalNetPower) * 100, 1) : null,
    price_dollar_per_mwh: item.energy > 0 ? round(item.marketValue / item.energy, 2) : null,
    total_energy_mwh: round(item.energy, 1),
  }));

  const fueltechLoadMap = new Map<string, { power: number; energy: number; marketValue: number }>();
  for (const row of latestGenerationRows) {
    if (!LOAD_FUELTECHS.has(String(row.fueltech ?? ""))) continue;
    const ft = String(row.fueltech ?? "unknown");
    const existing = fueltechLoadMap.get(ft) ?? { power: 0, energy: 0, marketValue: 0 };
    existing.power += Math.abs(Number(row.power ?? 0));
    existing.energy += Math.abs(Number(row.energy ?? 0));
    existing.marketValue += Number(row.market_value ?? 0);
    fueltechLoadMap.set(ft, existing);
  }

  const loads: EnergySnapshot["loads"] = Array.from(fueltechLoadMap.entries()).map(([fueltech, item]) => ({
    fueltech,
    label: getLabel(fueltech),
    power_mw: round(item.power, 1),
    proportion_pct: totalNetPower > 0 ? round((item.power / totalNetPower) * 100, 1) : null,
    price_dollar_per_mwh: item.energy > 0 ? round(item.marketValue / item.energy, 2) : null,
    total_energy_mwh: round(item.energy, 1),
  }));

  const renewablesMw = latestGenerationRows.reduce((total, row) => {
    if (LOAD_FUELTECHS.has(String(row.fueltech ?? ""))) return total;
    return total + (RENEWABLE_FUELTECHS.has(String(row.fueltech ?? "")) ? Number(row.power ?? 0) : 0);
  }, 0);

  const curtailmentSolar = sumMetric(latestMarketRows, "curtailment_solar_utility");
  const curtailmentWind = sumMetric(latestMarketRows, "curtailment_wind");
  const curtailment = buildCurtailmentItems(curtailmentSolar, curtailmentWind, totalNetPower);

  const totalDemand = latestMarketRows.reduce((total, row) => total + Number(row.demand ?? 0), 0);
  const emissionsVolume = sumMetric(latestEmissionsRows, "emissions");
  const totalGenerationEnergy = latestGenerationRows.reduce((total, row) => {
    if (LOAD_FUELTECHS.has(String(row.fueltech ?? ""))) return total;
    return total + Math.max(0, Number(row.energy ?? 0));
  }, 0);
  const derivedEmissionsIntensity =
    totalGenerationEnergy > 0 ? (emissionsVolume * 1000) / totalGenerationEnergy : null;

  return {
    updated_at: (updatedAtSource ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"),
    network,
    summary: {
      net_generation_mw: round(totalNetPower, 1),
      renewables_mw: round(renewablesMw, 1),
      renewables_pct: totalNetPower > 0 ? round((renewablesMw / totalNetPower) * 100, 1) : null,
      demand_mw: round(totalDemand, 1),
    },
    generation,
    loads,
    curtailment,
    emissions: {
      volume_tco2e_per_30m: round(emissionsVolume, 1),
      intensity_kgco2e_per_mwh: round(derivedEmissionsIntensity, 2),
    },
    regions: regionSnapshots,
  };
}

export function buildSnapshot(
  genData: ITimeSeriesResponse,
  marketData: ITimeSeriesResponse,
  emissionsData: ITimeSeriesResponse,
  network: NetworkCode,
): EnergySnapshot {
  return buildSnapshotFromRows(
    getLatestInterval(genData),
    getLatestInterval(marketData),
    getLatestInterval(emissionsData),
    network,
  );
}
