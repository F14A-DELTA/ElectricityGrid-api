import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const getBufferSinceMock = vi.fn();
const recentBufferMock: any[] = []

const getDailyRollupKeysForDaysMock = vi.fn();
const getHourlyRollupKeysForRangeMock = vi.fn();
const getNdjsonManyMock = vi.fn();


vi.mock("../cache", () => ({
  getBufferSince: getBufferSinceMock,
  recentBuffer: recentBufferMock,
}));


vi.mock("../s3", () => ({
  getDailyRollupKeysForDays: getDailyRollupKeysForDaysMock,
  getHourlyRollupKeysForRange: getHourlyRollupKeysForRangeMock,
  getNdjsonMany: getNdjsonManyMock,
}));



function makeSnapshot(overrides: any = {}) {
  return {
    updated_at: "2026-03-17T10:00:00Z",
    network: "NEM",
    summary: {
      net_generation_mw: 100,
      renewables_mw: 40,
      renewables_pct: 40,
      demand_mw: 90,
    },
    generation: [{ fueltech: "wind", power_mw: 50, price_dollar_per_mwh: 70 }],
    loads: [{ fueltech: "battery_charging", power_mw: 10, price_dollar_per_mwh: 20 }],
    curtailment: [{ fueltech: "wind", power_mw: 2 }],
    emissions: {
      volume_tco2e_per_30m: 12,
      intensity_kgco2e_per_mwh: 120,
    },
    regions: {
      NSW1: {
        price_dollar_per_mwh: 80,
        demand_mw: 60,
        summary: { net_generation_mw: 70, renewables_mw: 30, renewables_pct: 42.9, demand_mw: 60 },
        generation: [{ fueltech: "wind", power_mw: 35, price_dollar_per_mwh: 75 }],
        loads: [],
        curtailment: [],
        emissions: { volume_tco2e_per_30m: 7, intensity_kgco2e_per_mwh: 110 },
      },
    },
    ...overrides,
  };
}

async function loadModule() {
  vi.resetModules();
  return import("../s3-query");
}

