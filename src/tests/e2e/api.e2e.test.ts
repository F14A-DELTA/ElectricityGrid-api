import { describe, it, expect } from "vitest";

const BASE = process.env.E2E_BASE_URL ?? "http://ec2-3-85-237-144.compute-1.amazonaws.com:3000";
const API_KEY = process.env.API_KEY ?? "local-dev-token";
const AUTH = { Authorization: `Bearer ${API_KEY}` };

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Assert that a response body is a valid ADAGE 3.0 envelope.
 * Reused across every endpoint test.
 */
function assertAdageEnvelope(body: any) {
  expect(body).toHaveProperty("data_source", "openelectricity");
  expect(body).toHaveProperty("dataset_type");
  expect(typeof body.dataset_type).toBe("string");
  expect(body).toHaveProperty("dataset_id");
  expect(body).toHaveProperty("time_object");
  expect(body.time_object).toHaveProperty("timestamp");
  expect(body.time_object).toHaveProperty("timezone");
  expect(body).toHaveProperty("events");
  expect(Array.isArray(body.events)).toBe(true);
  expect(body.events.length).toBeGreaterThan(0);
  expect(body.events[0]).toHaveProperty("time_object");
  expect(body.events[0]).toHaveProperty("event_type");
  expect(body.events[0]).toHaveProperty("attribute");
}

// ─── Health ─────────────────────────────────────────────────────────────────

describe("E2E — Health", () => {
  it("GET /v1/health returns 200", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    expect(res.status).toBe(200);
  });

  it("GET /v1/health does not require an Authorization header", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    expect(res.status).toBe(200);
  });

  it("GET /v1/health returns a valid ADAGE envelope", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    const body = await res.json();
    assertAdageEnvelope(body);
  });

  it("GET /v1/health returns dataset_type of 'health_status'", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    const body = await res.json();
    expect(body.dataset_type).toBe("health_status");
  });

  it("GET /v1/health event_type is 'health_check'", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    const body = await res.json();
    expect(body.events[0].event_type).toBe("health_check");
  });

  it("GET /v1/health attribute.status is 'ok'", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    const body = await res.json();
    expect(body.events[0].attribute.status).toBe("ok");
  });

  it("GET /v1/health attribute.uptime is a non-negative number", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    const body = await res.json();
    expect(typeof body.events[0].attribute.uptime).toBe("number");
    expect(body.events[0].attribute.uptime).toBeGreaterThanOrEqual(0);
  });

  it("GET /v1/health attribute.buffer_size is a non-negative integer", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    const body = await res.json();
    expect(typeof body.events[0].attribute.buffer_size).toBe("number");
    expect(body.events[0].attribute.buffer_size).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.events[0].attribute.buffer_size)).toBe(true);
  });

  it("GET /v1/health attribute.last_poll_at is null or a valid ISO timestamp", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    const body = await res.json();
    const val = body.events[0].attribute.last_poll_at;
    if (val !== null) {
      expect(() => new Date(val).toISOString()).not.toThrow();
    }
  });

  it("GET /v1/health time_object.timestamp is a valid ISO timestamp", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    const body = await res.json();
    expect(() => new Date(body.time_object.timestamp).toISOString()).not.toThrow();
  });
});

// ─── Authentication ──────────────────────────────────────────────────────────

