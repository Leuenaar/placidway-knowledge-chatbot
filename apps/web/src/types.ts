/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/types.ts
 * PURPOSE : Types used only on the web side: one chat message and the contact
 *           card result. The API contract itself is in packages/shared.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. Type: one chat message
 *    3. Type: contact card result (sent or refused)
 * ============================================================================ */

// ===== PART 1: Imports =====
/** Types used only inside the web app. The API contract itself lives in @pwbot/shared. */
import type { ChatResponse } from "@pwbot/shared";

// ===== PART 2: Type: one chat message =====
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Present for assistant messages that came from the API (not for the local greeting). */
  response?: ChatResponse;
  /** What became of the contact card offered with this reply: sent, or declined. Never holds the visitor's name or email. */
  lead?: LeadOutcome;
}

// ===== PART 3: Type: contact card result (sent or refused) =====
export type LeadOutcome = "done" | "declined";
