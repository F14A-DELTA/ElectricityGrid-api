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

function insertSnapshots(snapshots: LiveSnapshots, timestamp: Date): void {
  latestSnapshot = { ...(latestSnapshot ?? {}), ...snapshots };
  recentBuffer.push({
    timestamp,
    snapshots,
  });
  trimBuffer();
}

export function addToBuffer(snapshot: EnergySnapshot): void {
  insertSnapshots({ [snapshot.network]: snapshot }, new Date());
}

export function addSnapshotsToBuffer(snapshots: LiveSnapshots, timestamp = new Date()): void {
  insertSnapshots(snapshots, timestamp);
}

export function getBufferSince(from: Date): BufferEntry[] {
  return recentBuffer.filter((entry) => entry.timestamp >= from);
}

export async function warmCache(networks: NetworkCode[]): Promise<void> {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const snapshotsByTimestamp = new Map<string, LiveSnapshots>();

  await Promise.all(
    networks.map(async (network) => {
      const keys = getRawKeysForRange(network, from, now);
      const snapshots = await getJsonMany<EnergySnapshot>(keys);
      const existingSnapshots = snapshots.filter((snapshot): snapshot is EnergySnapshot => snapshot !== null);

      existingSnapshots
        .sort((left, right) => new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime())
        .forEach((snapshot) => {
          const existing = snapshotsByTimestamp.get(snapshot.updated_at) ?? {};
          existing[snapshot.network] = snapshot;
          snapshotsByTimestamp.set(snapshot.updated_at, existing);
        });

      console.log(`Warm cache loaded ${existingSnapshots.length} entries for ${network}.`);
    }),
  );

  Array.from(snapshotsByTimestamp.entries())
    .sort(([left], [right]) => new Date(left).getTime() - new Date(right).getTime())
    .forEach(([timestamp, snapshots]) => {
      addSnapshotsToBuffer(snapshots, new Date(timestamp));
    });
}
