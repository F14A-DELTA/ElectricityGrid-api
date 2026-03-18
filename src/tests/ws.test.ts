import { describe, it, expect, beforeEach, vi } from "vitest";
import wsRoutesPlugin, { applySubscriptions } from "../routes/ws";

const mocks = vi.hoisted(() => {
  const validateAuthMock = vi.fn();
  const emitterOnMock = vi.fn();
  const emitterOffMock = vi.fn();

  const latestSnapshotMock = {
    NEM: {
      updated_at: "2026-03-17T10:00:00Z",
      network: "NEM",
      summary: {
        net_generation_mw: 100,
        renewables_mw: 50,
        renewables_pct: 50,
        demand_mw: 90,
      },
      generation: [
        { fueltech: "wind", label: "Wind", power_mw: 60, proportion_pct: 60, price_dollar_per_mwh: 70, total_energy_mwh: 30 },
        { fueltech: "coal_black", label: "Coal (Black)", power_mw: 40, proportion_pct: 40, price_dollar_per_mwh: 80, total_energy_mwh: 20 },
      ],
      loads: [{ fueltech: "battery_charging", label: "Battery (Charging)", power_mw: 10, proportion_pct: 10, price_dollar_per_mwh: 20, total_energy_mwh: 5 }],
      curtailment: [{ fueltech: "wind", label: "Wind", power_mw: 2, proportion_pct: 2 }],
      emissions: { volume_tco2e_per_30m: 11, intensity_kgco2e_per_mwh: 100 },
      regions: {
        NSW1: {
          price_dollar_per_mwh: 100,
          demand_mw: 60,
          summary: { net_generation_mw: 70, renewables_mw: 30, renewables_pct: 42.9, demand_mw: 60 },
          generation: [{ fueltech: "wind", label: "Wind", power_mw: 35, proportion_pct: 50, price_dollar_per_mwh: 75, total_energy_mwh: 17 }],
          loads: [{ fueltech: "battery_charging", label: "Battery (Charging)", power_mw: 5, proportion_pct: 7.1, price_dollar_per_mwh: 20, total_energy_mwh: 2 }],
          curtailment: [{ fueltech: "wind", label: "Wind", power_mw: 1, proportion_pct: 1.4 }],
          emissions: { volume_tco2e_per_30m: 7, intensity_kgco2e_per_mwh: 110 },
        },
        QLD1: {
          price_dollar_per_mwh: 80,
          demand_mw: 30,
          summary: { net_generation_mw: 30, renewables_mw: 20, renewables_pct: 66.7, demand_mw: 30 },
          generation: [{ fueltech: "solar_utility", label: "Solar (Utility)", power_mw: 20, proportion_pct: 66.7, price_dollar_per_mwh: 60, total_energy_mwh: 10 }],
          loads: [{ fueltech: "battery_charging", label: "Battery (Charging)", power_mw: 5, proportion_pct: 16.7, price_dollar_per_mwh: 25, total_energy_mwh: 3 }],
          curtailment: [{ fueltech: "solar_utility", label: "Solar (Utility)", power_mw: 1, proportion_pct: 3.3 }],
          emissions: { volume_tco2e_per_30m: 4, intensity_kgco2e_per_mwh: 90 },
        },
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
      generation: [{ fueltech: "gas_ccgt", label: "Gas (CCGT)", power_mw: 40, proportion_pct: 100, price_dollar_per_mwh: 50, total_energy_mwh: 20 }],
      loads: [],
      curtailment: [],
      emissions: { volume_tco2e_per_30m: 8, intensity_kgco2e_per_mwh: 130 },
      regions: {
        WEM: {
          price_dollar_per_mwh: 50,
          demand_mw: 35,
          summary: { net_generation_mw: 40, renewables_mw: 10, renewables_pct: 25, demand_mw: 35 },
          generation: [{ fueltech: "gas_ccgt", label: "Gas (CCGT)", power_mw: 40, proportion_pct: 100, price_dollar_per_mwh: 50, total_energy_mwh: 20 }],
          loads: [],
          curtailment: [],
          emissions: { volume_tco2e_per_30m: 8, intensity_kgco2e_per_mwh: 130 },
        },
      },
    },
  };

  return { validateAuthMock, emitterOnMock, emitterOffMock, latestSnapshotMock };
});

vi.mock("../auth", () => ({
  validateAuth: (...args: any[]) => mocks.validateAuthMock(...args),
}));

vi.mock("../cache", () => ({
  latestSnapshot: mocks.latestSnapshotMock,
}));

vi.mock("../poller", () => ({
  emitter: {
    on: (...args: any[]) => mocks.emitterOnMock(...args),
    off: (...args: any[]) => mocks.emitterOffMock(...args),
  },
}));

function createSocketMock() {
  const handlers: Record<string, (arg?: unknown) => void> = {};
  return {
    send: vi.fn(),
    on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
      handlers[event] = cb;
    }),
    emitLocal(event: string, arg?: unknown) {
      handlers[event]?.(arg);
    },
  };
}

