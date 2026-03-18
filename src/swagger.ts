import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger";


export const snapshotSummarySchema = {
  type: "object",
  properties: {
    net_generation_mw: { type: "number", nullable: true },
    renewables_mw:     { type: "number", nullable: true },
    renewables_pct:    { type: "number", nullable: true },
    demand_mw:         { type: "number", nullable: true },
  },
};

export const swaggerOpenApi: FastifyDynamicSwaggerOptions["openapi"] = {
  openapi: "3.0.0",
  info: {
    title: "ElectricityGrid API",
    description: "Real-time and historical electricity grid data for Australian networks (NEM & WEM)",
    version: "1.0.0",
  },
  servers: [
    { url: "http://ec2-54-226-204-58.compute-1.amazonaws.com:3000", description: "Production" },
    { url: "http://localhost:3000",                                  description: "Local development" },
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
      SnapshotSummary: {
        type: "object",
        properties: {
          net_generation_mw: { type: "number", nullable: true },
          renewables_mw:     { type: "number", nullable: true },
          renewables_pct:    { type: "number", nullable: true },
          demand_mw:         { type: "number", nullable: true },
        },
      },
      SnapshotEmissions: {
        type: "object",
        properties: {
          volume_tco2e_per_30m:     { type: "number", nullable: true },
          intensity_kgco2e_per_mwh: { type: "number", nullable: true },
        },
      },
      SnapshotGenerationItem: {
        type: "object",
        properties: {
          fueltech:             { type: "string" },
          label:                { type: "string" },
          power_mw:             { type: "number", nullable: true },
          proportion_pct:       { type: "number", nullable: true },
          price_dollar_per_mwh: { type: "number", nullable: true },
          total_energy_mwh:     { type: "number", nullable: true },
        },
      },
      SnapshotCurtailmentItem: {
        type: "object",
        properties: {
          fueltech:       { type: "string" },
          label:          { type: "string" },
          power_mw:       { type: "number", nullable: true },
          proportion_pct: { type: "number", nullable: true },
        },
      },
      RegionSnapshot: {
        type: "object",
        properties: {
          price_dollar_per_mwh: { type: "number", nullable: true },
          demand_mw:            { type: "number", nullable: true },
          summary:     { $ref: "#/components/schemas/SnapshotSummary" },
          emissions:   { $ref: "#/components/schemas/SnapshotEmissions" },
          generation:  { type: "array", items: { $ref: "#/components/schemas/SnapshotGenerationItem" } },
          loads:       { type: "array", items: { $ref: "#/components/schemas/SnapshotGenerationItem" } },
          curtailment: { type: "array", items: { $ref: "#/components/schemas/SnapshotCurtailmentItem" } },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

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

export const snapshotEmissionsSchema = {
  type: "object",
  properties: {
    volume_tco2e_per_30m:     { type: "number", nullable: true },
    intensity_kgco2e_per_mwh: { type: "number", nullable: true },
  },
};

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
};

export const snapshotCurtailmentItemSchema = {
  type: "object",
  properties: {
    fueltech:       { type: "string" },
    label:          { type: "string" },
    power_mw:       { type: "number", nullable: true },
    proportion_pct: { type: "number", nullable: true },
  },
};

const regionSnapshotSchema = {
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
};

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
};

export const rangeStatSchema = {
  type: "object",
  properties: {
    min: {
      type: "object",
      properties: {
        value:     { type: "number", nullable: true },
        timestamp: { type: "string", nullable: true },
      },
    },
    max: {
      type: "object",
      properties: {
        value:     { type: "number", nullable: true },
        timestamp: { type: "string", nullable: true },
      },
    },
  },
};

export const historyPointSchema = {
  type: "object",
  properties: {
    timestamp: { type: "string", format: "date-time" },
    value:     { type: "number", nullable: true },
  },
};
