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
