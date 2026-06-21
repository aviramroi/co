import { defineConfig } from "tsdown";

// Bundles the CLI + the pure TIF codec into one dependency-free ESM file so the
// package can be published and run via `npx tif-proxy` with nothing else
// installed. The shebang comes from src/tif-proxy/cli.ts.
export default defineConfig({
  entry: { "tif-proxy": "../../src/tif-proxy/cli.ts" },
  outDir: "bin",
  format: "esm",
  platform: "node",
  fixedExtension: false,
  outExtensions: () => ({ js: ".mjs" }),
  dts: false,
});
