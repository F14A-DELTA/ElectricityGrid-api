import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getLiveKey,
  getRawKey,
  getHourlyRollupKey,
  getDailyRollupKey,
  getRawKeysForRange,
  getHourlyRollupKeysForRange,
  getDailyRollupKeysForDays,
} from "../s3";


describe("s3", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-17T12:34:56Z"));
    });


    afterEach(() => {
        vi.useRealTimers();
    });

    it("builds live keys", () => {
        expect(getLiveKey()).toBe("live/snapshot.json");
        expect(getLiveKey("NEM")).toBe("live/nem/snapshot.json");
        expect(getLiveKey("NEM", "NSW1")).toBe("live/nem/NSW1.json");
    });

    it("builds raw and rollup keys", () => {
        const ts = new Date("2026-01-02T03:07:59Z");

        expect(getRawKey("NEM", ts)).toBe(
        "raw/network=NEM/year=2026/month=01/day=02/2026-01-02T03:05:00Z.json",
        );
        expect(getHourlyRollupKey("NEM", 2026, 1, 2, 3)).toBe(
        "rollups/network=NEM/year=2026/month=01/hourly/2026-01-02T03.ndjson",
        );
        expect(getDailyRollupKey("NEM", 2026, 1, 2)).toBe(
        "rollups/network=NEM/year=2026/month=01/daily/2026-01-02.ndjson",
        );
    });

    it("builds raw keys for a time range in 5-minute steps", () => {
        const from = new Date("2026-01-02T03:02:00Z");
        const to = new Date("2026-01-02T03:12:00Z");

        expect(getRawKeysForRange("NEM", from, to)).toEqual([
        "raw/network=NEM/year=2026/month=01/day=02/2026-01-02T03:00:00Z.json",
        "raw/network=NEM/year=2026/month=01/day=02/2026-01-02T03:05:00Z.json",
        "raw/network=NEM/year=2026/month=01/day=02/2026-01-02T03:10:00Z.json",
        ]);
    });

    it("builds hourly rollup keys for a range", () => {
        const from = new Date("2026-01-02T01:35:00Z");
        const to = new Date("2026-01-02T03:10:00Z");

        expect(getHourlyRollupKeysForRange("WEM", from, to)).toEqual([
        "rollups/network=WEM/year=2026/month=01/hourly/2026-01-02T01.ndjson",
        "rollups/network=WEM/year=2026/month=01/hourly/2026-01-02T02.ndjson",
        "rollups/network=WEM/year=2026/month=01/hourly/2026-01-02T03.ndjson",
        ]);
    });

    it("builds daily rollup keys counting back from today", () => {
        expect(getDailyRollupKeysForDays("NEM", 3)).toEqual([
        "rollups/network=NEM/year=2026/month=03/daily/2026-03-17.ndjson",
        "rollups/network=NEM/year=2026/month=03/daily/2026-03-16.ndjson",
        "rollups/network=NEM/year=2026/month=03/daily/2026-03-15.ndjson",
        ]);
    });
});

async function loadS3WithEnv(bucket = "test-bucket") {
    vi.resetModules();
    process.env.S3_BUCKET = bucket;
    process.env.AWS_REGION = "ap-southeast-2";
    return import("../s3");
}

