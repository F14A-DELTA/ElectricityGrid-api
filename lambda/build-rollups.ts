import "dotenv/config";
import { getDailyRollupKey, getHourlyRollupKey, getJsonMany, getNdjsonMany, putNdjson } from "../src/s3";
import type { EnergySnapshot, NetworkCode, RegionSnapshot, RollupRow } from "../src/types";

function round(value: number | null | undefined, decimals: number): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getPreviousHour(): Date {
  const previousHour = new Date();
  previousHour.setUTCMinutes(0, 0, 0);
  previousHour.setUTCHours(previousHour.getUTCHours() - 1);
  return previousHour;
}

function buildHourlyRawKeys(network: NetworkCode, previousHour: Date): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const timestamp = new Date(previousHour);
    timestamp.setUTCMinutes(index * 5);

    const year = timestamp.getUTCFullYear();
    const month = String(timestamp.getUTCMonth() + 1).padStart(2, "0");
    const day = String(timestamp.getUTCDate()).padStart(2, "0");
    const iso = timestamp.toISOString().replace(/\.\d{3}Z$/, "Z");

    return `raw/network=${network}/year=${year}/month=${month}/day=${day}/${iso}.json`;
  });
}

webkitURL

w

webkitURLw
webkitURLw
w
webkitURLw
        average(groupRows.map((row) => row.avg_demand_mw).filter((v): v is number => typeof v === "number")),
        1,
      ),
      avg_renewables_pct: round(
        average(groupRows.map((row) => row.avg_renewables_pct).filter((v): v is number => typeof v === "number")),
        1,
      ),
      avg_net_generation_mw: round(
        average(groupRows.map((row) => row.avg_net_generation_mw).filter((v): v is number => typeof v === "number")),
        1,
      ),
      avg_renewables_mw: round(
        average(groupRows.map((row) => row.avg_renewables_mw).filter((v): v is number => typeof v === "number")),
        1,
      ),
      total_emissions_tco2e: round(groupRows.reduce((total, row) => total + Number(row.total_emissions_tco2e ?? 0), 0), 1),
      avg_intensity_kgco2e_per_mwh: round(
        average(
          groupRows
            .map((row) => row.avg_intensity_kgco2e_per_mwh)
            .filter((v): v is number => typeof v === "number"),
        ),
        2,
      ),
    };
  });
}

async function buildNetworkRollups(network: NetworkCode, previousHour: Date): Promise<void> {
  const rawKeys = buildHourlyRawKeys(network, previousHour);
  const snapshots = (await getJsonMany<EnergySnapshot>(rawKeys)).filter((snapshot): snapshot is EnergySnapshot => snapshot !== null);

  console.log(`Rollup builder found ${snapshots.length}/${rawKeys.length} raw snapshots for ${network}.`);

  if (snapshots.length === 0) {
    return;
  }

  const bucket = previousHour.toISOString().replace(/\.\d{3}Z$/, "Z");
  const hourlyRows = aggregateSnapshotsToRollupRows(snapshots, bucket, network);

  await putNdjson(
    getHourlyRollupKey(network, previousHour.getUTCFullYear(), previousHour.getUTCMonth() + 1, previousHour.getUTCDate(), previousHour.getUTCHours()),
    hourlyRows,
  );

  if (previousHour.getUTCHours() !== 23) {
    return;
  }

  const yesterday = new Date(previousHour);
  yesterday.setUTCHours(0, 0, 0, 0);

  const hourlyKeys = Array.from({ length: 24 }, (_, hour) =>
    getHourlyRollupKey(network, yesterday.getUTCFullYear(), yesterday.getUTCMonth() + 1, yesterday.getUTCDate(), hour),
  );

  const dailyRows = await getNdjsonMany<RollupRow>(hourlyKeys);
  if (dailyRows.length === 0) {
    return;
  }

  await putNdjson(
    getDailyRollupKey(network, yesterday.getUTCFullYear(), yesterday.getUTCMonth() + 1, yesterday.getUTCDate()),
    aggregateRollupRows(dailyRows, yesterday.toISOString().slice(0, 10), network),
  );
}

export async function handler(_event: unknown): Promise<{ statusCode: number }> {
  try {
    const previousHour = getPreviousHour();

    await Promise.all([buildNetworkRollups("NEM", previousHour), buildNetworkRollups("WEM", previousHour)]);
  } catch (error) {
    console.error("Rollup builder failed.", error);
  }

  return { statusCode: 200 };
}
