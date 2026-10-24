import { defineConfig } from "vitest/config";
import path from "node:path";

// Alias the workspace package to its source so tests run without a prior build.
export default defineConfig({
  resolve: {
    alias: {
      "@flowtofeed/shared": path.resolve(
        process.cwd(),
        "../../packages/shared/src/index.ts",
      ),
    },
  },
  test: {
    environment: "node",
  },
});
