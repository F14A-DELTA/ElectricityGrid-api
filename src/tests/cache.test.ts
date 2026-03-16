import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const getRawKeysForRangeMock = vi.fn();
const getJsonManyMock = vi.fn();

vi.mock("../s3", () => ({
  getRawKeysForRange: getRawKeysForRangeMock,
  getJsonMany: getJsonManyMock,
}));


function makeSnapshot(network: "NEM" | "WEM", updatedAt: string) {
  return {
    updated_at: updatedAt,
    network,
    summary: {
      net_generation_mw: 100,
      renewables_mw: 40,
      renewables_pct: 40,
      demand_mw: 90,
    },
    generation: [],
    loads: [],
    curtailment: [],
    emissions: {
      volume_tco2e_per_30m: 10,
      intensity_kgco2e_per_mwh: 100,
    },
    regions: {},
  };
}


async function loadCacheModule() {
  vi.resetModules();
  return import("../cache");
}


describe("cache", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-17T12:00:00Z"));
    });


    afterEach(() => {
        vi.useRealTimers();
    });

    it("addToBuffer stores one snapshot and updates latestSnapshot", async () => {
        const cache = await loadCacheModule();
        const snapshot = makeSnapshot("NEM", "2026-03-17T11:55:00Z");

        cache.addToBuffer(snapshot);

        expect(cache.recentBuffer.length).toBe(1);
        expect(cache.latestSnapshot?.NEM?.updated_at).toBe("2026-03-17T11:55:00Z");
    });

    it("getBufferSince returns only entries from the requested time", async () => {
        const cache = await loadCacheModule();

        cache.addSnapshotsToBuffer(
            { NEM: makeSnapshot("NEM", "2026-03-17T11:00:00Z") },
            new Date("2026-03-17T11:00:00Z"),
        );
        cache.addSnapshotsToBuffer(
            { WEM: makeSnapshot("WEM", "2026-03-17T11:50:00Z") },
            new Date("2026-03-17T11:50:00Z"),
        );

        const from = new Date("2026-03-17T11:30:00Z");
        const result = cache.getBufferSince(from);

        expect(result.length).toBe(1);
        expect(result[0].snapshots.WEM?.updated_at).toBe("2026-03-17T11:50:00Z");
    });


    it("trims entries older than 24 hours", async () => {
        const cache = await loadCacheModule();

        cache.addSnapshotsToBuffer(
            { NEM: makeSnapshot("NEM", "2026-03-16T10:00:00Z") },
            new Date("2026-03-16T10:00:00Z"), 
        );
        cache.addSnapshotsToBuffer(
            { WEM: makeSnapshot("WEM", "2026-03-17T11:55:00Z") },
            new Date("2026-03-17T11:55:00Z"),
        );

        expect(cache.recentBuffer.length).toBe(1);
        expect(cache.recentBuffer[0].snapshots.WEM).toBeDefined();
    });

    it("warmCache loads, sorts, filters nulls, and merges snapshots by timestamp", async () => {
        const cache = await loadCacheModule();

        getRawKeysForRangeMock.mockImplementation((network: string) => [`${network}-k1`, `${network}-k2`]);
        getJsonManyMock.mockResolvedValueOnce([
            makeSnapshot("NEM", "2026-03-17T11:30:00Z"),
            null,
        ])
        
        getJsonManyMock.mockResolvedValueOnce([
            makeSnapshot("WEM", "2026-03-17T11:30:00Z"),
            makeSnapshot("WEM", "2026-03-17T11:55:00Z"),
        ]);

        await cache.warmCache(["NEM", "WEM"]);

        expect(getRawKeysForRangeMock).toHaveBeenCalledTimes(2);
        expect(getJsonManyMock).toHaveBeenCalledTimes(2);

        expect(cache.recentBuffer.length).toBe(2);
        expect(cache.recentBuffer[0].timestamp.toISOString()).toBe("2026-03-17T11:30:00.000Z");
        expect(cache.recentBuffer[0].snapshots.NEM).toBeDefined();
        expect(cache.recentBuffer[0].snapshots.WEM).toBeDefined();
        expect(cache.latestSnapshot?.WEM?.updated_at).toBe("2026-03-17T11:55:00Z");
  });
});