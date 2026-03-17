import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { round, buildSnapshotFromRows, type DataRow } from "../normalise";


describe("normalise", () => {
    describe("round,", () => {
        it("rounds numbers to requested decimals", () => {
            expect(round(12.345, 2)).toBe(12.35);
            expect(round(12.344, 2)).toBe(12.34);
        });

        it("returns null for null/undefined", () => {
            expect(round(null, 2)).toBeNull();
            expect(round(undefined,3)).toBeNull();
            expect(round(Number.NaN, 2)).toBeNull();
        });
    });


    describe("buildSnapFromRows", () => {
        it("builds network + region snapshots with correct aggregates", () => {
            const t = new Date("2026-01-01T00:05:00.123Z");

            const generationRows: DataRow[] = [
                { interval: t, region: "NSW1", fueltech: "coal_black", power: 100, energy: 50, market_value: 5000 },
                { interval: t, region: "NSW1", fueltech: "wind", power: 50, energy: 30, market_value: 1200 },
                { interval: t, region: "NSW1", fueltech: "battery_charging", power: -10, energy: -5, market_value: -100 },
                { interval: t, region: "QLD1", fueltech: "solar_utility", power: 40, energy: 20, market_value: 1000 },
            ];

             const marketRows: DataRow[] = [
                { interval: t, region: "NSW1", price: 100, demand: 140, curtailment_solar_utility: 5, curtailment_wind: 2 },
                { interval: t, region: "QLD1", price: 80, demand: 90, curtailment_solar_utility: 1, curtailment_wind: 3 },
            ];

            const emissionsRows: DataRow[] = [
                { interval: t, region: "NSW1", emissions: 20 },
                { interval: t, region: "QLD1", emissions: 10 },
            ];

            const snapshot = buildSnapshotFromRows(generationRows, marketRows, emissionsRows, "NEM");

            expect(snapshot.updated_at).toBe("2026-01-01T00:05:00Z");
            expect(snapshot.network).toBe("NEM");


            expect(snapshot.summary).toEqual({
                net_generation_mw: 190,
                renewables_mw: 90,
                renewables_pct: 47.4,
                demand_mw: 230,
            });

            expect(snapshot.generation.map((g) => g.fueltech).sort()).toEqual(["coal_black", "solar_utility", "wind"]);
            expect(snapshot.loads.map((l) => l.fueltech)).toEqual(["battery_charging"]);
            expect(snapshot.loads[0].power_mw).toBe(10);

            expect(snapshot.curtailment.find((c) => c.fueltech === "solar_utility")?.power_mw).toBe(6);
            expect(snapshot.curtailment.find((c) => c.fueltech === "wind")?.power_mw).toBe(5);
            

            expect(snapshot.emissions).toEqual({
                volume_tco2e_per_30m: 30,
                intensity_kgco2e_per_mwh: 300,
            });


            expect(snapshot.regions.NSW1?.summary).toEqual({
                net_generation_mw: 150,
                renewables_mw: 50,
                renewables_pct: 33.3,
                demand_mw: 140,
            });

            expect(snapshot.regions.NSW1?.price_dollar_per_mwh).toBe(100);
        });

        it("supports network region when the field is not there", () => {
            const t = new Date("2026-01-01T01:00:00.000Z");


            const generationRows: DataRow[] = [
                { interval: t, network_region: "WEM", fueltech: "gas_ccgt", power: 20, energy: 10, market_value: 400 },
            ];

            const marketRows: DataRow[] = [{ interval: t, network_region: "WEM", price: 40, demand: 25 }];
            const emissionsRows: DataRow[] = [{ interval: t, network_region: "WEM", emissions: 2 }];

            const snapshot = buildSnapshotFromRows(generationRows, marketRows, emissionsRows, "WEM");

            expect(snapshot.regions.WEM).toBeDefined();
            expect(snapshot.summary.net_generation_mw).toBe(20);
            expect(snapshot.summary.demand_mw).toBe(25);
        });
    });
});