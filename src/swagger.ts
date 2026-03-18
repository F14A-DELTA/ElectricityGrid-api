import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger";


export const snapshotSummarySchema = {
  type: "object",
  properties: {
    net_generation_mw: { type: "number", nullable: true },
    renewables_mw:     { type: "number", nullable: true },
    renewables_pct:    { type: "number", nullable: true },
    demand_mw:         { type: "number", nullable: true },
  },
} as const;

export const snapshotEmissionsSchema = {
  type: "object",
  properties: {
    volume_tco2e_per_30m:     { type: "number", nullable: true },
    intensity_kgco2e_per_mwh: { type: "number", nullable: true },
  },
} as const;

export const snapshotGenerationItemSchema = {
  type: "object",
  properties: {
    fueltech:             { type: "string" },
    label:                { type: "string" },
    power_mw:             { type: "number", nullable: true },
    proportion_pct:       { type: "number", nullable: true },
    price_dollar_per_mwh: { type: "number", nullable: true },
    total_energy_mwh:     { type: "number", nullable: true },
  },
} as const;

export const snapshotCurtailmentItemSchema = {
  type: "object",
  properties: {
    fueltech:       { type: "string" },
    label:          { type: "string" },
    power_mw:       { type: "number", nullable: true },
    proportion_pct: { type: "number", nullable: true },
  },
} as const;

export const regionSnapshotSchema = {
  type: "object",
  properties: {
    price_dollar_per_mwh: { type: "number", nullable: true },
    demand_mw:            { type: "number", nullable: true },
    summary:              snapshotSummarySchema,
    emissions:            snapshotEmissionsSchema,
    generation:           { type: "array", items: snapshotGenerationItemSchema },
    loads:                { type: "array", items: snapshotGenerationItemSchema },
    curtailment:          { type: "array", items: snapshotCurtailmentItemSchema },
  },
} as const;

export const energySnapshotSchema = {
  type: "object",
  properties: {
    updated_at:  { type: "string", format: "date-time" },
    network:     { type: "string", enum: ["NEM", "WEM"] },
    summary:     snapshotSummarySchema,
    emissions:   snapshotEmissionsSchema,
    generation:  { type: "array", items: snapshotGenerationItemSchema },
    loads:       { type: "array", items: snapshotGenerationItemSchema },
    curtailment: { type: "array", items: snapshotCurtailmentItemSchema },
    regions: {
      type: "object",
      additionalProperties: regionSnapshotSchema,
    },
  },
} as const;

export const historyPointSchema = {
  type: "object",
  properties: {
    timestamp: { type: "string", format: "date-time" },
    value:     { type: "number", nullable: true },
  },
} as const;

export const rangeStatSchema = {
  type: "object",
  properties: {
    min: historyPointSchema,
    max: historyPointSchema,
  },
} as const;

export const swaggerOpenApi: FastifyDynamicSwaggerOptions["openapi"] = {
  openapi: "3.0.0",
  info: {
    title: "ElectricityGrid API",
    description: "Real-time and historical electricity grid data for Australian networks (NEM & WEM)",
    version: "1.0.0",
  },
  servers: [
    {
      url: "http://ec2-54-226-204-58.compute-1.amazonaws.com:3000",
      description: "Production"
    },
    {
      url: "http://localhost:3000",
      description: "Local development"
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API Key",
      },
    },
    schemas: {
      NetworkCode: {
        type: "string",
        enum: ["NEM", "WEM"],
      },
      RegionCode: {
        type: "string",
        enum: ["NSW1", "QLD1", "VIC1", "SA1", "TAS1", "WEM"],
      },
      // ← reusing the exported constants directly, no duplication
      SnapshotSummary:        snapshotSummarySchema,
      SnapshotEmissions:      snapshotEmissionsSchema,
      SnapshotGenerationItem: snapshotGenerationItemSchema,
      SnapshotCurtailmentItem:snapshotCurtailmentItemSchema,
      RegionSnapshot:         regionSnapshotSchema,
      EnergySnapshot:         energySnapshotSchema as any,
      RangeStat:              rangeStatSchema,
      HistoryPoint:           historyPointSchema,
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error:   { type: "string" },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};
 
// ── Response helpers for use in route schema definitions ─────────────────────
 
export function successResponse(description: string, dataSchema: object) {
  return {
    description,
    type: "object",
    properties: {
      success:    { type: "boolean", example: true },
      updated_at: { type: "string", format: "date-time" },
      data:       dataSchema,
    },
  };
}
 
export function errorResponse(description: string) {
  return {
    description,
    type: "object",
    properties: {
      success: { type: "boolean", example: false },
      error:   { type: "string" },
    },
  };
}