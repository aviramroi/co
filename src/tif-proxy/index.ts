// TIF MCP proxy — public surface.
//
// A local, transparent MCP stdio proxy that re-encodes verbose tool results as
// TIF (Token Interchange Format) to cut the tokens an LLM has to read, with no
// change to tool inputs or protocol semantics. See ./README.md.

export {
  parseArgs,
  pipeLines,
  ProxyUsageError,
  runProxy,
  runProxyMain,
  USAGE,
  type ParsedArgs,
  type ProxyStreams,
  type RunProxyConfig,
} from "./proxy.js";

export {
  isRecordArray,
  maybeDecodeTif,
  maybeEncodeText,
  TIF_INSTRUCTIONS,
  TIF_MARKER,
  transformLine,
  transformMessage,
  transformRequestLine,
  transformRequestMessage,
  type TransformOptions,
} from "./transform.js";
