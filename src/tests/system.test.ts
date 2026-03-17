import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s3Mocks = vi.hoisted(() => ({
  getRawKeysForRangeMock: vi.fn(),
  getJsonManyMock: vi.fn(),
  getDailyRollupKeysForDaysMock: vi.fn(),
  getHourlyRollupKeysForRangeMock: vi.fn(),
  getNdjsonManyMock: vi.fn(),
}));

vi.mock("../s3", () => ({
  getRawKeysForRange: s3Mocks.getRawKeysForRangeMock,
  getJsonMany: s3Mocks.getJsonManyMock,
  getDailyRollupKeysForDays: s3Mocks.getDailyRollupKeysForDaysMock,
  getHourlyRollupKeysForRange: s3Mocks.getHourlyRollupKeysForRangeMock,
  getNdjsonMany: s3Mocks.getNdjsonManyMock,
}));

const AUTH_HEADER = {
  authorization: "Bearer system-test-key",
};

function makeSnapshot(network: "NEM" | "WEM", overrides: Record<string, unknown> = {}) {
  const defaultRegion =
    network === "NEM"
      ? {
          NSW1: {
            price_dollar_per_mwh: 80,
            demand_mw: 60,
            summary: {
              net_generation_mw: 70,
              renewables_mw: 30,
              renewables_pct: 42.9,
              demand_mw: 60,
            },
            generation: [{ fueltech: "wind", label: "Wind", power_mw: 35, proportion_pct: 50, price_dollar_per_mwh: 75, total_energy_mwh: 17 }],
            loads: [{ fueltech: "battery_charging", label: "Battery (Charging)", power_mw: 5, proportion_pct: 7.1, price_dollar_per_mwh: 20, total_energy_mwh: 2 }],
            curtailment: [{ fueltech: "wind", label: "Wind", power_mw: 1, proportion_pct: 1.4 }],
            emissions: { volume_tco2e_per_30m: 7, intensity_kgco2e_per_mwh: 110 },
          },
        }
      : {
          WEM: {
            price_dollar_per_mwh: 50,
            demand_mw: 35,
            summary: {
              net_generation_mw: 40,
              renewables_mw: 10,
              renewables_pct: 25,
              demand_mw: 35,
            },
            generation: [{ fueltech: "gas_ccgt", label: "Gas (CCGT)", power_mw: 40, proportion_pct: 100, price_dollar_per_mwh: 50, total_energy_mwh: 20 }],
            loads: [],
            curtailment: [],
            emissions: { volume_tco2e_per_30m: 8, intensity_kgco2e_per_mwh: 130 },
          },
        };

  return {
    updated_at: "2026-03-17T10:00:00Z",
    network,
    summary: {
      net_generation_mw: network === "NEM" ? 70 : 40,
      renewables_mw: network === "NEM" ? 30 : 10,
      renewables_pct: network === "NEM" ? 42.9 : 25,
      demand_mw: network === "NEM" ? 60 : 35,
    },
    generation:
      network === "NEM"
        ? [{ fueltech: "wind", label: "Wind", power_mw: 35, proportion_pct: 50, price_dollar_per_mwh: 75, total_energy_mwh: 17 }]
        : [{ fueltech: "gas_ccgt", label: "Gas (CCGT)", power_mw: 40, proportion_pct: 100, price_dollar_per_mwh: 50, total_energy_mwh: 20 }],
    loads: network === "NEM" ? [{ fueltech: "battery_charging", label: "Battery (Charging)", power_mw: 5, proportion_pct: 7.1, price_dollar_per_mwh: 20, total_energy_mwh: 2 }] : [],
    curtailment: network === "NEM" ? [{ fueltech: "wind", label: "Wind", power_mw: 1, proportion_pct: 1.4 }] : [],
    emissions: {
      volume_tco2e_per_30m: network === "NEM" ? 7 : 8,
      intensity_kgco2e_per_mwh: network === "NEM" ? 110 : 130,
    },
    regions: defaultRegion,
    ...overrides,
  };
}

async function buildSystemApp() {
  vi.resetModules();

  const [{ default: Fastify }, { default: websocket }, { default: restRoutes }, { default: sseRoutes }, { default: wsRoutes }, cache] =
    await Promise.all([
      import("fastify"),
      import("@fastify/websocket"),
      import("../routes/rest"),
      import("../routes/sse"),
      import("../routes/ws"),
      import("../cache"),
    ]);

  const app = Fastify();
  await app.register(websocket);
  await app.register(restRoutes);
  await app.register(sseRoutes);
  await app.register(wsRoutes);

  return { app, cache };
}