describe("s3-query", () => {

    beforeEach(() => {
        vi.clearAllMocks();
        recentBufferMock.length = 0;
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-17T12:00:00Z"));
    });


    afterEach(() => {
        vi.useRealTimers();
    });



    it("readFromBuffer returns sorted + deduped points", async () => {
        const mod = await loadModule();

        getBufferSinceMock.mockReturnValue([
            { timestamp: new Date("2026-03-17T09:00:00Z"), snapshots: { NEM: makeSnapshot({ updated_at: "2026-03-17T09:00:00Z" }) } },
            { timestamp: new Date("2026-03-17T09:00:00Z"), snapshots: { NEM: makeSnapshot({ updated_at: "2026-03-17T09:00:00Z", summary: { net_generation_mw: 101, renewables_mw: 40, renewables_pct: 39.6, demand_mw: 90 } }) } },
            { timestamp: new Date("2026-03-17T10:00:00Z"), snapshots: { NEM: makeSnapshot({ updated_at: "2026-03-17T10:00:00Z" }) } },
            ]);

            const points = mod.readFromBuffer({
                network: "NEM",
                metric: "generation_mw",
                range: "24h",
                interval: "5m",
            });

            expect(points).toEqual([
                { timestamp: "2026-03-17T09:00:00Z", value: 101 },
                { timestamp: "2026-03-17T10:00:00Z", value: 100 },
        ]);
    });


    it("readFromBuffer handles region + price metric", async () => {
        const mod = await loadModule();

        getBufferSinceMock.mockReturnValue([
            { timestamp: new Date("2026-03-17T10:00:00Z"), snapshots: { NEM: makeSnapshot() } },
        ]);

        const points = mod.readFromBuffer({
            network: "NEM",
            region: "NSW1",
            metric: "price",
            range: "24h",
            interval: "5m",
        });

        expect(points).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 80 }]);
    });


    it("readFromBuffer skips entries when network snapshot is missing", async () => {
        const mod = await loadModule();

        getBufferSinceMock.mockReturnValue([
            { timestamp: new Date("2026-03-17T10:00:00Z"), snapshots: { WEM: makeSnapshot({ network: "WEM" }) } },
        ]);

        const points = mod.readFromBuffer({
            network: "NEM",
            metric: "generation_mw",
            range: "24h",
            interval: "5m",
        });

        expect(points).toEqual([]);
    });


    it("readFromBuffer returns null for network price when no region price exists", async () => {
        const mod = await loadModule();

        getBufferSinceMock.mockReturnValue([
        {
            timestamp: new Date("2026-03-17T10:00:00Z"),
            snapshots: {
            NEM: makeSnapshot({
                regions: {
                NSW1: {
                    ...makeSnapshot().regions.NSW1,
                    price_dollar_per_mwh: null,
                },
                },
            }),
            },
        },
        ]);

        const points = mod.readFromBuffer({
        network: "NEM",
        metric: "price",
        range: "24h",
        interval: "5m",
        });

        expect(points).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: null }]);
    });

    it("readFromBuffer covers region fueltech, average price, and summary fallback metrics", async () => {
        const mod = await loadModule();

        getBufferSinceMock.mockReturnValue([
            {
                timestamp: new Date("2026-03-17T10:00:00Z"),
                snapshots: {
                    NEM: makeSnapshot({
                        emissions: {
                            volume_tco2e_per_30m: 15,
                            intensity_kgco2e_per_mwh: 125,
                        },
                        regions: {
                            NSW1: {
                                ...makeSnapshot().regions.NSW1,
                                demand_mw: null,
                                summary: {
                                    ...makeSnapshot().regions.NSW1.summary,
                                    demand_mw: 61,
                                },
                            },
                            QLD1: {
                                price_dollar_per_mwh: 100,
                                demand_mw: 30,
                                summary: { net_generation_mw: 30, renewables_mw: 20, renewables_pct: 66.7, demand_mw: 30 },
                                generation: [],
                                loads: [],
                                curtailment: [],
                                emissions: { volume_tco2e_per_30m: 4, intensity_kgco2e_per_mwh: 90 },
                            },
                        },
                    }),
                },
            },
        ]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                region: "NSW1",
                fueltech: "wind",
                metric: "price",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 75 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                region: "NSW1",
                metric: "demand_mw",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 61 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                metric: "price",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 90 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                metric: "emissions_volume",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 15 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                metric: "emission_intensity",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 125 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                metric: "renewables_pct",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 40 }]);
    });

    it("readFromBuffer returns null for unsupported fueltech metrics", async () => {
        const mod = await loadModule();

        getBufferSinceMock.mockReturnValue([
            { timestamp: new Date("2026-03-17T10:00:00Z"), snapshots: { NEM: makeSnapshot() } },
        ]);

        const points = mod.readFromBuffer({
            network: "NEM",
            fueltech: "wind",
            metric: "renewables_pct",
            range: "24h",
            interval: "5m",
        });

        expect(points).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: null }]);
    });

    it("readFromBuffer handles snapshot fueltech price, curtailment lookups, and invalid metrics", async () => {
        const mod = await loadModule();

        getBufferSinceMock.mockReturnValue([
            {
                timestamp: new Date("2026-03-17T10:00:00Z"),
                snapshots: {
                    NEM: makeSnapshot({
                        generation: [],
                        loads: [],
                        curtailment: [{ fueltech: "wind", power_mw: 2 }],
                    }),
                },
            },
            {
                timestamp: new Date("2026-03-17T10:05:00Z"),
                snapshots: { NEM: makeSnapshot({ updated_at: "2026-03-17T10:05:00Z" }) },
            },
        ]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                fueltech: "wind",
                metric: "generation_mw",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([
            { timestamp: "2026-03-17T10:00:00Z", value: 2 },
            { timestamp: "2026-03-17T10:05:00Z", value: 50 },
        ]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                fueltech: "battery_charging",
                metric: "price",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([
            { timestamp: "2026-03-17T10:00:00Z", value: null },
            { timestamp: "2026-03-17T10:05:00Z", value: 20 },
        ]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                metric: "demand_mw",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([
            { timestamp: "2026-03-17T10:00:00Z", value: 90 },
            { timestamp: "2026-03-17T10:05:00Z", value: 90 },
        ]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                metric: "not_a_metric" as any,
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([
            { timestamp: "2026-03-17T10:00:00Z", value: null },
            { timestamp: "2026-03-17T10:05:00Z", value: null },
        ]);
    });

    it("readFromBuffer covers remaining region metric branches", async () => {
        const mod = await loadModule();

        getBufferSinceMock.mockReturnValue([
            {
                timestamp: new Date("2026-03-17T10:00:00Z"),
                snapshots: {
                    NEM: makeSnapshot({
                        regions: {
                            NSW1: {
                                ...makeSnapshot().regions.NSW1,
                                summary: {
                                    ...makeSnapshot().regions.NSW1.summary,
                                    net_generation_mw: 71,
                                    renewables_pct: 43,
                                },
                                emissions: {
                                    volume_tco2e_per_30m: 8,
                                    intensity_kgco2e_per_mwh: 111,
                                },
                            },
                        },
                    }),
                },
            },
        ]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                region: "NSW1",
                metric: "generation_mw",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 71 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                region: "NSW1",
                metric: "renewables_pct",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 43 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                region: "NSW1",
                metric: "emissions_volume",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 8 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                region: "NSW1",
                metric: "emission_intensity",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 111 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                region: "NSW1",
                metric: "not_a_metric" as any,
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: null }]);
    });

    it("readFromBuffer falls back to region loads and curtailment for fueltech metrics", async () => {
        const mod = await loadModule();

        getBufferSinceMock.mockReturnValue([
            {
                timestamp: new Date("2026-03-17T10:00:00Z"),
                snapshots: {
                    NEM: makeSnapshot({
                        regions: {
                            NSW1: {
                                ...makeSnapshot().regions.NSW1,
                                generation: [],
                                loads: [{ fueltech: "battery_charging", power_mw: 12, price_dollar_per_mwh: 25 }],
                                curtailment: [{ fueltech: "solar_utility", power_mw: 3 }],
                            },
                        },
                    }),
                },
            },
        ]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                region: "NSW1",
                fueltech: "battery_charging",
                metric: "generation_mw",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 12 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                region: "NSW1",
                fueltech: "solar_utility",
                metric: "generation_mw",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: 3 }]);

        expect(
            mod.readFromBuffer({
                network: "NEM",
                region: "NSW1",
                fueltech: "battery_charging",
                metric: "renewables_pct",
                range: "24h",
                interval: "5m",
            }),
        ).toEqual([{ timestamp: "2026-03-17T10:00:00Z", value: null }]);
    });

    it("queryHistory routes to buffer for 24h/5m", async () => {
        const mod = await loadModule();
        getBufferSinceMock.mockReturnValue([]);

        const points = await mod.queryHistory({
            network: "NEM",
            metric: "demand_mw",
            range: "24h",
            interval: "1h",
        });

        expect(points).toEqual([]);
        expect(getBufferSinceMock).toHaveBeenCalledTimes(1);
    });

    it("queryHistory routes to hourly rollups for 7d", async () => {
        const mod = await loadModule();

        getHourlyRollupKeysForRangeMock.mockReturnValue(["h1"]);
        getNdjsonManyMock.mockResolvedValue([]);

        const points = await mod.queryHistory({
            network: "NEM",
            metric: "price",
            range: "7d",
            interval: "1d",
        });

        expect(points).toEqual([]);
        expect(getHourlyRollupKeysForRangeMock).toHaveBeenCalled();
    });


    it("queryHistory routes to daily rollups for 30d/90d", async () => {
        const mod = await loadModule();

        getDailyRollupKeysForDaysMock.mockReturnValue(["d1"]);
        getNdjsonManyMock.mockResolvedValue([]);

        const points = await mod.queryHistory({
        network: "NEM",
        metric: "price",
        range: "30d",
        interval: "1d",
        });

        expect(points).toEqual([]);
        expect(getDailyRollupKeysForDaysMock).toHaveBeenCalled();
    });

    it("readHourlyRollups filters rows and maps metric", async () => {
        const mod = await loadModule();

        getHourlyRollupKeysForRangeMock.mockReturnValue(["h1", "h2"]);
        getNdjsonManyMock.mockResolvedValue([
        { bucket: "2026-03-17T09:00:00Z", network: "NEM", avg_price_per_mwh: 70 },
        { bucket: "2026-03-17T10:00:00Z", network: "NEM", avg_price_per_mwh: 75, fueltech: "wind" },
        { bucket: "2026-03-17T11:00:00Z", network: "NEM", avg_price_dollar_per_mwh: 80, region: "NSW1" },
        ]);

        const points = await mod.readHourlyRollups({
            network: "NEM",
            metric: "price",
            range: "7d",
            interval: "1h",
            region: "NSW1",
        });

        expect(getHourlyRollupKeysForRangeMock).toHaveBeenCalled();
        expect(points).toEqual([{ timestamp: "2026-03-17T11:00:00Z", value: 80 }]);
    });


    it("readHourlyRollups filters by fueltech and maps generation fallback", async () => {
        const mod = await loadModule();

        getHourlyRollupKeysForRangeMock.mockReturnValue(["h1"]);
        getNdjsonManyMock.mockResolvedValue([
        { bucket: "2026-03-17T09:00:00Z", network: "NEM", fueltech: "wind", avg_power_mw: 11 },
        { bucket: "2026-03-17T10:00:00Z", network: "NEM", fueltech: "solar_utility", avg_power_mw: 22 },
        ]);

        const points = await mod.readHourlyRollups({
            network: "NEM",
            fueltech: "wind",
            metric: "generation_mw",
            range: "7d",
            interval: "1h",
        });

        expect(points).toEqual([{ timestamp: "2026-03-17T09:00:00Z", value: 11 }]);
    });

    it("readHourlyRollups filters out fueltech summary rows and maps demand/renewables/emissions metrics", async () => {
        const mod = await loadModule();

        getHourlyRollupKeysForRangeMock.mockReturnValue(["h1"]);
        getNdjsonManyMock.mockResolvedValue([
            { bucket: "2026-03-17T09:00:00Z", network: "NEM", avg_demand_mw: 70, avg_renewables_pct: 35, total_emissions_tco2e: 12, avg_intensity_kgco2e_per_mwh: 100 },
            { bucket: "2026-03-17T10:00:00Z", network: "NEM", fueltech: "wind", avg_demand_mw: 999, avg_renewables_pct: 999, total_emissions_tco2e: 999, avg_intensity_kgco2e_per_mwh: 999 },
        ]);

        await expect(
            mod.readHourlyRollups({
                network: "NEM",
                metric: "demand_mw",
                range: "24h",
                interval: "1h",
            }),
        ).resolves.toEqual([{ timestamp: "2026-03-17T09:00:00Z", value: 70 }]);

        await expect(
            mod.readHourlyRollups({
                network: "NEM",
                metric: "renewables_pct",
                range: "7d",
                interval: "1h",
            }),
        ).resolves.toEqual([{ timestamp: "2026-03-17T09:00:00Z", value: 35 }]);

        await expect(
            mod.readHourlyRollups({
                network: "NEM",
                metric: "emissions_volume",
                range: "7d",
                interval: "1h",
            }),
        ).resolves.toEqual([{ timestamp: "2026-03-17T09:00:00Z", value: 12 }]);

        await expect(
            mod.readHourlyRollups({
                network: "NEM",
                metric: "emission_intensity",
                range: "7d",
                interval: "1h",
            }),
        ).resolves.toEqual([{ timestamp: "2026-03-17T09:00:00Z", value: 100 }]);
    });

    it("readHourlyRollups returns null values for unsupported metrics", async () => {
        const mod = await loadModule();

        getHourlyRollupKeysForRangeMock.mockReturnValue(["h1"]);
        getNdjsonManyMock.mockResolvedValue([
            { bucket: "2026-03-17T09:00:00Z", network: "NEM", avg_demand_mw: 70 },
        ]);

        await expect(
            mod.readHourlyRollups({
                network: "NEM",
                metric: "not_a_metric" as any,
                range: "7d",
                interval: "1h",
            }),
        ).resolves.toEqual([{ timestamp: "2026-03-17T09:00:00Z", value: null }]);
    });


    it("readDailyRollups returns mapped daily points", async () => {
        const mod = await loadModule();

        getDailyRollupKeysForDaysMock.mockReturnValue(["d1", "d2"]);
        getNdjsonManyMock.mockResolvedValue([
        { bucket: "2026-03-15T00:00:00Z", network: "NEM", avg_net_generation_mw: 120 },
        { bucket: "2026-03-16T00:00:00Z", network: "NEM", avg_power_mw: 130 },
        ]);

        const points = await mod.readDailyRollups({
            network: "NEM",
            metric: "generation_mw",
            range: "30d",
            interval: "1d",
        });

        expect(getDailyRollupKeysForDaysMock).toHaveBeenCalledWith("NEM", 30);
        expect(points).toEqual([
            { timestamp: "2026-03-15T00:00:00Z", value: 120 },
            { timestamp: "2026-03-16T00:00:00Z", value: 130 },
        ]);
    });


    it("computeStats returns min/max and ignores fueltech rows", async () => {
        const mod = await loadModule();

        getDailyRollupKeysForDaysMock.mockReturnValue(["d1"]);
        getNdjsonManyMock.mockResolvedValue([
        { bucket: "2026-03-10T00:00:00Z", network: "NEM", region: "NSW1", avg_demand_mw: 80, avg_renewables_pct: 35, avg_price_dollar_per_mwh: 60 },
        { bucket: "2026-03-11T00:00:00Z", network: "NEM", region: "NSW1", avg_demand_mw: 90, avg_renewables_pct: 50, avg_price_per_mwh: 55 },
        { bucket: "2026-03-12T00:00:00Z", network: "NEM", region: "NSW1", fueltech: "wind", avg_demand_mw: 999, avg_renewables_pct: 999, avg_price_dollar_per_mwh: 999 },
        ]);

        const stats = await mod.computeStats("NEM", "7d", "NSW1");

        expect(stats).toEqual({
        demand_mw: {
            min: { value: 80, timestamp: "2026-03-10T00:00:00Z" },
            max: { value: 90, timestamp: "2026-03-11T00:00:00Z" },
        },
        renewables_pct: {
            min: { value: 35, timestamp: "2026-03-10T00:00:00Z" },
            max: { value: 50, timestamp: "2026-03-11T00:00:00Z" },
        },
        price: {
            min: { value: 55, timestamp: "2026-03-11T00:00:00Z" },
            max: { value: 60, timestamp: "2026-03-10T00:00:00Z" },
        },
        });
    });


    it("computeStats returns null stats when no matching rows", async () => {
        const mod = await loadModule();

        getDailyRollupKeysForDaysMock.mockReturnValue(["d1"]);
        getNdjsonManyMock.mockResolvedValue([]);

        const stats = await mod.computeStats("NEM", "90d", "NSW1");

        expect(stats).toEqual({
        demand_mw: { min: { value: null, timestamp: null }, max: { value: null, timestamp: null } },
        renewables_pct: { min: { value: null, timestamp: null }, max: { value: null, timestamp: null } },
        price: { min: { value: null, timestamp: null }, max: { value: null, timestamp: null } },
        });
    });

    it("getBufferSize returns recentBuffer length", async () => {
        const mod = await loadModule();

        recentBufferMock.push({ a: 1 }, { b: 2 }, { c: 3 });
        expect(mod.getBufferSize()).toBe(3);
    });
});
