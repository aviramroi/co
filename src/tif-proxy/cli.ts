#!/usr/bin/env node
// Executable entry for the TIF MCP proxy. Configure it in your MCP client as the
// server command, with the real server after `--`:
//   tif-proxy -- npx -y @modelcontextprotocol/server-github
import { runProxyMain } from "./proxy.js";

runProxyMain(process.argv.slice(2));