describe("system tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T12:00:00Z"));
    process.env.API_KEY = "system-test-key";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves health publicly and protects live endpoints with bearer auth", async () => {
    const { app } = await buildSystemApp();

    try {
      const health = await app.inject({ method: "GET", url: "/v1/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({
        success: true,
        data: {
          status: "ok",
          buffer_size: 0,
          last_poll_at: null,
        },
      });

      const live = await app.inject({ method: "GET", url: "/v1/live" });
      expect(live.statusCode).toBe(401);
      expect(live.json()).toEqual({ success: false, error: "Unauthorized" });
    } finally {
      await app.close();
    }
  });

 
  it("returns live snapshots and region pricing from the real route stack", async () => {
    const { app, cache } = await buildSystemApp();

    try {
      cache.addSnapshotsToBuffer(
        {
          NEM: makeSnapshot("NEM"),
          WEM: makeSnapshot("WEM"),
        },
        new Date("2026-03-17T10:00:00Z"),
      );

      const live = await app.inject({
        method: "GET",
        url: "/v1/live?network=NEM",
        headers: AUTH_HEADER,
      });
      expect(live.statusCode).toBe(200);
      expect(live.json()).toMatchObject({
        success: true,
        updated_at: "2026-03-17T10:00:00Z",
        data: {
          network: "NEM",
          summary: {
            net_generation_mw: 70,
          },
        },
      });

      const price = await app.inject({
        method: "GET",
        url: "/v1/live/price",
        headers: AUTH_HEADER,
      });
      expect(price.statusCode).toBe(200);
      expect(price.json().data).toEqual(
        expect.arrayContaining([
          {
            network: "NEM",
            region: "NSW1",
            price_dollar_per_mwh: 80,
            demand_mw: 60,
          },
          {
            network: "WEM",
            region: "WEM",
            price_dollar_per_mwh: 50,
            demand_mw: 35,
          },
        ]),
      );

      const region = await app.inject({
        method: "GET",
        url: "/v1/live/region/NSW1",
        headers: AUTH_HEADER,
      });
      expect(region.statusCode).toBe(200);
      expect(region.json()).toMatchObject({
        success: true,
        updated_at: "2026-03-17T10:00:00Z",
        data: {
          network: "NEM",
          region: "NSW1",
          price_dollar_per_mwh: 80,
        },
      });
    } finally {
      await app.close();
    }
  });

  it("serves 24h history from the in-memory buffer using the real query code", async () => {
    const { app, cache } = await buildSystemApp();

    try {
      cache.addSnapshotsToBuffer(
        {
          NEM: makeSnapshot("NEM", {
            updated_at: "2026-03-17T09:55:00Z",
            regions: {
              NSW1: {
                ...makeSnapshot("NEM").regions.NSW1,
                generation: [{ fueltech: "wind", label: "Wind", power_mw: 30, proportion_pct: 50, price_dollar_per_mwh: 70, total_energy_mwh: 15 }],
              },
            },
          }),
        },
        new Date("2026-03-17T09:55:00Z"),
      );

      cache.addSnapshotsToBuffer(
        {
          NEM: makeSnapshot("NEM"),
        },
        new Date("2026-03-17T10:00:00Z"),
      );

      const response = await app.inject({
        method: "GET",
        url: "/v1/history?metric=price&network=NEM&range=24h&interval=5m&region=NSW1&fueltech=wind",
        headers: AUTH_HEADER,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        data: {
          metric: "price",
          interval: "5m",
          range: "24h",
          series: [
            { timestamp: "2026-03-17T09:55:00Z", value: 70 },
            { timestamp: "2026-03-17T10:00:00Z", value: 75 },
          ],
        },
      });
    } finally {
      await app.close();
    }
  });

  it("serves historical rollups and computed stats through the real HTTP endpoints", async () => {
    const { app, cache } = await buildSystemApp();

    try {
      cache.addSnapshotsToBuffer(
        {
          NEM: makeSnapshot("NEM"),
        },
        new Date("2026-03-17T10:00:00Z"),
      );

      s3Mocks.getHourlyRollupKeysForRangeMock.mockReturnValue(["hourly-1"]);
      s3Mocks.getDailyRollupKeysForDaysMock.mockReturnValue(["daily-1"]);
      s3Mocks.getNdjsonManyMock
        .mockResolvedValueOnce([
          {
            bucket: "2026-03-16T09:00:00Z",
            network: "NEM",
            region: "NSW1",
            avg_price_dollar_per_mwh: 81,
          },
        ])
        .mockResolvedValueOnce([
          {
            bucket: "2026-03-10T00:00:00Z",
            network: "NEM",
            region: "NSW1",
            avg_demand_mw: 80,
            avg_renewables_pct: 35,
            avg_price_dollar_per_mwh: 60,
          },
          {
            bucket: "2026-03-11T00:00:00Z",
            network: "NEM",
            region: "NSW1",
            avg_demand_mw: 90,
            avg_renewables_pct: 50,
            avg_price_per_mwh: 55,
          },
        ]);

      const history = await app.inject({
        method: "GET",
        url: "/v1/history?metric=price&network=NEM&range=7d&interval=1h&region=NSW1",
        headers: AUTH_HEADER,
      });
      expect(history.statusCode).toBe(200);
      expect(history.json().data.series).toEqual([{ timestamp: "2026-03-16T09:00:00Z", value: 81 }]);

      const stats = await app.inject({
        method: "GET",
        url: "/v1/stats?range=7d&network=NEM&region=NSW1",
        headers: AUTH_HEADER,
      });
      expect(stats.statusCode).toBe(200);
      expect(stats.json()).toMatchObject({
        success: true,
        data: {
          demand_mw: {
            min: { value: 80, timestamp: "2026-03-10T00:00:00Z" },
            max: { value: 90, timestamp: "2026-03-11T00:00:00Z" },
          },
          price: {
            min: { value: 55, timestamp: "2026-03-11T00:00:00Z" },
            max: { value: 60, timestamp: "2026-03-10T00:00:00Z" },
          },
        },
      });
    } finally {
      await app.close();
    }
  });


  it("rejects invalid history queries", async () => {
    const { app } = await buildSystemApp();

    try {
      const missingMetric = await app.inject({
        method: "GET",
        url: "/v1/history?network=NEM",
        headers: AUTH_HEADER,
      });
      expect(missingMetric.statusCode).toBe(400);
      expect(missingMetric.json()).toEqual({ success: false, error: "Invalid history query" });

      const invalidInterval = await app.inject({
        method: "GET",
        url: "/v1/history?metric=price&network=NEM&range=7d&interval=2h",
        headers: AUTH_HEADER,
      });
      expect(invalidInterval.statusCode).toBe(400);
      expect(invalidInterval.json()).toEqual({ success: false, error: "Invalid history query" });
    } finally {
      await app.close();
    }
  });

  it("uses default history query params when only metric is provided", async () => {
    const { app, cache } = await buildSystemApp();

    try {
      cache.addSnapshotsToBuffer(
        {
          NEM: makeSnapshot("NEM"),
        },
        new Date("2026-03-17T10:00:00Z"),
      );

      s3Mocks.getHourlyRollupKeysForRangeMock.mockReturnValue(["hourly-default"]);
      s3Mocks.getNdjsonManyMock.mockResolvedValue([
        {
          bucket: "2026-03-16T09:00:00Z",
          network: "NEM",
          avg_price_dollar_per_mwh: 79,
        },
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/v1/history?metric=price",
        headers: AUTH_HEADER,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        updated_at: "2026-03-17T10:00:00Z",
        data: {
          metric: "price",
          interval: "1h",
          range: "7d",
          series: [{ timestamp: "2026-03-16T09:00:00Z", value: 79 }],
        },
      });
      expect(s3Mocks.getHourlyRollupKeysForRangeMock).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it("serves region fueltech history from loads and curtailment fallback rows", async () => {
    const { app, cache } = await buildSystemApp();

    try {
      cache.addSnapshotsToBuffer(
        {
          NEM: makeSnapshot("NEM", {
            updated_at: "2026-03-17T09:55:00Z",
            regions: {
              NSW1: {
                ...makeSnapshot("NEM").regions.NSW1,
                generation: [],
                loads: [{ fueltech: "battery_charging", label: "Battery (Charging)", power_mw: 12, proportion_pct: 20, price_dollar_per_mwh: 25, total_energy_mwh: 6 }],
                curtailment: [],
              },
            },
          }),
        },
        new Date("2026-03-17T09:55:00Z"),
      );

      cache.addSnapshotsToBuffer(
        {
          NEM: makeSnapshot("NEM", {
            updated_at: "2026-03-17T10:00:00Z",
            regions: {
              NSW1: {
                ...makeSnapshot("NEM").regions.NSW1,
                generation: [],
                loads: [],
                curtailment: [{ fueltech: "solar_utility", label: "Solar (Utility)", power_mw: 3, proportion_pct: 4.3 }],
              },
            },
          }),
        },
        new Date("2026-03-17T10:00:00Z"),
      );

      const loadsResponse = await app.inject({
        method: "GET",
        url: "/v1/history?metric=generation_mw&network=NEM&range=24h&interval=5m&region=NSW1&fueltech=battery_charging",
        headers: AUTH_HEADER,
      });

      expect(loadsResponse.statusCode).toBe(200);
      expect(loadsResponse.json().data.series).toEqual([
        { timestamp: "2026-03-17T09:55:00Z", value: 12 },
        { timestamp: "2026-03-17T10:00:00Z", value: null },
      ]);

      const curtailmentResponse = await app.inject({
        method: "GET",
        url: "/v1/history?metric=generation_mw&network=NEM&range=24h&interval=5m&region=NSW1&fueltech=solar_utility",
        headers: AUTH_HEADER,
      });

      expect(curtailmentResponse.statusCode).toBe(200);
      expect(curtailmentResponse.json().data.series).toEqual([
        { timestamp: "2026-03-17T09:55:00Z", value: null },
        { timestamp: "2026-03-17T10:00:00Z", value: 3 },
      ]);
    } finally {
      await app.close();
    }
  });

  it("rejects unauthorized SSE connections before opening a stream", async () => {
    const { app } = await buildSystemApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/v1/events",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ success: false, error: "Unauthorized" });
    } finally {
      await app.close();
    }
  });
});
