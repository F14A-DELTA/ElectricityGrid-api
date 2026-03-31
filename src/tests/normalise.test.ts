import { DataTable } from "openelectricity";
import { describe, it, expect, vi } from "vitest";
import { round, getRows, getLatestInterval, buildSnapshot, buildSnapshotFromRows, type DataRow } from "../normalise";


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

        it("uses datatable rows directly and falls back to DataTable parsing", () => {
            const t1 = new Date("2026-01-01T00:00:00.000Z");
            const t2 = new Date("2026-01-01T00:05:00.000Z");
            const datatableRows: DataRow[] = [
                { interval: t1, region: "NSW1", power: 10 },
                { interval: t2, region: "NSW1", power: 20 },
                { interval: t2, region: "QLD1", power: 30 },
            ];

            const datatable = { getRows: vi.fn(() => datatableRows) };
            expect(getRows({ datatable } as any)).toEqual(datatableRows);
            expect(getLatestInterval({ datatable } as any)).toEqual([datatableRows[1], datatableRows[2]]);

            const parsedRows: DataRow[] = [{ interval: t2, region: "WEM", power: 15 }];
            const fromNetworkTimeSeriesSpy = vi
                .spyOn(DataTable, "fromNetworkTimeSeries")
                .mockReturnValue({ getRows: () => parsedRows } as any);

            expect(getRows({ response: { data: [{ any: "payload" }] } } as any)).toEqual(parsedRows);
            expect(fromNetworkTimeSeriesSpy).toHaveBeenCalledWith([{ any: "payload" }]);

            fromNetworkTimeSeriesSpy.mockRestore();
        });

        it("returns empty latest intervals and uses latest source rows in buildSnapshot", () => {
            expect(getLatestInterval({ datatable: { getRows: () => [] } } as any)).toEqual([]);

            const t1 = new Date("2026-01-01T00:00:00.000Z");
            const t2 = new Date("2026-01-01T00:05:00.000Z");

            const snapshot = buildSnapshot(
                {
                    datatable: {
                        getRows: () => [
                            { interval: t1, region: "NSW1", fueltech: "wind", power: 10, energy: 5, market_value: 100 },
                            { interval: t2, region: "NSW1", fueltech: "wind", power: 20, energy: 10, market_value: 300 },
                        ],
                    },
                } as any,
                {
                    datatable: {
                        getRows: () => [
                            { interval: t1, region: "NSW1", price: 50, demand: 10 },
                            { interval: t2, region: "NSW1", price: 60, demand: 15 },
                        ],
                    },
                } as any,
                {
                    datatable: {
                        getRows: () => [
                            { interval: t1, region: "NSW1", emissions: 1 },
                            { interval: t2, region: "NSW1", emissions: 3 },
                        ],
                    },
                } as any,
                "NEM",
            );

            expect(snapshot.updated_at).toBe("2026-01-01T00:05:00Z");
            expect(snapshot.summary.net_generation_mw).toBe(20);
            expect(snapshot.summary.demand_mw).toBe(15);
            expect(snapshot.emissions.volume_tco2e_per_30m).toBe(3);
        });

        it("handles unknown fueltech, zero generation, and missing market data", () => {
            const t = new Date("2026-01-01T02:00:00.000Z");

            const snapshot = buildSnapshotFromRows(
                [{ interval: t, region: "NSW1", fueltech: null, power: 0, energy: 0, market_value: 5 }],
                [],
                [],
                "NEM",
            );

            expect(snapshot.updated_at).toBe("2026-01-01T02:00:00Z");
            expect(snapshot.summary).toEqual({
                net_generation_mw: 0,
                renewables_mw: 0,
                renewables_pct: null,
                demand_mw: 0,
            });
            expect(snapshot.generation[0]).toEqual({
                fueltech: "unknown",
                label: "unknown",
                power_mw: 0,
                proportion_pct: null,
                price_dollar_per_mwh: null,
                total_energy_mwh: 0,
            });
            expect(snapshot.regions.NSW1?.price_dollar_per_mwh).toBeNull();
            expect(snapshot.regions.NSW1?.demand_mw).toBeNull();
            expect(snapshot.regions.NSW1?.curtailment).toEqual([
                { fueltech: "solar_utility", label: "Solar (Utility)", power_mw: 0, proportion_pct: null },
                { fueltech: "wind", label: "Wind", power_mw: 0, proportion_pct: null },
            ]);
            expect(snapshot.regions.NSW1?.emissions).toEqual({
                volume_tco2e_per_30m: 0,
                intensity_kgco2e_per_mwh: null,
            });
        });

        it("falls back to market or current time when generation timestamps are unavailable", () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2026-01-01T03:00:00.000Z"));

            const marketOnly = buildSnapshotFromRows(
                [],
                [{ interval: new Date("2026-01-01T02:30:00.000Z"), network_region: "WEM", price: 40, demand: 25 }],
                [{ interval: new Date("2026-01-01T02:30:00.000Z"), network_region: "WEM", emissions: 2 }],
                "WEM",
            );

            expect(marketOnly.updated_at).toBe("2026-01-01T02:30:00Z");
            expect(marketOnly.summary).toEqual({
                net_generation_mw: 0,
                renewables_mw: 0,
                renewables_pct: null,
                demand_mw: 25,
            });
            expect(marketOnly.regions.WEM?.emissions.intensity_kgco2e_per_mwh).toBeNull();

            const emptySnapshot = buildSnapshotFromRows([], [], [], "NEM");
            expect(emptySnapshot.updated_at).toBe("2026-01-01T03:00:00Z");
            expect(emptySnapshot.regions).toEqual({});
        });
    });
});
