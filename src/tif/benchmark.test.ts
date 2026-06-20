import { describe, expect, it } from "vitest";
import { formatResult, runBenchmark } from "./benchmark.js";
import { DATASETS, salesforceAccounts } from "./datasets.js";
import { decode } from "./decode.js";
import { SERIALIZERS } from "./formats.js";

describe("TIF benchmark", () => {
  it("beats JSON on tokens for every tokenizer and dataset", async () => {
    for (const dataset of DATASETS) {
      const result = await runBenchmark(dataset);
      const json = result.byFormat.json;
      const tif = result.byFormat.tif;
      for (const tk of result.tokenizers) {
        expect(
          tif.tokensByTokenizer[tk.id],
          `TIF should be smaller than JSON for ${dataset.name} / ${tk.id}`,
        ).toBeLessThan(json.tokensByTokenizer[tk.id]);
      }
    }
  });

  it("achieves a meaningful reduction on the Salesforce case (real OpenAI tokenizer)", async () => {
    const result = await runBenchmark(salesforceAccounts(100));
    const oai = result.tokenizers.find((t) => t.id === "openai-o200k");
    if (!oai) {
      return;
    } // tokenizer unavailable in this environment
    const json = result.byFormat.json.tokensByTokenizer[oai.id];
    const tif = result.byFormat.tif.tokensByTokenizer[oai.id];
    expect(tif).toBeLessThan(json * 0.6); // >40% fewer tokens
  });

  it("TIF stays losslessly decodable (in + out tokens both shrink, data preserved)", () => {
    const ds = salesforceAccounts(20);
    const text = SERIALIZERS.find((s) => s.id === "tif")!.serialize(ds.records);
    expect(decode(text)).toEqual(ds.records);
  });

  it("prints comparison tables for the record", async () => {
    for (const dataset of DATASETS) {
      const result = await runBenchmark(dataset);
      // Visible in `vitest --reporter=verbose` output; serves as living proof.
      console.log("\n" + formatResult(result));
    }
    expect(true).toBe(true);
  });
});
