/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/answer/text.ts
 * PURPOSE : Text cleaner before it is pasted into a prompt tag, and the
 *           conversation history formatter (long messages are cut so they do
 *           not push out the page pieces).
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Remove fake tags from the text
 *    2. Format of the conversation history (cut at 600 characters)
 * IF ASKED TO CHANGE:
 *    - Maximum length of one history message (MAX_TURN_CHARS) (PART 2)
 * ============================================================================ */

import type { Turn } from "../history";

// ===== PART 1: Remove fake tags from the text =====
/** Remove anything that could close or fake our own tags from text we paste inside them. */
export function neutralize(text: string): string {
  return text.replace(/<\/?\s*(excerpts?|question|conversation|turn|reply_language|message|reminder|care_note)\b[^>]*>/gi, "");
}

// ===== PART 2: Format of the conversation history (cut at 600 characters) =====
const MAX_TURN_CHARS = 600;

/** The recent conversation as tagged text. Long messages are cut, so history can never crowd out the excerpts. */
export function formatConversation(history: Turn[]): string {
  if (history.length === 0) return "";
  const turns = history
    .map((t) => `<turn role="${t.role}">${neutralize(t.text.length > MAX_TURN_CHARS ? `${t.text.slice(0, MAX_TURN_CHARS)}...` : t.text)}</turn>`)
    .join("\n");
  return `<conversation>\n${turns}\n</conversation>`;
}
