// Stdio wiring for the TIF MCP proxy.
//
// Spawns the upstream MCP server and sits between it and the MCP client:
//   client.stdout -> proxy.stdin  -> upstream.stdin   (requests, passed through)
//   upstream.stdout -> [TIF transform] -> proxy.stdout (results, re-encoded)
//   upstream.stderr -> proxy.stderr                    (logs, passed through)

import type { Readable, Writable } from "node:stream";
import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { transformLine, transformRequestLine, type TransformOptions } from "./transform.js";

export interface ProxyStreams {
  stdin: Readable; // data coming from the MCP client
  stdout: Writable; // data going to the MCP client
  stderr: Writable; // diagnostics
}

export interface RunProxyConfig {
  /** Upstream MCP server command and its arguments (everything after `--`). */
  command: string;
  args: string[];
  streams: ProxyStreams;
  options?: TransformOptions;
  /** Re-encode tool results as TIF (upstream -> client). Default true. */
  encodeOutputs?: boolean;
  /** Decode TIF-encoded tool arguments (client -> upstream). Default true. */
  decodeInputs?: boolean;
  /** Injectable spawn for testing; defaults to node:child_process.spawn. */
  spawnFn?: typeof nodeSpawn;
}

/**
 * Apply `transform` to each newline-delimited line of `input`, writing the
 * results (re-joined with "\n") to `output`. Returns a flush function for any
 * trailing partial line. Exported for unit testing.
 */
export function pipeLines(
  input: Readable,
  output: Writable,
  transform: (line: string) => string,
  opts: { endOutput?: boolean } = {},
): () => void {
  let buffer = "";
  input.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString();
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      output.write(transform(line) + "\n");
    }
  });
  const flush = () => {
    if (buffer.length > 0) {
      output.write(transform(buffer));
      buffer = "";
    }
  };
  input.on("end", () => {
    flush();
    // Propagate EOF to the upstream's stdin so it can shut down. Never end the
    // client-facing stdout this way (that's the process's own stream).
    if (opts.endOutput) {
      output.end();
    }
  });
  return flush;
}

/** Spawn the upstream server and wire the proxy streams. Returns the child. */
export function runProxy(config: RunProxyConfig): ChildProcessWithoutNullStreams {
  const spawnFn = config.spawnFn ?? nodeSpawn;
  const child = spawnFn(config.command, config.args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // client -> upstream: decode TIF-encoded tool arguments back to JSON
  if (config.decodeInputs ?? true) {
    pipeLines(config.streams.stdin, child.stdin, transformRequestLine, { endOutput: true });
  } else {
    config.streams.stdin.pipe(child.stdin);
  }

  // upstream -> client: re-encode tool results as TIF
  const encodeOutputs = config.encodeOutputs ?? true;
  pipeLines(child.stdout, config.streams.stdout, (line) =>
    encodeOutputs ? transformLine(line, config.options) : line,
  );

  // upstream logs pass through
  child.stderr.pipe(config.streams.stderr);

  return child;
}

export interface ParsedArgs {
  command: string;
  args: string[];
  options: TransformOptions;
  encodeOutputs: boolean;
  decodeInputs: boolean;
}

/** Parse `[flags] -- <command> [args...]`. Throws on missing command. */
export function parseArgs(argv: string[]): ParsedArgs {
  const options: TransformOptions = {};
  let encodeOutputs = true;
  let decodeInputs = true;
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      i++;
      break;
    }
    if (a === "--min-rows") {
      options.minRows = Number(argv[++i]);
      continue;
    }
    if (a === "--no-encode-outputs") {
      encodeOutputs = false;
      continue;
    }
    if (a === "--no-decode-inputs") {
      decodeInputs = false;
      continue;
    }
    if (a === "-h" || a === "--help") {
      throw new ProxyUsageError(USAGE);
    }
    // First non-option token (no leading `--`) also starts the command.
    if (!a.startsWith("--")) {
      break;
    }
    throw new ProxyUsageError(`Unknown option: ${a}\n\n${USAGE}`);
  }
  const rest = argv.slice(i);
  if (rest.length === 0) {
    throw new ProxyUsageError(`Missing upstream command.\n\n${USAGE}`);
  }
  return { command: rest[0], args: rest.slice(1), options, encodeOutputs, decodeInputs };
}

export class ProxyUsageError extends Error {}

export const USAGE = [
  "tif-proxy — a local MCP proxy that re-encodes tool results as TIF to cut tokens.",
  "",
  "Usage:",
  "  tif-proxy [--min-rows N] [--no-encode-outputs] [--no-decode-inputs] -- <mcp-server-command> [args...]",
  "",
  "Re-encodes tool results as TIF (outputs) and decodes TIF-encoded tool",
  "arguments back to JSON (inputs). Both directions are on by default.",
  "",
  "Example (wrap the GitHub MCP server):",
  "  tif-proxy -- npx -y @modelcontextprotocol/server-github",
].join("\n");

/** CLI entrypoint: parse argv, spawn, and forward the upstream exit code. */
export function runProxyMain(argv: string[]): void {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    if (err instanceof ProxyUsageError) {
      process.stderr.write(err.message + "\n");
      process.exit(err.message.startsWith("tif-proxy") ? 0 : 2);
    }
    throw err;
  }

  const child = runProxy({
    command: parsed.command,
    args: parsed.args,
    options: parsed.options,
    encodeOutputs: parsed.encodeOutputs,
    decodeInputs: parsed.decodeInputs,
    streams: { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => child.kill(sig));
  }
}