function getLastSentPayload(socket: ReturnType<typeof createSocketMock>) {
  const lastCall = socket.send.mock.calls.at(-1);
  expect(lastCall).toBeDefined();
  if (!lastCall) throw new Error("No socket message was sent");
  return JSON.parse(String(lastCall[0]));
}

describe("ws route testing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateAuthMock.mockReturnValue(true);
  });

  it("registers /v1/ws and blocks unauthorized in preValidation", async () => {
    let preValidation: any;
    const fastifyMock = {
      get: vi.fn((_path: string, opts: any) => {
        preValidation = opts.preValidation;
      }),
    };

    await (wsRoutesPlugin as any)(fastifyMock);

    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    mocks.validateAuthMock.mockReturnValue(false);

    await preValidation({ headers: {} }, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: "Unauthorized" });
  });

  it("sends initial snapshot and handles invalid message", async () => {
    let wsHandler: any;
    const fastifyMock = {
      get: vi.fn((_path: string, _opts: any, handler: any) => {
        wsHandler = handler;
      }),
    };

    await (wsRoutesPlugin as any)(fastifyMock);

    const socket = createSocketMock();
    wsHandler(socket, {});

    const firstMsg = JSON.parse(String(socket.send.mock.calls[0][0]));
    expect(firstMsg.event).toBe("energy_update");
    expect(firstMsg.data.dataset_type).toBe("stream_snapshot");
    expect(firstMsg.data.events[0].event_type).toBe("energy_update");
    expect(firstMsg.data.events[0].attribute).toEqual(mocks.latestSnapshotMock);

    socket.emitLocal("message", "{bad json");
    const errorMsg = JSON.parse(String(socket.send.mock.calls[1][0]));
    expect(errorMsg).toEqual({ event: "error", error: "Invalid subscription message" });
  });

  it("subscribes/unsubscribes and cleans up on close/error", async () => {
    let wsHandler: any;
    const fastifyMock = {
      get: vi.fn((_path: string, _opts: any, handler: any) => {
        wsHandler = handler;
      }),
    };

    await (wsRoutesPlugin as any)(fastifyMock);

    const socket = createSocketMock();
    wsHandler(socket, {});

    const updateHandler = mocks.emitterOnMock.mock.calls[0][1];

    socket.emitLocal("message", JSON.stringify({ action: "subscribe", regions: ["NSW1"], metrics: ["price"] }));
    updateHandler({ nem: mocks.latestSnapshotMock.NEM, wem: mocks.latestSnapshotMock.WEM });

    const subscribedPayload = getLastSentPayload(socket);
    expect(subscribedPayload.data.events[0].attribute.NEM.regions.NSW1).toBeDefined();
    expect(subscribedPayload.data.events[0].attribute.NEM.regions.QLD1).toBeUndefined();

    socket.emitLocal("message", JSON.stringify({ action: "unsubscribe", regions: ["NSW1"], metrics: ["price"] }));
    updateHandler({ nem: mocks.latestSnapshotMock.NEM, wem: mocks.latestSnapshotMock.WEM });

    const unsubscribedPayload = getLastSentPayload(socket);
    expect(unsubscribedPayload.data.events[0].attribute.NEM.regions.NSW1).toBeDefined();

    socket.emitLocal("close");
    socket.emitLocal("error");
    expect(mocks.emitterOffMock).toHaveBeenCalled();
  });
});

