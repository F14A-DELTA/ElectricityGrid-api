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

 
