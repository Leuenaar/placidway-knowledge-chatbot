/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/limits/meter.ts
 * TUJUAN  : Pembungkus klien model supaya setiap panggilan melaporkan token
 *           yang dipakai ke anggaran harian.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Pembungkus penghitung token
 * ============================================================================ */

import type { ModelClient } from "../answer/anthropic";

// ===== BAGIAN 1: Pembungkus penghitung token =====
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