describe("applySubscriptions", () => {
  it("returns snapshots unchanged with empty subscriptions", () => {
    const result = applySubscriptions(
      { NEM: mocks.latestSnapshotMock.NEM as any, WEM: mocks.latestSnapshotMock.WEM as any },
      { regions: new Set(), metrics: new Set() },
    );

    expect(result.NEM?.summary.net_generation_mw).toBe(100);
    expect(Object.keys(result.NEM?.regions ?? {})).toContain("NSW1");
    expect(Object.keys(result.NEM?.regions ?? {})).toContain("QLD1");
  });

  it("filters by regions and recomputes aggregates", () => {
    const result = applySubscriptions(
      { NEM: mocks.latestSnapshotMock.NEM as any },
      { regions: new Set(["NSW1"]), metrics: new Set() },
    );

    expect(result.NEM?.summary.net_generation_mw).toBe(70);
    expect(result.NEM?.summary.demand_mw).toBe(60);
    expect(result.NEM?.regions.NSW1).toBeDefined();
    expect(result.NEM?.regions.QLD1).toBeUndefined();
  });

  it("filters snapshots down to price-only metric subscriptions", () => {
    const result = applySubscriptions(
      { NEM: mocks.latestSnapshotMock.NEM as any, WEM: mocks.latestSnapshotMock.WEM as any },
      { regions: new Set(["NSW1"]), metrics: new Set(["price"]) },
    );

    expect(result.NEM?.summary.net_generation_mw).toBeNull();
    expect(result.NEM?.summary.renewables_pct).toBeNull();
    expect(result.NEM?.summary.demand_mw).toBeNull();
    expect(result.NEM?.generation).toHaveLength(1);
    expect(result.NEM?.loads).toHaveLength(1);
    expect(result.NEM?.curtailment).toEqual([]);
    expect(result.NEM?.emissions).toEqual({
      volume_tco2e_per_30m: null,
      intensity_kgco2e_per_mwh: null,
    });
    expect(result.NEM?.regions.NSW1?.price_dollar_per_mwh).toBe(100);
    expect(result.NEM?.regions.NSW1?.emissions).toEqual({
      volume_tco2e_per_30m: null,
      intensity_kgco2e_per_mwh: null,
    });
  });

  it("preserves emissions when only emissions metrics are subscribed", () => {
    const result = applySubscriptions(
      { NEM: mocks.latestSnapshotMock.NEM as any },
      { regions: new Set(["NSW1"]), metrics: new Set(["emissions_volume"]) },
    );

    expect(result.NEM?.generation).toEqual([]);
    expect(result.NEM?.loads).toEqual([]);
    expect(result.NEM?.curtailment).toEqual([]);
    expect(result.NEM?.summary.net_generation_mw).toBeNull();
    expect(result.NEM?.emissions).toEqual({
      volume_tco2e_per_30m: 7,
      intensity_kgco2e_per_mwh: 110,
    });
    expect(result.NEM?.regions.NSW1?.emissions).toEqual({
      volume_tco2e_per_30m: 7,
      intensity_kgco2e_per_mwh: 110,
    });
  });

  it("retains generation, renewables, demand, and emission intensity metrics when subscribed", () => {
    const result = applySubscriptions(
      { NEM: mocks.latestSnapshotMock.NEM as any },
      {
        regions: new Set(["NSW1"]),
        metrics: new Set(["generation_mw", "renewables_pct", "demand_mw", "emission_intensity"]),
      },
    );

    expect(result.NEM?.summary).toEqual({
      net_generation_mw: 70,
      renewables_mw: 30,
      renewables_pct: 42.9,
      demand_mw: 60,
    });
    expect(result.NEM?.generation).toHaveLength(1);
    expect(result.NEM?.loads).toHaveLength(1);
    expect(result.NEM?.curtailment).toHaveLength(1);
    expect(result.NEM?.emissions).toEqual({
      volume_tco2e_per_30m: 7,
      intensity_kgco2e_per_mwh: 110,
    });
    expect(result.NEM?.regions.NSW1?.summary).toEqual({
      net_generation_mw: 70,
      renewables_mw: 30,
      renewables_pct: 42.9,
      demand_mw: 60,
    });
  });

  it("handles zero-generation selected regions when recomputing proportions", () => {
    const zeroRegion = {
      price_dollar_per_mwh: 0,
      demand_mw: 0,
      summary: {
        net_generation_mw: 0,
        renewables_mw: 0,
        renewables_pct: null,
        demand_mw: 0,
      },
      generation: [{ fueltech: "wind", label: "Wind", power_mw: 0, proportion_pct: null, price_dollar_per_mwh: 0, total_energy_mwh: 0 }],
      loads: [{ fueltech: "battery_charging", label: "Battery (Charging)", power_mw: 5, proportion_pct: null, price_dollar_per_mwh: 0, total_energy_mwh: 1 }],
      curtailment: [{ fueltech: "wind", label: "Wind", power_mw: 2, proportion_pct: null }],
      emissions: { volume_tco2e_per_30m: 0, intensity_kgco2e_per_mwh: null },
    };

    const result = applySubscriptions(
      { NEM: { ...(mocks.latestSnapshotMock.NEM as any), regions: { ZERO: zeroRegion } } },
      { regions: new Set(["ZERO"]), metrics: new Set(["generation_mw"]) },
    );

    expect(result.NEM?.summary).toEqual({
      net_generation_mw: 0,
      renewables_mw: null,
      renewables_pct: null,
      demand_mw: null,
    });
    expect(result.NEM?.generation[0]?.proportion_pct).toBeNull();
    expect(result.NEM?.loads[0]?.proportion_pct).toBeNull();
    expect(result.NEM?.curtailment[0]?.proportion_pct).toBeNull();
  });

  it("merges duplicate load and curtailment fueltechs and preserves undefined regions", () => {
    const vicRegion = {
      price_dollar_per_mwh: 10,
      demand_mw: 5,
      summary: {
        net_generation_mw: 20,
        renewables_mw: 10,
        renewables_pct: 50,
        demand_mw: 5,
      },
      generation: [{ fueltech: "wind", label: "Wind", power_mw: 20, proportion_pct: 100, price_dollar_per_mwh: 10, total_energy_mwh: 8 }],
      loads: [{ fueltech: "battery_charging", label: "Battery (Charging)", power_mw: 2, proportion_pct: 10, price_dollar_per_mwh: 5, total_energy_mwh: 1 }],
      curtailment: [{ fueltech: "wind", label: "Wind", power_mw: 1, proportion_pct: 5 }],
      emissions: { volume_tco2e_per_30m: 2, intensity_kgco2e_per_mwh: 20 },
    };
    const saRegion = {
      price_dollar_per_mwh: 20,
      demand_mw: 7,
      summary: {
        net_generation_mw: 30,
        renewables_mw: 15,
        renewables_pct: 50,
        demand_mw: 7,
      },
      generation: [{ fueltech: "wind", label: "Wind", power_mw: 30, proportion_pct: 100, price_dollar_per_mwh: 20, total_energy_mwh: 12 }],
      loads: [{ fueltech: "battery_charging", label: "Battery (Charging)", power_mw: 3, proportion_pct: 10, price_dollar_per_mwh: 5, total_energy_mwh: 2 }],
      curtailment: [{ fueltech: "wind", label: "Wind", power_mw: 2, proportion_pct: 6.7 }],
      emissions: { volume_tco2e_per_30m: 3, intensity_kgco2e_per_mwh: 30 },
    };

    const result = applySubscriptions(
      {
        NEM: {
          ...(mocks.latestSnapshotMock.NEM as any),
          regions: { VIC1: vicRegion, SA1: saRegion, TAS1: undefined },
        },
      },
      { regions: new Set(["VIC1", "SA1", "TAS1"]), metrics: new Set(["generation_mw", "emission_intensity"]) },
    );

    expect(result.NEM?.loads).toEqual([
      {
        fueltech: "battery_charging",
        label: "Battery (Charging)",
        power_mw: 5,
        proportion_pct: 10,
        price_dollar_per_mwh: null,
        total_energy_mwh: 3,
      },
    ]);
    expect(result.NEM?.curtailment).toEqual([
      {
        fueltech: "wind",
        label: "Wind",
        power_mw: 3,
        proportion_pct: 6,
      },
    ]);
    expect(result.NEM?.regions.TAS1).toBeUndefined();
  });
});
