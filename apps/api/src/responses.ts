/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/responses.ts
 * TUJUAN  : Pembuat objek balasan standar (ChatResponse) supaya semua
 *           balasan, termasuk error, punya bentuk yang sama dan nilai bawaan
 *           yang sama.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Pembuat balasan standar dan balasan error
 * ============================================================================ */

/**
 * Helpers that build ChatResponse objects.
 *
 * Why: every reply, including errors, uses the same shape, so the UI has one code path.
 * Building them in one place keeps the defaults (no sources, no disclaimer) consistent.
 */
import type { ChatResponse } from "@pwbot/shared";

// ===== BAGIAN 1: Pembuat balasan standar dan balasan error =====
type ResponseInput = Pick<ChatResponse, "answer" | "kind"> & Partial<ChatResponse>;

export function buildResponse(input: ResponseInput): ChatResponse {
  return {
    sources: [],
    show_disclaimer: false,
    disclaimer_text: null,
    quote_url: null,
    offer_lead: false,
    follow_ups: [],
    ...input,
  };
}

export function errorResponse(kind: "error" | "rate_limited", answer: string): ChatResponse {
  return buildResponse({ kind, answer });
}
