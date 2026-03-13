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

