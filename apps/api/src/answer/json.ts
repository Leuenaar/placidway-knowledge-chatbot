/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/answer/json.ts
 * PURPOSE : Get the JSON object from the model's reply, even if the model
 *           wrapped it in code fences or extra sentences.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. JSON extractor from the reply text
 * ============================================================================ */

import { AnswerError } from "./config";

// ===== PART 1: JSON extractor from the reply text =====
/** The model is asked for bare JSON, but may still wrap it in a code fence or add a sentence around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AnswerError("The model reply contained no JSON object");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AnswerError("The model reply was not valid JSON");
  }
}
