/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/unanswered/mask.ts
 * PURPOSE : Remove the most obvious personal data (email, phone number, long
 *           digit runs) from a message before it is stored in the log. This is
 *           a net, not a guarantee: names and health stories are not removed.
 *           Dollar amounts stay, because a question like 'I heard $50' is
 *           exactly what we want to see.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Patterns for email, phone, long numbers
 *    2. Masking function
 *    3. Final text that is stored (max 500 characters)
 * IF ASKED TO CHANGE:
 *    - Add a pattern to mask (PART 1)
 * ============================================================================ */

// ===== PART 1: Patterns for email, phone, long numbers =====
/**
 * Removes the most obvious personal data from a visitor's message before it is stored in the unanswered-questions log:
 * e-mail addresses, phone-like numbers and any long run of digits. Visitors can type health details and contact details
 * into a chat, and the log only needs to show what kind of question could not be answered.
 *
 * It is a net, not a guarantee: names and free-text health details are NOT removed. The README says so.
 * Dollar amounts ("$18,995", "$50") stay, because "I heard it costs $50" is exactly the kind of question worth seeing.
 */
export const MAX_QUESTION_LENGTH = 500;

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/g;
/** A run of digits that may contain spaces, dots, dashes or brackets between them, with at least 7 digits in total. */
const PHONE_LIKE = /(?<![\w$])\+?\(?\d[\d\s().-]{5,}\d(?!\w)/g;
const LONG_DIGITS = /\d{6,}/g;

// ===== PART 2: Masking function =====
export function maskPersonalData(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(PHONE_LIKE, (m) => (m.replace(/\D/g, "").length >= 7 ? "[number]" : m))
    .replace(LONG_DIGITS, "[number]")
    .replace(/\s+/g, " ")
    .trim();
}

// ===== PART 3: Final text that is stored (max 500 characters) =====
/** What is stored: masked, at most 500 characters (the column limit). Empty when nothing useful is left. */
export function questionForLog(message: string): string {
  const masked = maskPersonalData(message);
  return masked.length > MAX_QUESTION_LENGTH ? masked.slice(0, MAX_QUESTION_LENGTH) : masked;
}
