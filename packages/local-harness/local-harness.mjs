#!/usr/bin/env node
// Launcher: this package is TS-first (run via tsx, like the rest of the
// monorepo). Spawn the CLI source through tsx so it works without a build.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "src", "cli.ts");

const child = spawn(process.execPath, ["--import", "tsx", src, ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
