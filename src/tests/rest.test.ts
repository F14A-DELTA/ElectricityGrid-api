import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import restRoutes from "../routes/rest";

const mocks = vi.hoisted(() => {
  const enforceAuthMock = vi.fn();
  const computeStatsMock = vi.fn();
  const queryHistoryMock = vi.fn();

  const recentBuffer: any[] = [];
  let latestSnapshot: any = null;
  let lastPollAt: Date | null = null;

  return {
    enforceAuthMock,
    computeStatsMock,
    queryHistoryMock,
    recentBuffer,
    get latestSnapshot() {
      return latestSnapshot;
    },
    set latestSnapshot(value: any) {
      latestSnapshot = value;
    },
    get lastPollAt() {
      return lastPollAt;
    },
    set lastPollAt(value: Date | null) {
      lastPollAt = value;
    },
  };
});

vi.mock("../auth", () => ({
  enforceAuth: (...args: any[]) => mocks.enforceAuthMock(...args),
}));

vi.mock("../cache", () => ({
  get latestSnapshot() {
    return mocks.latestSnapshot;
  },
  recentBuffer: mocks.recentBuffer,
}));

vi.mock("../poller", () => ({
  get lastPollAt() {
    return mocks.lastPollAt;
  },
}));

vi.mock("../s3-query", () => ({
  computeStats: (...args: any[]) => mocks.computeStatsMock(...args),
  queryHistory: (...args: any[]) => mocks.queryHistoryMock(...args),
}));

function makeRegion(
  price: number,
  demand: number,
  netGen: number,
  renewablesMw: number,
  emissionsVolume: number,
  emissionsIntensity: number,
) {
  return {
    price_dollar_per_mwh: price,
    demand_mw: demand,
    summary: {
      net_generation_mw: netGen,
      renewables_mw: renewablesMw,
      renewables_pct: netGen > 0 ? Number(((renewablesMw / netGen) * 100).toFixed(1)) : null,
      demand_mw: demand,
    },
    generation: [],
    loads: [],
    curtailment: [],
    emissions: {
      volume_tco2e_per_30m: emissionsVolume,
      intensity_kgco2e_per_mwh: emissionsIntensity,
    },
  };
}

function seedSnapshots() {
  mocks.latestSnapshot = {
    NEM: {
      updated_at: "2026-03-17T10:00:00Z",
      network: "NEM",
      summary: {
        net_generation_mw: 150,
        renewables_mw: 70,
        renewables_pct: 46.7,
        demand_mw: 130,
      },
      generation: [],
      loads: [],
      curtailment: [],
      emissions: {
        volume_tco2e_per_30m: 20,
        intensity_kgco2e_per_mwh: 110,
      },
      regions: {
        NSW1: makeRegion(100, 60, 70, 30, 7, 120),
        QLD1: makeRegion(80, 70, 80, 40, 8, 100),
      },
    },
    WEM: {
      updated_at: "2026-03-17T10:00:00Z",
      network: "WEM",
      summary: {
        net_generation_mw: 40,
        renewables_mw: 10,
        renewables_pct: 25,
        demand_mw: 35,
      },
      generation: [],
      loads: [],
      curtailment: [],
      emissions: {
        volume_tco2e_per_30m: 8,
        intensity_kgco2e_per_mwh: 130,
      },
      regions: {
        WEM: makeRegion(50, 35, 40, 10, 8, 130),
      },
    },
  };
}

async function buildApp() {
  const app = Fastify();
  await app.register(restRoutes as any);
  return app;
}

