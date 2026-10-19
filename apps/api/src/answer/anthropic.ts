/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/answer/anthropic.ts
 * PURPOSE : Small client for the Anthropic Messages API, using only fetch.
 *           Everything that leaves the server is visible in one place: key,
 *           model, effort, timeout and error handling.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. API address, version, default timeout (30 seconds)
 *    2. Shape of the model call result
 *    3. Client: send the request, handle errors and timeouts, read the tokens
 * IF ASKED TO CHANGE:
 *    - Timeout for the model call (DEFAULT_TIMEOUT_MS) (PART 1)
 *    - Header or body of the request to Anthropic (PART 3)
 * ============================================================================ */

/**
 * A very small client for the Anthropic Messages API, using only fetch (same approach as the database client:
 * fewer dependencies, and every byte that leaves the server is visible in one place).
 * It sends no temperature, top_p or assistant prefill: some newer models reject them, and none is needed here.
 */
import { AnswerError, type AnthropicConfig } from "./config";

// ===== PART 1: API address, version, default timeout (30 seconds) =====
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 30_000;

// ===== PART 2: Shape of the model call result =====
export interface Completion {
  text: string;
  /** end_turn, max_tokens, refusal, ... exactly as the API reports it. */
  stopReason: string;
  inputTokens: number;
  /** Billed output, including any internal reasoning. */
  outputTokens: number;
  /** The part of outputTokens spent on internal reasoning (usage.output_tokens_details.thinking_tokens), 0 if not reported. */
  thinkingTokens: number;
}

export interface ModelClient {
  complete(input: { system: string; user: string; maxTokens: number }): Promise<Completion>;
}

// ===== PART 3: Client: send the request, handle errors and timeouts, read the tokens =====
export function createAnthropicClient(
  config: AnthropicConfig,
  options: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): ModelClient {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    async complete({ system, user, maxTokens }) {
      let res: Response;
      try {
        res = await fetchFn(API_URL, {
          method: "POST",
          headers: {
            "x-api-key": config.apiKey,
            "anthropic-version": API_VERSION,
            "content-type": "application/json",
            // The API asks for this header when the key is not scoped to a workspace (its error message says so).
            ...(config.workspaceId ? { "anthropic-workspace-id": config.workspaceId } : {}),
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: user }],
            ...(config.effort ? { output_config: { effort: config.effort } } : {}),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name === "TimeoutError" || name === "AbortError") throw new AnswerError(`The model did not answer within ${timeoutMs / 1000} seconds`);
        throw new AnswerError(`Could not reach the model API (${e instanceof Error ? e.message : String(e)})`);
      }
      if (!res.ok) {
        // The error body names the problem (for example an invalid key or an unknown model); it never contains our key.
        const body = (await res.text().catch(() => "")).slice(0, 300);
        throw new AnswerError(`Model API error: HTTP ${res.status} ${body}`);
      }
      const data = (await res.json().catch(() => undefined)) as
        | { content?: Array<{ type?: string; text?: string }>; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { thinking_tokens?: number } } }
        | undefined;
      if (!data || !Array.isArray(data.content)) throw new AnswerError("The model API returned a reply in an unexpected shape");
      const text = data.content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
      return {
        text,
        stopReason: data.stop_reason ?? "unknown",
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        thinkingTokens: data.usage?.output_tokens_details?.thinking_tokens ?? 0,
      };
    },
  };
}
