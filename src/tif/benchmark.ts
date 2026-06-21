// TIF benchmark harness: serialize a dataset to every format, tokenize with
// every available tokenizer, and report tokens + savings vs a baseline.

import type { Record_ } from "./types.js";
import { SERIALIZERS, type Serializer } from "./formats.js";
import { getTokenizers, type Tokenizer } from "./tokenizers.js";

export interface Dataset {
  name: string;
  records: Record_[];
}

export interface Cell {
  chars: number;
  tokensByTokenizer: Record<string, number>;
}

export interface BenchmarkResult {
  dataset: string;
  rows: number;
  tokenizers: { id: string; label: string; exact: boolean }[];
  /** format id -> measurement */
  byFormat: Record<string, Cell>;
  /** baseline format id used for the savings columns */
  baseline: string;
}

export async function runBenchmark(
  dataset: Dataset,
  opts: { serializers?: Serializer[]; baseline?: string } = {},
): Promise<BenchmarkResult> {
  const serializers = opts.serializers ?? SERIALIZERS;
  const baseline = opts.baseline ?? "json";
  const tokenizers = await getTokenizers();

  const byFormat: Record<string, Cell> = {};
  for (const ser of serializers) {
    const text = ser.serialize(dataset.records);
    const tokensByTokenizer: Record<string, number> = {};
    for (const tk of tokenizers) {
      tokensByTokenizer[tk.id] = tk.count(text);
    }
    byFormat[ser.id] = { chars: text.length, tokensByTokenizer };
  }

  return {
    dataset: dataset.name,
    rows: dataset.records.length,
    tokenizers: tokenizers.map((t) => ({ id: t.id, label: t.label, exact: t.exact })),
    byFormat,
    baseline,
  };
}

/** Percentage reduction of `value` relative to `base` (positive = smaller). */
export function savings(base: number, value: number): number {
  if (base === 0) {
    return 0;
  }
  return Math.round((1 - value / base) * 1000) / 10;
}

/** Render a benchmark result as a plain-text table (one block per tokenizer). */
export function formatResult(
  result: BenchmarkResult,
  serializers: Serializer[] = SERIALIZERS,
): string {
  const baseCell = result.byFormat[result.baseline];
  const out: string[] = [];
  out.push(`# ${result.dataset}  (${result.rows} rows)`);

  for (const tk of result.tokenizers) {
    out.push("");
    out.push(`## ${tk.label}${tk.exact ? "" : " — approx"}   (baseline: ${result.baseline})`);
    out.push(pad("format", 16) + pad("tokens", 10) + pad("vs JSON", 10) + "chars");
    for (const ser of serializers) {
      const cell = result.byFormat[ser.id];
      if (!cell) {
        continue;
      }
      const tokens = cell.tokensByTokenizer[tk.id];
      const baseTokens = baseCell.tokensByTokenizer[tk.id];
      const save = ser.id === result.baseline ? "—" : `${savings(baseTokens, tokens)}%`;
      out.push(pad(ser.label, 16) + pad(String(tokens), 10) + pad(save, 10) + String(cell.chars));
    }
  }
  return out.join("\n");
}

function pad(s: string, n: number): string {
  return s.length >= n ? s + " " : s + " ".repeat(n - s.length);
}

export { getTokenizers, type Tokenizer };
