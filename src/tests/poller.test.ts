import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const getNetworkDataMock = vi.fn();
const getMarketMock = vi.fn();

const addSnapshotsToBufferMock = vi.fn();
const buildSnapshotMock = vi.fn();

const putJsonMock = vi.fn();
const getLiveKeyMock = vi.fn();
const getRawKeyMock = vi.fn();


vi.mock("openelectricity", () => ({
  default: vi.fn().mockImplementation(() => ({
    getNetworkData: getNetworkDataMock,
    getMarket: getMarketMock,
  })),
}));


vi.mock("../cache", () => ({
  addSnapshotsToBuffer: addSnapshotsToBufferMock,
}));

vi.mock("../normalise", () => ({
  buildSnapshot: buildSnapshotMock,
}));

vi.mock("../s3", () => ({
  putJson: putJsonMock,
  getLiveKey: getLiveKeyMock,
  getRawKey: getRawKeyMock,
}));


function makeSnapshot(network: "NEM" | "WEM", regions: Record<string, any>) {
  return {
    updated_at: "2026-03-17T10:00:00Z",
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
    regions,
  };
}


async function loadPoller(env?: { POLL_INTERVAL_MS?: string }) {
    vi.resetModules();

    process.env.OPENELECTRICITY_API_KEY = "test-key";
    process.env.OPENELECTRICITY_BASE_URL = "https://example.test";
    if (env?.POLL_INTERVAL_MS) {
        process.env.POLL_INTERVAL_MS = env.POLL_INTERVAL_MS;
    } else {
        delete process.env.POLL_INTERVAL_MS;
    }

    return import("../poller");
}


describe("poller", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-17T12:00:00.123Z"));

        getNetworkDataMock.mockResolvedValue({});
        getMarketMock.mockResolvedValue({});
        putJsonMock.mockResolvedValue(undefined);

        getLiveKeyMock.mockImplementation((network?: string, region?: string) => {
            if (!network) return "live/snapshot.json";
            if (!region) return `live/${network.toLowerCase()}/snapshot.json`;
            return `live/${network.toLowerCase()}/${region}.json`;
        });

        getRawKeyMock.mockImplementation((network: string, date: Date) => {
            return `raw/${network}/${date.toISOString()}`;
        });
    });

  afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });


    it("poll success: fetches, builds, caches, writes S3, emits event, updates lastPollAt", async () => {
        const poller = await loadPoller();

        const nemSnapshot = makeSnapshot("NEM", { NSW1: { a: 1 }, QLD1: { b: 2 } });
        const wemSnapshot = makeSnapshot("WEM", { WEM: { c: 3 } });

        buildSnapshotMock.mockReturnValueOnce(nemSnapshot).mockReturnValueOnce(wemSnapshot);

        const updateListener = vi.fn();
        poller.emitter.once("update", updateListener);

        await poller.poll();

        expect(getNetworkDataMock).toHaveBeenCalledTimes(4);
        expect(getMarketMock).toHaveBeenCalledTimes(2);

        const firstCallOptions = getNetworkDataMock.mock.calls[0][2];
        expect(firstCallOptions.dateStart).toBe("2026-03-17T11:30:00Z");

        expect(buildSnapshotMock).toHaveBeenCalledTimes(2);
        expect(addSnapshotsToBufferMock).toHaveBeenCalledTimes(1);

        expect(putJsonMock).toHaveBeenCalledWith("live/snapshot.json", expect.any(Object), 300);
        expect(putJsonMock).toHaveBeenCalledWith("live/nem/snapshot.json", nemSnapshot, 300);
        expect(putJsonMock).toHaveBeenCalledWith("live/nem/NSW1.json", nemSnapshot.regions.NSW1, 300);
        expect(putJsonMock).toHaveBeenCalledWith("live/nem/QLD1.json", nemSnapshot.regions.QLD1, 300);
        expect(putJsonMock).toHaveBeenCalledWith("live/wem/WEM.json", wemSnapshot, 300);

        const combinedSnapshotArg = putJsonMock.mock.calls.find((c) => c[0] === "live/snapshot.json")?.[1];
        expect(combinedSnapshotArg.updated_at).toBe("2026-03-17T12:00:00Z");

        expect(updateListener).toHaveBeenCalledTimes(1);
        expect(poller.lastPollAt).not.toBeNull();
    });


    it("poll failure: logs error and skips cache/S3/update", async () => {
        const poller = await loadPoller();

        getNetworkDataMock.mockRejectedValueOnce(new Error("boom"));
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(poller.poll()).resolves.toBeUndefined();

        expect(errorSpy).toHaveBeenCalled();
        expect(addSnapshotsToBufferMock).not.toHaveBeenCalled();
        expect(putJsonMock).not.toHaveBeenCalled();
        expect(poller.lastPollAt).toBeNull();
    });
    

    it("startPoller uses configured POLL_INTERVAL_MS", async () => {
        const poller = await loadPoller({ POLL_INTERVAL_MS: "1234" });

        buildSnapshotMock
        .mockReturnValueOnce(makeSnapshot("NEM", { NSW1: {} }))
        .mockReturnValueOnce(makeSnapshot("WEM", { WEM: {} }));

        const intervalSpy = vi.spyOn(globalThis, "setInterval").mockReturnValue({} as any);

        const timer = poller.startPoller();

        await Promise.resolve();
        await Promise.resolve();

        expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 1234);
        expect(timer).toBeDefined();
    });

    it("startPoller uses default interval (5 minutes) when env is missing", async () => {
        const poller = await loadPoller();

        buildSnapshotMock
        .mockReturnValueOnce(makeSnapshot("NEM", { NSW1: {} }))
        .mockReturnValueOnce(makeSnapshot("WEM", { WEM: {} }));

        const intervalSpy = vi.spyOn(globalThis, "setInterval").mockReturnValue({} as any);
        poller.startPoller();
        expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 300000);
    });
    
});