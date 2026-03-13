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


  return setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);
}
