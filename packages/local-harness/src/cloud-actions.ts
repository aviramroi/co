/**
 * Cloud action clients.
 *
 * This is the ONLY place in the harness that performs network I/O, and the
 * harness invokes it at most once per run — after the full prompt has been
 * assembled from locally gathered context.
 */

import type { CloudActionClient, CloudActionResult, FinalPrompt } from "./types.ts";

export interface AnthropicClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  model?: string;
  content?: AnthropicTextBlock[];
}

/** Anthropic Messages API client. */
export class AnthropicCloudClient implements CloudActionClient {
  readonly name = "anthropic";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly maxTokens: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AnthropicClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) {
      throw new Error(
        "AnthropicCloudClient requires an API key (pass apiKey or set ANTHROPIC_API_KEY).",
      );
    }
    this.apiKey = apiKey;
    this.model = opts.model ?? "claude-opus-4-7";
    this.baseUrl = opts.baseUrl ?? "https://api.anthropic.com";
    this.maxTokens = opts.maxTokens ?? 8192;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async proposeActions(prompt: FinalPrompt): Promise<CloudActionResult> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 500)}`);
    }
    const data = (await res.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");
    return { model: data.model ?? this.model, text, raw: data };
  }
}

/**
 * Offline client used for dry runs and tests. Performs no network I/O; it
 * just reports what *would* have been sent to the cloud.
 */
export class EchoCloudClient implements CloudActionClient {
  readonly name = "echo";

  async proposeActions(prompt: FinalPrompt): Promise<CloudActionResult> {
    return {
      model: "echo",
      text:
        `[dry-run] would call cloud model with ${prompt.chars} chars ` +
        `(system ${prompt.system.length}, user ${prompt.user.length}).`,
      raw: { dryRun: true },
    };
  }
}
