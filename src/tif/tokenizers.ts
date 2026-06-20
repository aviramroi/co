// Pluggable tokenizers for the TIF benchmark.
//
// Real tokenizers are loaded best-effort: js-tiktoken gives exact OpenAI BPE
// (o200k_base = GPT-4o/o-series, cl100k_base = GPT-4/3.5); @anthropic-ai/tokenizer
// gives Claude's BPE. Anything unavailable is simply skipped. A char/4 heuristic
// is always present as a floor. Gemini has no offline tokenizer — its exact
// counts require the countTokens API; we approximate and label it as such.

export interface Tokenizer {
  id: string;
  label: string;
  /** Exact when backed by a real BPE; approximate for heuristics. */
  exact: boolean;
  count(text: string): number;
}

let cache: Tokenizer[] | null = null;

async function tryLoad(make: () => Promise<Tokenizer | null>): Promise<Tokenizer | null> {
  try {
    return await make();
  } catch {
    return null; // optional dependency missing — skip silently
  }
}

/** Load all available tokenizers once (memoized). */
export async function getTokenizers(): Promise<Tokenizer[]> {
  if (cache) {
    return cache;
  }
  const list: (Tokenizer | null)[] = [];

  // OpenAI (o200k_base + cl100k_base) via js-tiktoken.
  list.push(
    await tryLoad(async () => {
      const { Tiktoken } = await import("js-tiktoken");
      const o200k = (await import("js-tiktoken/ranks/o200k_base")).default;
      const enc = new Tiktoken(o200k);
      return {
        id: "openai-o200k",
        label: "OpenAI o200k (GPT-4o)",
        exact: true,
        count: (t) => enc.encode(t).length,
      };
    }),
  );
  list.push(
    await tryLoad(async () => {
      const { Tiktoken } = await import("js-tiktoken");
      const cl100k = (await import("js-tiktoken/ranks/cl100k_base")).default;
      const enc = new Tiktoken(cl100k);
      return {
        id: "openai-cl100k",
        label: "OpenAI cl100k (GPT-4)",
        exact: true,
        count: (t) => enc.encode(t).length,
      };
    }),
  );

  // Anthropic / Claude via @anthropic-ai/tokenizer.
  list.push(
    await tryLoad(async () => {
      const mod = (await import("@anthropic-ai/tokenizer")) as {
        countTokens?: (t: string) => number;
      };
      if (typeof mod.countTokens !== "function") {
        return null;
      }
      return {
        id: "anthropic",
        label: "Anthropic (Claude)",
        exact: true,
        count: (t) => mod.countTokens!(t),
      };
    }),
  );

  // Always-available heuristic floor (~4 chars/token).
  list.push({
    id: "heuristic",
    label: "Heuristic (~chars/4)",
    exact: false,
    count: (t) => Math.ceil(t.length / 4),
  });

  cache = list.filter((t): t is Tokenizer => t !== null);
  return cache;
}