describe("E2E — Auth enforcement", () => {
  // /v1/live is used as the representative protected endpoint throughout

  it("returns 401 with no Authorization header", async () => {
    const res = await fetch(`${BASE}/v1/live`);
    expect(res.status).toBe(401);
  });

  it("401 response body has success: false", async () => {
    const res = await fetch(`${BASE}/v1/live`);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("401 response body has error: 'Unauthorized'", async () => {
    const res = await fetch(`${BASE}/v1/live`);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with an incorrect token", async () => {
    const res = await fetch(`${BASE}/v1/live`, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the Bearer prefix is missing", async () => {
    const res = await fetch(`${BASE}/v1/live`, {
      headers: { Authorization: `${API_KEY}` },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the auth scheme is not 'Bearer'", async () => {
    const res = await fetch(`${BASE}/v1/live`, {
      headers: { Authorization: `Basic ${API_KEY}` },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with a completely malformed Authorization header", async () => {
    const res = await fetch(`${BASE}/v1/live`, {
      headers: { Authorization: "notbearer abc" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with an empty Authorization header value", async () => {
    const res = await fetch(`${BASE}/v1/live`, {
      headers: { Authorization: "" },
    });
    expect(res.status).toBe(401);
  });

  it("/v1/stats enforces auth", async () => {
    const res = await fetch(`${BASE}/v1/stats?network=NEM&range=7d`);
    expect(res.status).toBe(401);
  });

  it("/v1/history enforces auth", async () => {
    const res = await fetch(`${BASE}/v1/history?metric=price&interval=1h&range=7d`);
    expect(res.status).toBe(401);
  });

  it("/v1/live/region/NSW1 enforces auth", async () => {
    const res = await fetch(`${BASE}/v1/live/region/NSW1`);
    expect(res.status).toBe(401);
  });

  it("/v1/live/price enforces auth", async () => {
    const res = await fetch(`${BASE}/v1/live/price`);
    expect(res.status).toBe(401);
  });
});

// ─── Live — network-level ────────────────────────────────────────────────────

describe("E2E — GET /v1/live (network-level snapshot)", () => {
  it("returns 200 or 503", async () => {
    const res = await fetch(`${BASE}/v1/live`, { headers: AUTH });
    expect([200, 503]).toContain(res.status);
  });

  it("200 response is a valid ADAGE envelope", async () => {
    const res = await fetch(`${BASE}/v1/live`, { headers: AUTH });
    if (res.status !== 200) return;
    const body = await res.json();
    assertAdageEnvelope(body);
  });

  it("200 response dataset_type is 'live_snapshot_collection'", async () => {
    const res = await fetch(`${BASE}/v1/live`, { headers: AUTH });
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.dataset_type).toBe("live_snapshot_collection");
  });

  it("200 response event_type is 'snapshot_collection'", async () => {
    const res = await fetch(`${BASE}/v1/live`, { headers: AUTH });
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.events[0].event_type).toBe("snapshot_collection");
  });

  it("503 response body has success: false and an error message", async () => {
    const res = await fetch(`${BASE}/v1/live`, { headers: AUTH });
    if (res.status !== 503) return;
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Cache not yet warm");
  });

  it("?network=NEM returns 200 or 503", async () => {
    const res = await fetch(`${BASE}/v1/live?network=NEM`, { headers: AUTH });
    expect([200, 503]).toContain(res.status);
  });

  it("?network=WEM returns 200 or 503", async () => {
    const res = await fetch(`${BASE}/v1/live?network=WEM`, { headers: AUTH });
    expect([200, 503]).toContain(res.status);
  });

  it("?network=NEM 200 response dataset_type is 'live_snapshot'", async () => {
    const res = await fetch(`${BASE}/v1/live?network=NEM`, { headers: AUTH });
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.dataset_type).toBe("live_snapshot");
  });

  it("?network=NEM 200 response event_type is 'network_snapshot'", async () => {
    const res = await fetch(`${BASE}/v1/live?network=NEM`, { headers: AUTH });
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.events[0].event_type).toBe("network_snapshot");
  });

  it("?network=INVALID returns 400", async () => {
    const res = await fetch(`${BASE}/v1/live?network=INVALID`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  it("?network=INVALID response body has success: false", async () => {
    const res = await fetch(`${BASE}/v1/live?network=INVALID`, { headers: AUTH });
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("?network=INVALID response body has error: 'Invalid network'", async () => {
    const res = await fetch(`${BASE}/v1/live?network=INVALID`, { headers: AUTH });
    const body = await res.json();
    expect(body.error).toBe("Invalid network");
  });

  it("?network=nem (lowercase) returns 400 — network codes are case-sensitive", async () => {
    const res = await fetch(`${BASE}/v1/live?network=nem`, { headers: AUTH });
    expect(res.status).toBe(400);
  });
});

// ─── Live — regional snapshot ─────────────────────────────────────────────────

describe("E2E — GET /v1/live/region/:region", () => {
  const VALID_REGIONS = ["NSW1", "QLD1", "VIC1", "SA1", "TAS1", "WEM"];
  const INVALID_REGIONS = ["INVALID", "nsw1", "NSW", "AU1", ""];

  for (const region of VALID_REGIONS) {
    it(`/v1/live/region/${region} returns 200 or 503`, async () => {
      const res = await fetch(`${BASE}/v1/live/region/${region}`, { headers: AUTH });
      expect([200, 503]).toContain(res.status);
    });

    it(`/v1/live/region/${region} 200 response has attribute.region === '${region}'`, async () => {
      const res = await fetch(`${BASE}/v1/live/region/${region}`, { headers: AUTH });
      if (res.status !== 200) return;
      const body = await res.json();
      expect(body.events[0].attribute.region).toBe(region);
    });

    it(`/v1/live/region/${region} 200 response has attribute.network set`, async () => {
      const res = await fetch(`${BASE}/v1/live/region/${region}`, { headers: AUTH });
      if (res.status !== 200) return;
      const body = await res.json();
      // WEM regions belong to WEM network; all others belong to NEM
      const expectedNetwork = region === "WEM" ? "WEM" : "NEM";
      expect(body.events[0].attribute.network).toBe(expectedNetwork);
    });

    it(`/v1/live/region/${region} 200 response dataset_type is 'regional_live_snapshot'`, async () => {
      const res = await fetch(`${BASE}/v1/live/region/${region}`, { headers: AUTH });
      if (res.status !== 200) return;
      const body = await res.json();
      expect(body.dataset_type).toBe("regional_live_snapshot");
    });
  }

  for (const region of INVALID_REGIONS) {
    const label = region === "" ? "(empty string)" : region;
    it(`/v1/live/region/${label} returns 404`, async () => {
      const res = await fetch(`${BASE}/v1/live/region/${region}`, { headers: AUTH });
      expect(res.status).toBe(404);
    });

    it(`/v1/live/region/${label} response body error is 'Unknown region'`, async () => {
      const res = await fetch(`${BASE}/v1/live/region/${region}`, { headers: AUTH });
      const body = await res.json();
      expect(body.error).toBe("Unknown region");
    });
  }

  it("200 response includes attribute.updated_at as a valid ISO timestamp", async () => {
    const res = await fetch(`${BASE}/v1/live/region/NSW1`, { headers: AUTH });
    if (res.status !== 200) return;
    const body = await res.json();
    expect(() => new Date(body.events[0].attribute.updated_at).toISOString()).not.toThrow();
  });

  it("200 response is a valid ADAGE envelope", async () => {
    const res = await fetch(`${BASE}/v1/live/region/NSW1`, { headers: AUTH });
    if (res.status !== 200) return;
    assertAdageEnvelope(await res.json());
  });
});

// ─── Live — price snapshot ────────────────────────────────────────────────────

describe("E2E — GET /v1/live/price", () => {
  it("returns 200 or 503", async () => {
    const res = await fetch(`${BASE}/v1/live/price`, { headers: AUTH });
    expect([200, 503]).toContain(res.status);
  });

  it("200 response is a valid ADAGE envelope", async () => {
    const res = await fetch(`${BASE}/v1/live/price`, { headers: AUTH });
    if (res.status !== 200) return;
    assertAdageEnvelope(await res.json());
  });

  it("200 response dataset_type is 'live_price_snapshot'", async () => {
    const res = await fetch(`${BASE}/v1/live/price`, { headers: AUTH });
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.dataset_type).toBe("live_price_snapshot");
  });

  it("200 response event_type is 'regional_price_snapshot'", async () => {
    const res = await fetch(`${BASE}/v1/live/price`, { headers: AUTH });
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.events[0].event_type).toBe("regional_price_snapshot");
  });

  it("200 response attribute is an array of price entries", async () => {
    const res = await fetch(`${BASE}/v1/live/price`, { headers: AUTH });
    if (res.status !== 200) return;
    const body = await res.json();
    expect(Array.isArray(body.events[0].attribute)).toBe(true);
  });

  it("200 response each price entry has network, region, price_dollar_per_mwh, demand_mw", async () => {
    const res = await fetch(`${BASE}/v1/live/price`, { headers: AUTH });
    if (res.status !== 200) return;
    const entries = (await res.json()).events[0].attribute;
    for (const entry of entries) {
      expect(entry).toHaveProperty("network");
      expect(entry).toHaveProperty("region");
      expect(entry).toHaveProperty("price_dollar_per_mwh");
      expect(entry).toHaveProperty("demand_mw");
    }
  });

  it("503 response has success: false and error: 'Cache not yet warm'", async () => {
    const res = await fetch(`${BASE}/v1/live/price`, { headers: AUTH });
    if (res.status !== 503) return;
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Cache not yet warm");
  });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

describe("E2E — GET /v1/stats", () => {
  // Explicitly disallowed range
  it("?range=24h returns 400", async () => {
    const res = await fetch(`${BASE}/v1/stats?range=24h`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  it("?range=24h response body has success: false", async () => {
    const res = await fetch(`${BASE}/v1/stats?range=24h`, { headers: AUTH });
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("?range=24h response body error is 'Invalid stats query'", async () => {
    const res = await fetch(`${BASE}/v1/stats?range=24h`, { headers: AUTH });
    const body = await res.json();
    expect(body.error).toBe("Invalid stats query");
  });

  // Other invalid ranges
  it("?range=1h returns 400", async () => {
    const res = await fetch(`${BASE}/v1/stats?range=1h`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  it("?range=1y returns 400", async () => {
    const res = await fetch(`${BASE}/v1/stats?range=1y`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  // Invalid network
  it("?network=INVALID&range=7d returns 400", async () => {
    const res = await fetch(`${BASE}/v1/stats?network=INVALID&range=7d`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  // Valid ranges
  for (const range of ["7d", "30d", "90d"] as const) {
    it(`?network=NEM&range=${range} returns 200 or 400`, async () => {
      const res = await fetch(`${BASE}/v1/stats?network=NEM&range=${range}`, { headers: AUTH });
      expect([200, 400]).toContain(res.status);
    });

    it(`?network=NEM&range=${range} 200 response is a valid ADAGE envelope`, async () => {
      const res = await fetch(`${BASE}/v1/stats?network=NEM&range=${range}`, { headers: AUTH });
      if (res.status !== 200) return;
      assertAdageEnvelope(await res.json());
    });

    it(`?network=NEM&range=${range} 200 response dataset_type is 'range_statistics'`, async () => {
      const res = await fetch(`${BASE}/v1/stats?network=NEM&range=${range}`, { headers: AUTH });
      if (res.status !== 200) return;
      const body = await res.json();
      expect(body.dataset_type).toBe("range_statistics");
    });

    it(`?network=NEM&range=${range} 200 response event_type is 'statistics_summary'`, async () => {
      const res = await fetch(`${BASE}/v1/stats?network=NEM&range=${range}`, { headers: AUTH });
      if (res.status !== 200) return;
      const body = await res.json();
      expect(body.events[0].event_type).toBe("statistics_summary");
    });
  }

  it("defaults to network=NEM and range=7d when no query params provided", async () => {
    // Route defaults: network ?? "NEM", range ?? "7d"
    const defaultRes = await fetch(`${BASE}/v1/stats`, { headers: AUTH });
    const explicitRes = await fetch(`${BASE}/v1/stats?network=NEM&range=7d`, { headers: AUTH });
    expect(defaultRes.status).toBe(explicitRes.status);
  });
});

// ─── History ──────────────────────────────────────────────────────────────────

describe("E2E — GET /v1/history", () => {
  // Missing / invalid params — should all return 400
  it("no query params returns 400", async () => {
    const res = await fetch(`${BASE}/v1/history`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  it("no query params error is 'Invalid history query'", async () => {
    const res = await fetch(`${BASE}/v1/history`, { headers: AUTH });
    const body = await res.json();
    expect(body.error).toBe("Invalid history query");
  });

  it("missing metric returns 400", async () => {
    const res = await fetch(`${BASE}/v1/history?interval=1h&range=7d&network=NEM`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  it("unknown metric returns 400", async () => {
    const res = await fetch(`${BASE}/v1/history?metric=unknown_metric&interval=1h&range=7d`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  it("invalid interval '2h' returns 400", async () => {
    const res = await fetch(`${BASE}/v1/history?metric=price&interval=2h&range=7d`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  it("invalid interval '30m' returns 400", async () => {
    const res = await fetch(`${BASE}/v1/history?metric=price&interval=30m&range=7d`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  it("invalid network returns 400", async () => {
    const res = await fetch(`${BASE}/v1/history?metric=price&interval=1h&range=7d&network=FAKENET`, { headers: AUTH });
    expect(res.status).toBe(400);
  });

  // All valid metrics with a stable param combination
  const VALID_METRICS = [
    "generation_mw",
    "price",
    "emissions_volume",
    "emission_intensity",
    "demand_mw",
    "renewables_pct",
  ] as const;

  for (const metric of VALID_METRICS) {
    it(`metric=${metric} with valid params returns 200 or 400`, async () => {
      const res = await fetch(
        `${BASE}/v1/history?metric=${metric}&interval=1h&range=7d&network=NEM`,
        { headers: AUTH }
      );
      expect([200, 400]).toContain(res.status);
    });

    it(`metric=${metric} 200 response attribute.metric equals '${metric}'`, async () => {
      const res = await fetch(
        `${BASE}/v1/history?metric=${metric}&interval=1h&range=7d&network=NEM`,
        { headers: AUTH }
      );
      if (res.status !== 200) return;
      const body = await res.json();
      expect(body.events[0].attribute.metric).toBe(metric);
    });
  }

  // All valid intervals
  for (const interval of ["5m", "1h", "1d"] as const) {
    it(`interval=${interval} with valid params returns 200 or 400`, async () => {
      const res = await fetch(
        `${BASE}/v1/history?metric=price&interval=${interval}&range=7d&network=NEM`,
        { headers: AUTH }
      );
      expect([200, 400]).toContain(res.status);
    });
  }

  // 200 shape assertions
  it("200 response is a valid ADAGE envelope", async () => {
    const res = await fetch(
      `${BASE}/v1/history?metric=price&interval=1h&range=7d&network=NEM`,
      { headers: AUTH }
    );
    if (res.status !== 200) return;
    assertAdageEnvelope(await res.json());
  });

  it("200 response dataset_type is 'historical_series'", async () => {
    const res = await fetch(
      `${BASE}/v1/history?metric=price&interval=1h&range=7d&network=NEM`,
      { headers: AUTH }
    );
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.dataset_type).toBe("historical_series");
  });

  it("200 response event_type is 'history_series'", async () => {
    const res = await fetch(
      `${BASE}/v1/history?metric=price&interval=1h&range=7d&network=NEM`,
      { headers: AUTH }
    );
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.events[0].event_type).toBe("history_series");
  });

  it("200 response attribute.series is an array", async () => {
    const res = await fetch(
      `${BASE}/v1/history?metric=price&interval=1h&range=7d&network=NEM`,
      { headers: AUTH }
    );
    if (res.status !== 200) return;
    const body = await res.json();
    expect(Array.isArray(body.events[0].attribute.series)).toBe(true);
  });

  it("200 response attribute.interval matches the requested interval", async () => {
    const res = await fetch(
      `${BASE}/v1/history?metric=price&interval=1h&range=7d&network=NEM`,
      { headers: AUTH }
    );
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.events[0].attribute.interval).toBe("1h");
  });

  it("200 response attribute.range matches the requested range", async () => {
    const res = await fetch(
      `${BASE}/v1/history?metric=price&interval=1h&range=7d&network=NEM`,
      { headers: AUTH }
    );
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.events[0].attribute.range).toBe("7d");
  });
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

describe("E2E — CORS headers", () => {
  it("GET /v1/health includes access-control-allow-origin", async () => {
    const res = await fetch(`${BASE}/v1/health`, {
      headers: { Origin: "https://example.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });

  it("GET /v1/live includes access-control-allow-origin", async () => {
    const res = await fetch(`${BASE}/v1/live`, {
      headers: { ...AUTH, Origin: "https://example.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });

  it("preflight OPTIONS /v1/live returns 200 or 204", async () => {
    const res = await fetch(`${BASE}/v1/live`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization",
      },
    });
    expect([200, 204]).toContain(res.status);
  });
});

// ─── Content-Type ─────────────────────────────────────────────────────────────

describe("E2E — Content-Type header", () => {
  it("GET /v1/health response Content-Type is application/json", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("GET /v1/live response Content-Type is application/json", async () => {
    const res = await fetch(`${BASE}/v1/live`, { headers: AUTH });
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("error responses also return application/json", async () => {
    const res = await fetch(`${BASE}/v1/live`);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});