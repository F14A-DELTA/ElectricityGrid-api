import { getJsonMany, getRawKeysForRange } from "./s3";
import type { BufferEntry, EnergySnapshot, LiveSnapshots, NetworkCode } from "./types";

export let latestSnapshot: LiveSnapshots | null = null;
export const recentBuffer: BufferEntry[] = [];

function trimBuffer(): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  while (recentBuffer.length > 0 && recentBuffer[0].timestamp.getTime() < cutoff) {
    recentBuffer.shift();
  }
}
