import "dotenv/config";
import Fastify from "fastify";
import swagger from "@fastify/swagger";
import websocket from "@fastify/websocket";
import * as fs from "fs";
import * as path from "path";

// Import your routes
import restRoutes from "./routes/rest";
import sseRoutes from "./routes/sse";
import wsRoutes from "./routes/ws";

async function generate(): Promise<void> {
  const fastify = Fastify({ logger: false });

  // Register swagger FIRST
  await fastify.register(swagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "ElectricityGrid API",
        description: "Real-time and historical electricity grid data for Australian networks (NEM & WEM)",
        version: "1.0.0",
      },
      servers: [
        { url: "http://localhost:3000", description: "Local development" },
        { url: "http://ec2-54-226-204-58.compute-1.amazonaws.com:3000", description: "Production" },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
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
          EnergySnapshot: {
            type: "object",
            properties: {
              updated_at:  { type: "string", format: "date-time" },
              network:     { $ref: "#/components/schemas/NetworkCode" },
              summary:     { $ref: "#/components/schemas/SnapshotSummary" },
              emissions:   { $ref: "#/components/schemas/SnapshotEmissions" },
              generation:  { type: "array", items: { $ref: "#/components/schemas/SnapshotGenerationItem" } },
              loads:       { type: "array", items: { $ref: "#/components/schemas/SnapshotGenerationItem" } },
              curtailment: { type: "array", items: { $ref: "#/components/schemas/SnapshotCurtailmentItem" } },
              regions: {
                type: "object",
                additionalProperties: { $ref: "#/components/schemas/RegionSnapshot" },
              },
            },
          },
          SuccessResponse: {
            type: "object",
            properties: {
              success:    { type: "boolean", example: true },
              updated_at: { type: "string", format: "date-time" },
              data:       { type: "object" },
            },
          },
          ErrorResponse: {
            type: "object",
            properties: {
              success: { type: "boolean", example: false },
              error:   { type: "string" },
            },
          },
        },
      },
      security: [{ ApiKeyAuth: [] }],
    },
  });

  // Register routes so swagger picks up their schemas
  await fastify.register(websocket);
  await fastify.register(restRoutes);
  await fastify.register(sseRoutes);
  await fastify.register(wsRoutes);

  // Must call ready() to trigger swagger generation
  await fastify.ready();

  // Extract the generated spec
  const spec = fastify.swagger();

  // Write to file
  const outputPath = path.resolve(__dirname, "../../swagger.json");
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));

  console.log(`swagger.json generated at: ${outputPath}`);

  await fastify.close();
}

generate().catch((err) => {
  console.error("Failed to generate swagger.json", err);
  process.exit(1);
});