describe("rest routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latestSnapshot = null;
    mocks.lastPollAt = null;
    mocks.recentBuffer.length = 0;
    mocks.computeStatsMock.mockResolvedValue({ hello: "stats" });
    mocks.queryHistoryMock.mockResolvedValue([{ timestamp: "2026-03-17T00:00:00Z", value: 1 }]);
  });

  it("GET /v1/health works without auth and returns health payload", async () => {
    const app = await buildApp();
    mocks.lastPollAt = new Date("2026-03-17T09:00:00Z");
    mocks.recentBuffer.push({ a: 1 }, { b: 2 });

    const res = await app.inject({ method: "GET", url: "/v1/health" });
    const body = res.json();
    const health = body.events[0].attribute;

    expect(res.statusCode).toBe(200);
    expect(body.dataset_type).toBe("health_status");
    expect(body.events[0].event_type).toBe("health_check");
    expect(health.status).toBe("ok");
    expect(health.buffer_size).toBe(2);
    expect(health.last_poll_at).toBe("2026-03-17T09:00:00.000Z");
    expect(mocks.enforceAuthMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("auth hook runs for protected routes", async () => {
    const app = await buildApp();

    await app.inject({ method: "GET", url: "/v1/live" });
    expect(mocks.enforceAuthMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("GET /v1/live returns 503 when cache is empty", async () => {
    const app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/v1/live" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ success: false, error: "Cache not yet warm" });

    await app.close();
  });

  it("GET /v1/live validates network query and returns 400/404/success", async () => {
    const app = await buildApp();
    seedSnapshots();

    const bad = await app.inject({ method: "GET", url: "/v1/live?network=BAD" });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({ method: "GET", url: "/v1/live?network=WEM" });
    
    mocks.latestSnapshot = { NEM: mocks.latestSnapshot.NEM };
    const missing2 = await app.inject({ method: "GET", url: "/v1/live?network=WEM" });
    expect(missing2.statusCode).toBe(404);

    seedSnapshots();
    const ok = await app.inject({ method: "GET", url: "/v1/live?network=NEM" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().events[0].attribute.network).toBe("NEM");

    await app.close();
  });

  it("GET /v1/live (no network) returns all snapshots", async () => {
    const app = await buildApp();
    seedSnapshots();

    const res = await app.inject({ method: "GET", url: "/v1/live" });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.dataset_type).toBe("live_snapshot_collection");
    expect(body.events[0].attribute.NEM).toBeDefined();
    expect(body.events[0].attribute.WEM).toBeDefined();

    await app.close();
  });

  it("GET /v1/live/region/:region handles invalid/empty/missing/success", async () => {
    const app = await buildApp();

    const invalid = await app.inject({ method: "GET", url: "/v1/live/region/ABC" });
    expect(invalid.statusCode).toBe(404);

    const empty = await app.inject({ method: "GET", url: "/v1/live/region/NSW1" });
    expect(empty.statusCode).toBe(503);

    seedSnapshots();
    delete mocks.latestSnapshot.NEM.regions.NSW1;
    const missing = await app.inject({ method: "GET", url: "/v1/live/region/NSW1" });
    expect(missing.statusCode).toBe(404);

    seedSnapshots();
    const ok = await app.inject({ method: "GET", url: "/v1/live/region/NSW1" });
    const body = ok.json();
    expect(ok.statusCode).toBe(200);
    expect(body.events[0].attribute.region).toBe("NSW1");
    expect(body.events[0].attribute.network).toBe("NEM");

    await app.close();
  });

  it("GET /v1/live/price handles empty and success", async () => {
    const app = await buildApp();

    const empty = await app.inject({ method: "GET", url: "/v1/live/price" });
    expect(empty.statusCode).toBe(503);

    seedSnapshots();
    const ok = await app.inject({ method: "GET", url: "/v1/live/price" });
    const body = ok.json();

    expect(ok.statusCode).toBe(200);
    expect(Array.isArray(body.events[0].attribute)).toBe(true);
    expect(body.events[0].attribute.some((x: any) => x.region === "NSW1")).toBe(true);

    await app.close();
  });

  it("GET /v1/stats validates query and returns stats", async () => {
    const app = await buildApp();
    seedSnapshots();

    const badRange = await app.inject({ method: "GET", url: "/v1/stats?range=24h" });
    expect(badRange.statusCode).toBe(400);

    const badNetwork = await app.inject({ method: "GET", url: "/v1/stats?network=BAD" });
    expect(badNetwork.statusCode).toBe(400);

    const ok = await app.inject({ method: "GET", url: "/v1/stats?range=7d&network=NEM&region=NSW1" });
    expect(ok.statusCode).toBe(200);
    expect(mocks.computeStatsMock).toHaveBeenCalledWith("NEM", "7d", "NSW1");

    await app.close();
  });

  it("GET /v1/history validates query and returns series", async () => {
    const app = await buildApp();
    seedSnapshots();

    const missingMetric = await app.inject({ method: "GET", url: "/v1/history?network=NEM" });
    expect(missingMetric.statusCode).toBe(400);

    const badMetric = await app.inject({ method: "GET", url: "/v1/history?metric=bad&network=NEM&range=7d&interval=1h" });
    expect(badMetric.statusCode).toBe(400);

    const badInterval = await app.inject({ method: "GET", url: "/v1/history?metric=price&network=NEM&range=7d&interval=2h" });
    expect(badInterval.statusCode).toBe(400);

    const badRange = await app.inject({ method: "GET", url: "/v1/history?metric=price&network=NEM&range=2d&interval=1h" });
    expect(badRange.statusCode).toBe(400);

    const badNetwork = await app.inject({ method: "GET", url: "/v1/history?metric=price&network=BAD&range=7d&interval=1h" });
    expect(badNetwork.statusCode).toBe(400);

    const ok = await app.inject({
      method: "GET",
      url: "/v1/history?metric=price&network=NEM&range=7d&interval=1h&region=NSW1&fueltech=wind",
    });
    const body = ok.json();

    expect(ok.statusCode).toBe(200);
    expect(body.dataset_type).toBe("historical_series");
    expect(body.events[0].attribute.metric).toBe("price");
    expect(mocks.queryHistoryMock).toHaveBeenCalledWith({
      metric: "price",
      interval: "1h",
      range: "7d",
      network: "NEM",
      region: "NSW1",
      fueltech: "wind",
    });

    await app.close();
  });
});
