// TIF — Token Interchange Format.
// A token-efficient, lossless serialization for arrays of records:
// schema-once + positional values + tiny grammar + dictionary compression.
// See src/tif/README.md for the spec.

export { encode } from "./encode.js";
export { decode, decodeAll } from "./decode.js";
export type { ColType, Column, EncodeOptions, Json, Record_ } from "./types.js";
