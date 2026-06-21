// Salesforce token-reducing MCP proxy — public surface.
//
// See docs/salesforce-mcp-token-abstraction.md for the design. This module is
// transport-agnostic; wire `dispatch` + `FACADE_TOOLS` into an MCP server (or
// the co gateway's MCP path) backed by a SalesforceClient implementation.

export {
  dispatch,
  validateSoql,
  ValidationError,
  FACADE_TOOLS,
  type DispatchOpts,
  type DispatchResult,
  type DmlOp,
  type DmlResult,
  type FacadeTool,
  type SalesforceClient,
} from "./facade.js";

export {
  dropNulls,
  estimateTokens,
  shapeDescribe,
  shapeQuery,
  stripRecord,
  type QueryFormat,
  type RawDescribe,
  type RawDescribeField,
  type RawQueryResult,
  type SfRecord,
  type ShapedQuery,
  type SlimDescribe,
  type SlimField,
} from "./shape.js";
