/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/limits/guess.ts
 * TUJUAN  : Tebakan kasar dan gratis bahasa pesan (dari huruf dan kata umum)
 *           di antara lima bahasa. Hanya untuk pesan batas pemakaian yang
 *           tidak boleh memanggil model. Kalau ragu, Inggris.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Pola huruf dan kata umum per bahasa
 *    2. Fungsi penebak bahasa
 * ============================================================================ */

// ===== BAGIAN 1: Pola huruf dan kata umum per bahasa =====
/**
 * A rough, free guess of which of the five supported languages a message is written in. Used only for the limit messages, which must not call
 * the model. It looks at the script and a few very common words; when unsure it says English.
 */
const ARABIC = /[؀-ۿ]/;
const TURKISH_LETTERS = /[ğışİŞĞ]/;
const TURKISH_WORDS = /\b(ne kadar|nasıl|merhaba|tedavi|fiyat|lütfen|teşekkür)\b/i;
const SPANISH = /[¿¡ñ]|\b(cuánto|cuanto|cuesta|quiero|puedo|hola|tratamiento|gracias|precio|cómo|como puedo)\b/i;
const INDONESIAN = /\b(berapa|bisakah|apakah|saya|kamu|anda|tolong|biaya|halo|terima kasih|bagaimana|kenapa|mengapa|untuk|dengan|yang|tidak)\b/i;

// ===== BAGIAN 2: Fungsi penebak bahasa =====
export function guessLanguage(message: string): "ar" | "tr" | "es" | "id" | "en" {
  if (ARABIC.test(message)) return "ar";
  if (TURKISH_LETTERS.test(message) || TURKISH_WORDS.test(message)) return "tr";
  if (SPANISH.test(message)) return "es";
  if (INDONESIAN.test(message)) return "id";
  return "en";
}
