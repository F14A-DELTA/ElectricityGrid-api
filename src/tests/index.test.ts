import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const fastifyInstance = {
        register: vi.fn().mockResolvedValue(undefined),
        listen: vi.fn().mockResolvedValue(undefined),
        log: { info: vi.fn() },
    };

    return {
    fastifyInstance,
    fastifyFactory: vi.fn(() => fastifyInstance),
    warmCache: vi.fn().mockResolvedValue(undefined),
    startPoller: vi.fn(),
    restRoutes: vi.fn(),
    sseRoutes: vi.fn(),
    wsRoutes: vi.fn(),
    websocketPlugin: vi.fn(),
  };
})


vi.mock("fastify", () => ({
  default: mocks.fastifyFactory,
}));

vi.mock("@fastify/websocket", () => ({
  default: mocks.websocketPlugin,
}));

vi.mock("../cache", () => ({
  warmCache: mocks.warmCache,
}));

vi.mock("../poller", () => ({
  startPoller: mocks.startPoller,
}));

vi.mock("../routes/rest", () => ({
  default: mocks.restRoutes,
}));

vi.mock("../routes/sse", () => ({
  default: mocks.sseRoutes,
}));

vi.mock("../routes/ws", () => ({
  default: mocks.wsRoutes,
}));

async function importIndexFresh() {
  vi.resetModules();
  await import("../index");
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("index file tests", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        process.env.OPENELECTRICITY_API_KEY = "x";
        process.env.S3_BUCKET = "bucket";
        process.env.AWS_REGION = "ap-southeast-2";
        process.env.API_KEY = "secret";
        process.env.PORT = "3000";

        vi.clearAllMocks();
    });


    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });


    it("starts app and wires dependencies when env is valid", async () => {
        await importIndexFresh();

        expect(mocks.fastifyFactory).toHaveBeenCalledWith({ logger: true });

        expect(mocks.fastifyInstance.register).toHaveBeenCalledWith(mocks.websocketPlugin);
        expect(mocks.fastifyInstance.register).toHaveBeenCalledWith(mocks.restRoutes);
        expect(mocks.fastifyInstance.register).toHaveBeenCalledWith(mocks.sseRoutes);
        expect(mocks.fastifyInstance.register).toHaveBeenCalledWith(mocks.wsRoutes);

        expect(mocks.warmCache).toHaveBeenCalledWith(["NEM", "WEM"]);
        expect(mocks.fastifyInstance.listen).toHaveBeenCalledWith({ port: 3000, host: "0.0.0.0" });
        expect(mocks.startPoller).toHaveBeenCalledTimes(1);
    });


    it("exits when required env is missing", async () => {
        delete process.env.API_KEY;

        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

        await importIndexFresh();

        expect(errorSpy).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
})
