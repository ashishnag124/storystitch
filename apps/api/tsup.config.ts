import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/migrate.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  // The shared package is TypeScript source with no build step, so bundle it in.
  noExternal: [/^@storystitch\//],
});
