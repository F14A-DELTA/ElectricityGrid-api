// import { describe, it, expect } from "vitest";

// const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// const API_KEY = process.env.API_KEY ?? "local-dev-token";
// const AUTH = { Authorization: `Bearer ${API_KEY}` };

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../app";
import { warmCache } from "../../cache";

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const AUTH = { Authorization: `Bearer ${process.env.API_KEY ?? "local-dev-token"}` };

let server: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  server = await buildApp();
  await warmCache(["NEM", "WEM"]);
  await server.listen({ port: PORT, host: "0.0.0.0" });
}, 60000); // 60s timeout to allow cache to warm

afterAll(async () => {
  await server.close();
});

describe("E2E — Health", () => {
  it("GET /v1/health returns 200 with ADAGE envelope", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data_source).toBe("openelectricity");
    expect(body.dataset_type).toBe("health_status");
    expect(body.events[0].event_type).toBe("health_check");
    expect(body.events[0].attribute.status).toBe("ok");
    expect(typeof body.events[0].attribute.uptime).toBe("number");
  });

  it("GET /v1/health works without auth header", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    expect(res.status).toBe(200);
  });

  it("health response has all required ADAGE fields", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    const body = await res.json();

    expect(body).toHaveProperty("data_source");
    expect(body).toHaveProperty("dataset_type");
    expect(body).toHaveProperty("dataset_id");
    expect(body).toHaveProperty("time_object");
    expect(body.time_object).toHaveProperty("timestamp");
    expect(body.time_object).toHaveProperty("timezone");
    expect(body).toHaveProperty("events");
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events[0]).toHaveProperty("time_object");
    expect(body.events[0]).toHaveProperty("event_type");
    expect(body.events[0]).toHaveProperty("attribute");
  });
});

describe("E2E — Auth enforcement", () => {
  it("returns 401 with no token", async () => {
    const res = await fetch(`${BASE}/v1/live`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with wrong token", async () => {
    const res = await fetch(`${BASE}/v1/live`, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with malformed auth header", async () => {
    const res = await fetch(`${BASE}/v1/live`, {
      headers: { Authorization: "notbearer abc" },
    });
    expect(res.status).toBe(401);
  });
});

describe("E2E — Live endpoints", () => {
  it("GET /v1/live returns ADAGE envelope", async () => {
    const res = await fetch(`${BASE}/v1/live`, { headers: AUTH });
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.data_source).toBe("openelectricity");
      expect(body.events[0].attribute).toBeDefined();
    }
  });

  it("GET /v1/live?network=NEM returns 200 or 503", async () => {
    const res = await fetch(`${BASE}/v1/live?network=NEM`, { headers: AUTH });
    expect([200, 503]).toContain(res.status);
  });

  it("GET /v1/live?network=INVALID returns 400", async () => {
    const res = await fetch(`${BASE}/v1/live?network=INVALID`, { headers: AUTH });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("GET /v1/live/region/NSW1 returns 200 or 503", async () => {
    const res = await fetch(`${BASE}/v1/live/region/NSW1`, { headers: AUTH });
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.data_source).toBe("openelectricity");
      expect(body.events[0].attribute.region).toBe("NSW1");
    }
  });

  it("GET /v1/live/region/INVALID returns 404", async () => {
    const res = await fetch(`${BASE}/v1/live/region/INVALID`, { headers: AUTH });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unknown region");
  });

  it("GET /v1/live/price returns 200 or 503", async () => {
    const res = await fetch(`${BASE}/v1/live/price`, { headers: AUTH });
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(Array.isArray(body.events[0].attribute)).toBe(true);
    }
  });
});

describe("E2E — Historical endpoints", () => {
  it("GET /v1/stats?range=24h returns 400", async () => {
    const res = await fetch(`${BASE}/v1/stats?range=24h`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  it("GET /v1/stats with valid params returns 200 or 400", async () => {
    const res = await fetch(`${BASE}/v1/stats?network=NEM&range=7d`, { headers: AUTH });
    expect([200, 400]).toContain(res.status);
  });

  it("GET /v1/history without metric returns 400", async () => {
    const res = await fetch(`${BASE}/v1/history`, { headers: AUTH });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid history query");
  });

  it("GET /v1/history with invalid interval returns 400", async () => {
    const res = await fetch(`${BASE}/v1/history?metric=price&interval=2h`, { headers: AUTH });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid history query");
  });

  it("GET /v1/history with valid params returns 200 or 400", async () => {
    const res = await fetch(
      `${BASE}/v1/history?metric=price&interval=1h&range=7d&network=NEM`,
      { headers: AUTH }
    );
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.events[0].attribute.metric).toBe("price");
      expect(Array.isArray(body.events[0].attribute.series)).toBe(true);
    }
  });
});

describe("E2E — CORS headers", () => {
  it("includes CORS headers on responses", async () => {
    const res = await fetch(`${BASE}/v1/health`, {
      headers: { Origin: "https://example.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });
});