/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/responses.ts
 * PURPOSE : Builder of the standard reply object (ChatResponse) so every
 *           reply, including errors, has the same shape and the same defaults.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Builder of the standard reply and the error reply
 * ============================================================================ */

/**
 * Helpers that build ChatResponse objects.
 *
 * Why: every reply, including errors, uses the same shape, so the UI has one code path.
 * Building them in one place keeps the defaults (no sources, no disclaimer) consistent.
 */
import type { ChatResponse } from "@pwbot/shared";

// ===== PART 1: Builder of the standard reply and the error reply =====
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
