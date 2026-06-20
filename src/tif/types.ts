// Shared types for the TIF codec.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Record_ = { [k: string]: Json };

/**
 * Column scalar type tags used in the schema header.
 *  s=string  i=integer  n=number(float)  b=boolean  j=json(nested fallback)
 *  x=mixed scalars (decode by per-value inference)
 */
export type ColType = "s" | "i" | "n" | "b" | "j" | "x";

export interface Column {
  name: string;
  list: boolean; // true => `name[]`, values are arrays
  type: ColType; // for a list, the element type
}

export interface EncodeOptions {
  /** Table/record-type label emitted in the header. Default "r". */
  name?: string;
  /** Build a string dictionary for repeated values. Default true. */
  dictionary?: boolean;
  /**
   * Minimum number of occurrences before a string is added to the dictionary.
   * Default 2.
   */
  dictMinCount?: number;
  /**
   * Minimum length of a string before it is eligible for the dictionary.
   * Default 3 (shorter strings rarely pay for the `$n` reference + line).
   */
  dictMinLen?: number;
}
