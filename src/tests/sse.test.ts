import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sseRoutesPlugin from "../routes/sse";

const mocks = vi.hoisted(() => {
  const validateAuthMock = vi.fn();
  const emitterOnMock = vi.fn();
  const emitterOffMock = vi.fn();
  let latestSnapshot: unknown = null;

  return {
    validateAuthMock,
    emitterOnMock,
    emitterOffMock,
    get latestSnapshot() {
      return latestSnapshot;
    },
    set latestSnapshot(value: unknown) {
      latestSnapshot = value;
    },
  };
});

vi.mock("../auth", () => ({
  validateAuth: (...args: unknown[]) => mocks.validateAuthMock(...args),
}));

vi.mock("../cache", () => ({
  get latestSnapshot() {
    return mocks.latestSnapshot;
  },
}));

vi.mock("../poller", () => ({
  emitter: {
    on: (...args: unknown[]) => mocks.emitterOnMock(...args),
    off: (...args: unknown[]) => mocks.emitterOffMock(...args),
  },
}));

function createRequestMock() {
  const handlers: Record<string, () => void> = {};
  return {
    raw: {
      on: vi.fn((event: string, cb: () => void) => {
        handlers[event] = cb;
      }),
    },
    emitLocal(event: string) {
      handlers[event]?.();
    },
  };
}

function createReplyMock() {
  return {
    code: vi.fn().mockReturnThis(),
    send: vi.fn(),
    hijack: vi.fn(),
    raw: {
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    },
  };
}

describe("sse routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T10:00:00Z"));
    mocks.validateAuthMock.mockReturnValue(true);
    mocks.latestSnapshot = {
      NEM: { updated_at: "2026-03-17T10:00:00Z" },
    };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers /v1/events and rejects unauthorized requests", async () => {
    let routeHandler: any;
    const fastifyMock = {
      get: vi.fn((path: string, handler: any) => {
        expect(path).toBe("/v1/events");
        routeHandler = handler;
      }),
    };

    await (sseRoutesPlugin as any)(fastifyMock);
    const request = createRequestMock();
    const reply = createReplyMock();
    mocks.validateAuthMock.mockReturnValue(false);
    await routeHandler(request, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ success: false, error: "Unauthorized" });
    expect(reply.hijack).not.toHaveBeenCalled();
    expect(mocks.emitterOnMock).not.toHaveBeenCalled();
  });

  it("streams connected, update, and heartbeat events and cleans up on close", async () => {
    let routeHandler: any;
    const fastifyMock = {
      get: vi.fn((_path: string, handler: any) => {
        routeHandler = handler;
      }),
    };

    await (sseRoutesPlugin as any)(fastifyMock);
    const request = createRequestMock();
    const reply = createReplyMock();
    await routeHandler(request, reply);

    expect(reply.hijack).toHaveBeenCalledTimes(1);
    expect(reply.raw.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const writesAfterConnect = reply.raw.write.mock.calls.map(([chunk]) => String(chunk));
    expect(writesAfterConnect).toContain("event: connected\n");
    expect(writesAfterConnect).toContain(
      `data: ${JSON.stringify({
        data_source: "openelectricity",
        dataset_type: "stream_snapshot",
        dataset_id: "local-cache",
        time_object: {
          timestamp: "2026-03-17T10:00:00.000Z",
          timezone: "UTC",
        },
        events: [
          {
            time_object: {
              timestamp: "2026-03-17T10:00:00.000Z",
              timezone: "UTC",
            },
            event_type: "stream_connected",
            attribute: {
              snapshot: mocks.latestSnapshot,
            },
          },
        ],
      })}\n\n`,
    );

    expect(mocks.emitterOnMock).toHaveBeenCalledTimes(1);
    const updateHandler = mocks.emitterOnMock.mock.calls[0][1];
    updateHandler({ NEM: { updated_at: "2026-03-17T10:05:00Z" } });

    const writesAfterUpdate = reply.raw.write.mock.calls.map(([chunk]) => String(chunk));
    expect(writesAfterUpdate).toContain("event: energy_update\n");
    expect(writesAfterUpdate).toContain(
      `data: ${JSON.stringify({
        data_source: "openelectricity",
        dataset_type: "stream_snapshot",
        dataset_id: "local-cache",
        time_object: {
          timestamp: "2026-03-17T10:00:00.000Z",
          timezone: "UTC",
        },
        events: [
          {
            time_object: {
              timestamp: "2026-03-17T10:00:00.000Z",
              timezone: "UTC",
            },
            event_type: "energy_update",
            attribute: { NEM: { updated_at: "2026-03-17T10:05:00Z" } },
          },
        ],
      })}\n\n`,
    );

    vi.advanceTimersByTime(30000);

    const writesAfterHeartbeat = reply.raw.write.mock.calls.map(([chunk]) => String(chunk));
    expect(writesAfterHeartbeat).toContain("event: heartbeat\n");
    expect(writesAfterHeartbeat).toContain(
      `data: ${JSON.stringify({
        data_source: "openelectricity",
        dataset_type: "stream_heartbeat",
        dataset_id: "local-cache",
        time_object: {
          timestamp: "2026-03-17T10:00:30.000Z",
          timezone: "UTC",
        },
        events: [
          {
            time_object: {
              timestamp: "2026-03-17T10:00:30.000Z",
              timezone: "UTC",
              duration: 30,
              duration_unit: "second",
            },
            event_type: "heartbeat",
            attribute: { status: "alive" },
          },
        ],
      })}\n\n`,
    );
    request.emitLocal("close");
    expect(mocks.emitterOffMock).toHaveBeenCalledWith("update", updateHandler);
    expect(reply.raw.end).toHaveBeenCalledTimes(1);
  });
});