describe("s3 input output helpers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("putJson writes json with cache-control", async () => {
        const s3 = await loadS3WithEnv();
        const sendSpy = vi.spyOn(s3.s3Client, "send").mockResolvedValue({} as any);

        await s3.putJson("live/x.json", { ok: true }, 300);

        const command = sendSpy.mock.calls[0][0] as any;
        expect(command.input.Bucket).toBe("test-bucket");
        expect(command.input.Key).toBe("live/x.json");
        expect(command.input.ContentType).toBe("application/json");
        expect(command.input.CacheControl).toBe("max-age=300, public");
        expect(command.input.Body).toBe(JSON.stringify({ ok: true }));
    });


    it("putJson uses no-cache when maxAge is 0", async () => {
        const s3 = await loadS3WithEnv();
        const sendSpy = vi.spyOn(s3.s3Client, "send").mockResolvedValue({} as any);

        await s3.putJson("live/y.json", { ok: true }, 0);

        const command = sendSpy.mock.calls[0][0] as any;
        expect(command.input.CacheControl).toBe("no-cache");
    });

    it("putNdjson writes newline-delimited json", async () => {
        const s3 = await loadS3WithEnv();
        const sendSpy = vi.spyOn(s3.s3Client, "send").mockResolvedValue({} as any);

        await s3.putNdjson("rollups/a.ndjson", [{ a: 1 }, { b: 2 }]);

        const command = sendSpy.mock.calls[0][0] as any;
        expect(command.input.ContentType).toBe("application/x-ndjson");
        expect(command.input.Body).toBe('{"a":1}\n{"b":2}');
    });

    it("getJson parses object body", async () => {
        const s3 = await loadS3WithEnv();

        vi.spyOn(s3.s3Client, "send").mockResolvedValue({
        Body: {
            transformToString: vi.fn().mockResolvedValue('{"x":1}'),
        },
        } as any);

        const result = await s3.getJson<{ x: number }>("live/x.json");
        expect(result).toEqual({ x: 1 });
    });


    it("getJson returns null for missing object", async () => {
        const s3 = await loadS3WithEnv();

        const err = new Error("NoSuchKey");
        (err as any).name = "NoSuchKey";
        vi.spyOn(s3.s3Client, "send").mockRejectedValue(err);

        const result = await s3.getJson("missing.json");
        expect(result).toBeNull();
    });


    it("getNdjson returns [] for missing object", async () => {
        const s3 = await loadS3WithEnv();

        const err = new Error("The specified key does not exist");
        (err as any).name = "SomeOtherError";
        vi.spyOn(s3.s3Client, "send").mockRejectedValue(err);

        const rows = await s3.getNdjson("missing.ndjson");
        expect(rows).toEqual([]);
    });

    it("getNdjson parses rows and ignores blank lines", async () => {
        const s3 = await loadS3WithEnv();

        vi.spyOn(s3.s3Client, "send").mockResolvedValue({
        Body: {
            transformToString: vi.fn().mockResolvedValue('{"a":1}\n\n{"b":2}\n'),
        },
        } as any);

        const rows = await s3.getNdjson("rows.ndjson");
        expect(rows).toEqual([{ a: 1 }, { b: 2 }]);
    });


    it("getNdjson returns [] for missing object", async () => {
        const s3 = await loadS3WithEnv();

        const err = new Error("The specified key does not exist");
        (err as any).name = "SomeOtherError";
        vi.spyOn(s3.s3Client, "send").mockRejectedValue(err);

        const rows = await s3.getNdjson("missing.ndjson");
        expect(rows).toEqual([]);
    });

    it("getJsonMany and getNdjsonMany aggregate results", async () => {
        const s3 = await loadS3WithEnv();
        const sendSpy = vi.spyOn(s3.s3Client, "send");

        sendSpy
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('{"v":1}') } } as any)
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue("") } } as any)
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('{"a":1}\n') } } as any)
        .mockResolvedValueOnce({ Body: { transformToString: vi.fn().mockResolvedValue('{"b":2}\n{"c":3}\n') } } as any);

        const jsonMany = await s3.getJsonMany<{ v: number }>(["1.json", "2.json"]);
        const ndjsonMany = await s3.getNdjsonMany<any>(["1.ndjson", "2.ndjson"]);

        expect(jsonMany).toEqual([{ v: 1 }, null]);
        expect(ndjsonMany).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    });


    it("throws when bucket is missing", async () => {
        vi.resetModules();
        delete process.env.S3_BUCKET;
        delete process.env.OBJECT_STORAGE_BUCKET;
        process.env.AWS_REGION = "ap-southeast-2";
        const s3 = await import("../s3");

        await expect(s3.putJson("x.json", { a: 1 }, 10)).rejects.toThrow(
        "Missing S3 bucket configuration. Set S3_BUCKET.",
        );
    });
});