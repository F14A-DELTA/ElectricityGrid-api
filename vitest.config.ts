import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.spec.ts", "tests/**/*.test.ts", "tests/**/*.spec.ts"],
    reporters: ["default", "junit"],
    outputFile: {
      junit: "junit.xml",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "src/**/*.d.ts",
        "src/generate-swagger.ts",
        "src/types.ts",
      ],
      reporter: ["text", "html", "lcov", "json-summary"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
    testTimeout: 20000,
  },
});