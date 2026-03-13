export type NetworkCode = "NEM" | "WEM";

export type RegionCode = "NSW1" | "QLD1" | "VIC1" | "SA1" | "TAS1" | "WEM";

export interface SnapshotGenerationItem {
  fueltech: string;
  label: string;
  power_mw: number | null;
  proportion_pct: number | null;
  price_dollar_per_mwh: number | null;
  total_energy_mwh?: number | null;
}

export interface SnapshotCurtailmentItem {
  fueltech: string;
  label: string;
  power_mw: number | null;
  proportion_pct: number | null;
}

export interface SnapshotSummary {
  net_generation_mw: number | null;
  renewables_mw: number | null;
  renewables_pct: number | null;
  demand_mw: number | null;
}

export interface SnapshotEmissions {
  volume_tco2e_per_30m: number | null;
  intensity_kgco2e_per_mwh: number | null;
}

export interface RegionSnapshot {
  price_dollar_per_mwh: number | null;
  demand_mw: number | null;
  summary: SnapshotSummary;
  generation: SnapshotGenerationItem[];
  loads: SnapshotGenerationItem[];
  curtailment: SnapshotCurtailmentItem[];
  emissions: SnapshotEmissions;
}

export interface EnergySnapshot {
  updated_at: string;
  network: NetworkCode;
  summary: SnapshotSummary;
  generation: SnapshotGenerationItem[];
  loads: SnapshotGenerationItem[];
  curtailment: SnapshotCurtailmentItem[];
  emissions: SnapshotEmissions;
  regions: Partial<Record<RegionCode, RegionSnapshot>>;
}

export type LiveSnapshots = Partial<Record<NetworkCode, EnergySnapshot>>;

export interface BufferEntry {
  timestamp: Date;
  snapshots: LiveSnapshots;
}

export interface HistoryPoint {
  timestamp: string;
  value: number | null;
}

export interface RollupRow {
  bucket: string;
  network: NetworkCode;
  region?: string;
  fueltech?: string;
  avg_power_mw?: number | null;
  avg_price_per_mwh?: number | null;
  avg_proportion_pct?: number | null;
  total_energy_mwh?: number | null;
  avg_price_dollar_per_mwh?: number | null;
  avg_demand_mw?: number | null;
  avg_renewables_pct?: number | null;
  avg_net_generation_mw?: number | null;
  avg_renewables_mw?: number | null;
  total_emissions_tco2e?: number | null;
  avg_intensity_kgco2e_per_mwh?: number | null;
}

export interface HistoryQueryParams {
  network: NetworkCode;
  region?: string;
  fueltech?: string;
  metric: "generation_mw" | "price" | "emissions_volume" | "emission_intensity" | "demand_mw" | "renewables_pct";
  range: "24h" | "7d" | "30d" | "90d";
  interval: "5m" | "1h" | "1d";
}

export interface RangeStatPoint {
  value: number | null;
  timestamp: string | null;
}

export interface RangeStats {
  demand_mw: { min: RangeStatPoint; max: RangeStatPoint };
  renewables_pct: { min: RangeStatPoint; max: RangeStatPoint };
  price: { min: RangeStatPoint; max: RangeStatPoint };
}
