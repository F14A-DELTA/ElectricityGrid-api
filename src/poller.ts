import { EventEmitter } from "node:events";

import OpenElectricityClient from "openelectricity";



const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5 * 60 * 1000);

export const emitter = new EventEmitter();
export let lastPollAt: Date | null = null;

function toIsoWithoutMillis(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function getClient(): OpenElectricityClient {
  return new OpenElectricityClient({
    apiKey: process.env.OPENELECTRICITY_API_KEY,
    baseUrl: process.env.OPENELECTRICITY_BASE_URL,
  });
}

export async function poll(): Promise<void> {
  try {
    const client = getClient();
    const pollStart = Date.now();
    const now = new Date();
    const dateStart = toIsoWithoutMillis(new Date(now.getTime() - 30 * 60 * 1000));

    const [nemGeneration, wemGeneration, nemMarket, wemMarket, nemEmissions, wemEmissions] = await Promise.all([
      client.getNetworkData("NEM", ["power", "energy", "market_value"], {
        interval: "5m",
        dateStart,
        primaryGrouping: "network_region",
        secondaryGrouping: ["fueltech"],
      }),
      client.getNetworkData("WEM", ["power", "energy", "market_value"], {
        interval: "5m",
        dateStart,
        primaryGrouping: "network_region",
        secondaryGrouping: ["fueltech"],
      }),
      client.getMarket("NEM", ["price", "demand", "curtailment_solar_utility", "curtailment_wind"], {
        interval: "5m",
        dateStart,
        primaryGrouping: "network_region",
      }),
      client.getMarket("WEM", ["price", "demand", "curtailment_solar_utility", "curtailment_wind"], {
        interval: "5m",
        dateStart,
        primaryGrouping: "network_region",
      }),
      client.getNetworkData("NEM", ["emissions"], {
        interval: "5m",
        dateStart,
        primaryGrouping: "network_region",
      }),
      client.getNetworkData("WEM", ["emissions"], {
        interval: "5m",
        dateStart,
        primaryGrouping: "network_region",
      }),
    ]);

    const nemSnapshot = buildSnapshot(nemGeneration, nemMarket, nemEmissions, "NEM");
    const wemSnapshot = buildSnapshot(wemGeneration, wemMarket, wemEmissions, "WEM");

    const snapshots: LiveSnapshots = {
      NEM: nemSnapshot,
      WEM: wemSnapshot,
    };

    addSnapshotsToBuffer(snapshots, now);

    const combinedSnapshot = {
      updated_at: toIsoWithoutMillis(now),
      nem: nemSnapshot,
      wem: wemSnapshot,
    };

    await Promise.all([
      putJson("live/snapshot.json", combinedSnapshot, 300),
      putJson(getLiveKey("NEM"), nemSnapshot, 300),
      ...Object.keys(nemSnapshot.regions).map((region) =>
        putJson(getLiveKey("NEM", region), nemSnapshot.regions[region as keyof typeof nemSnapshot.regions], 300),
      ),
      putJson(getLiveKey("WEM", "WEM"), wemSnapshot, 300),
      putJson(getRawKey("NEM", now), nemSnapshot, 0),
      putJson(getRawKey("WEM", now), wemSnapshot, 0),
    ]);

    lastPollAt = new Date();
    emitter.emit("update", {
      nem: nemSnapshot,
      wem: wemSnapshot,
    });

    console.log(
      `Poll complete - NEM ${nemSnapshot.summary.net_generation_mw}MW, ${nemSnapshot.summary.renewables_pct}% renewable. Duration: ${Date.now() - pollStart}ms.`,
    );
  } catch (error) {
    console.error("Poll failed.", error);
  }
}

export function startPoller(): NodeJS.Timeout {
  void poll();
  return setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);
}
