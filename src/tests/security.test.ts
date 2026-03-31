import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    latestSnapshot: { NEM: { network: "NEM" } }
  };
});

vi.mock("../auth", () => ({
  enforceAuth: vi.fn(), 
  validateAuth: vi.fn().mockReturnValue(true), 
}));


vi.mock("../poller", () => ({ lastPollAt: new Date() }));

vi.mock("../s3-query", () => ({
  computeStats: vi.fn().mockResolvedValue({}),
  queryHistory: vi.fn().mockResolvedValue([])
}));


vi.mock("../cache", () => ({
  get latestSnapshot() { return mocks.latestSnapshot; },
  recentBuffer: [],
}));

async function buildSecurityApp() {
  vi.resetModules();
  const [{ default: Fastify }, { default: restRoutes }] = await Promise.all([
    import("fastify"),
    import("../routes/rest"),
  ]);

  const app = Fastify();
  await app.register(restRoutes);
  return app;
}

describe("Security Testing", () => {

  it("handles malicious query parameters safely without 500 crashing", async () => {
    const app = await buildSecurityApp();
    const sqlInjection = await app.inject({ method: "GET", url: "/v1/live?network=' OR 1=1--" });
    expect(sqlInjection.statusCode).toBe(400);

    const noSqlInjection = await app.inject({ method: "GET", url: "/v1/live?network=[$ne]=WEM" });
    expect(noSqlInjection.statusCode).toBe(400);

    const xssInjection = await app.inject({ method: "GET", url: "/v1/live?network=<script>alert('xss')</script>" });
    expect(xssInjection.statusCode).toBe(400);

    await app.close();
  });
  

  it("rejects path traversal attempts", async () => {
    const app = await buildSecurityApp();

    const traversal = await app.inject({ 
        method: "GET", 
        url: "/v1/live/region/../../../../etc/passwd" 
    });
    expect([400, 404]).toContain(traversal.statusCode);
    await app.close();
  });


  it("handles extremely long input strings gracefully", async () => {
    const app = await buildSecurityApp();
    const massiveString = "A".repeat(10000); 

    const result = await app.inject({ 
        method: "GET", 
        url: `/v1/live?network=${massiveString}` 
    });
    expect(result.statusCode).toBe(400);
    
    await app.close();
  });

  it("drops requests trying to use unexpected HTTP methods", async () => {
    const app = await buildSecurityApp();

    const badMethod = await app.inject({ method: "POST", url: "/v1/health", payload: { hack: "this" }});
    expect(badMethod.statusCode).toBe(404);

    const badMethodLive = await app.inject({ method: "PUT", url: "/v1/live", payload: { over: "write" }});
    expect(badMethodLive.statusCode).toBe(404);

    await app.close();
  });
});