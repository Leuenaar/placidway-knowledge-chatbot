/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/limits/meter.ts
 * PURPOSE : Wrapper around the model client so every call reports the tokens
 *           it used to the daily budget.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Token counter wrapper
 * ============================================================================ */

import type { ModelClient } from "../answer/anthropic";

// ===== PART 1: Token counter wrapper =====
/** Wraps a model client so every call reports the tokens it used (input + output, including reasoning) to the daily budget. */
export function meterClient(client: ModelClient, onTokens: (tokens: number) => void): ModelClient {
  return {
    async complete(input) {
      const completion = await client.complete(input);
      onTokens(completion.inputTokens + completion.outputTokens);
      return completion;
    },
  };
}
