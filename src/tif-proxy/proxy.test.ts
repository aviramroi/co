import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseArgs, pipeLines, ProxyUsageError } from "./proxy.js";
import { transformLine } from "./transform.js";

function collect(stream: PassThrough): Promise<string> {
  return new Promise((resolve) => {
    let out = "";
    stream.on("data", (c) => (out += c.toString()));
    stream.on("end", () => resolve(out));
  });
}

describe("pipeLines", () => {
  it("transforms each newline-delimited message and forwards the rest", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const records = [
      { Id: "001", Name: "Acme", OwnerId: "005x" },
      { Id: "002", Name: "Globex", OwnerId: "005x" },
    ];
    const toolMsg = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: JSON.stringify(records) }] },
    });

    pipeLines(input, output, (line) => transformLine(line));
    input.on("end", () => output.end()); // test-only: close output so collect() resolves
    const done = collect(output);

    // split a message across chunk boundaries to exercise buffering
    input.write(toolMsg.slice(0, 20));
    input.write(toolMsg.slice(20) + "\n");
    input.write('{"jsonrpc":"2.0","method":"ping"}\n');
    input.end();

    const out = await done;
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("[TIF v0.1]");
    expect(JSON.parse(lines[1])).toEqual({ jsonrpc: "2.0", method: "ping" }); // passthrough
  });
});

describe("parseArgs", () => {
  it("parses options and the upstream command after --", () => {
    const parsed = parseArgs(["--min-rows", "5", "--", "npx", "-y", "server-github"]);
    expect(parsed.options.minRows).toBe(5);
    expect(parsed.command).toBe("npx");
    expect(parsed.args).toEqual(["-y", "server-github"]);
  });
  it("treats a bare command (no --) as the upstream", () => {
    const parsed = parseArgs(["my-server", "--flag"]);
    expect(parsed.command).toBe("my-server");
    expect(parsed.args).toEqual(["--flag"]);
  });
  it("throws usage when no command is given", () => {
    expect(() => parseArgs(["--min-rows", "2", "--"])).toThrow(ProxyUsageError);
  });
  it("throws on unknown options", () => {
    expect(() => parseArgs(["--nope", "--", "server"])).toThrow(ProxyUsageError);
  });
});
