/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/limits/guess.ts
 * PURPOSE : A rough, free guess of the message language (from letters and
 *           common words) among the five languages. Only for the usage-limit
 *           message, which must not call the model. If in doubt, English.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Letter patterns and common words per language
 *    2. Language guessing function
 * ============================================================================ */

// ===== PART 1: Letter patterns and common words per language =====
/**
 * A rough, free guess of which of the five supported languages a message is written in. Used only for the limit messages, which must not call
 * the model. It looks at the script and a few very common words; when unsure it says English.
 */
const ARABIC = /[؀-ۿ]/;
const TURKISH_LETTERS = /[ğışİŞĞ]/;
const TURKISH_WORDS = /\b(ne kadar|nasıl|merhaba|tedavi|fiyat|lütfen|teşekkür)\b/i;
const SPANISH = /[¿¡ñ]|\b(cuánto|cuanto|cuesta|quiero|puedo|hola|tratamiento|gracias|precio|cómo|como puedo)\b/i;
const INDONESIAN = /\b(berapa|bisakah|apakah|saya|kamu|anda|tolong|biaya|halo|terima kasih|bagaimana|kenapa|mengapa|untuk|dengan|yang|tidak)\b/i;

// ===== PART 2: Language guessing function =====
export function guessLanguage(message: string): "ar" | "tr" | "es" | "id" | "en" {
  if (ARABIC.test(message)) return "ar";
  if (TURKISH_LETTERS.test(message) || TURKISH_WORDS.test(message)) return "tr";
  if (SPANISH.test(message)) return "es";
  if (INDONESIAN.test(message)) return "id";
  return "en";
}
