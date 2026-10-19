/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/unanswered/mask.ts
 * TUJUAN  : Menghapus data pribadi yang paling jelas (email, nomor telepon,
 *           deret angka panjang) dari pesan sebelum disimpan di log. Ini
 *           jaring, bukan jaminan: nama dan cerita kesehatan tidak dihapus.
 *           Nominal dolar tetap karena justru pertanyaan seperti 'katanya
 *           $50' yang ingin dilihat.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Pola email, telepon, angka panjang
 *    2. Fungsi penyamaran
 *    3. Teks akhir yang disimpan (maks 500 karakter)
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah pola yang disamarkan (BAGIAN 1)
 * ============================================================================ */

// ===== BAGIAN 1: Pola email, telepon, angka panjang =====
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

// ===== BAGIAN 2: Fungsi penyamaran =====
export function maskPersonalData(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(PHONE_LIKE, (m) => (m.replace(/\D/g, "").length >= 7 ? "[number]" : m))
    .replace(LONG_DIGITS, "[number]")
    .replace(/\s+/g, " ")
    .trim();
}

// ===== BAGIAN 3: Teks akhir yang disimpan (maks 500 karakter) =====
/** What is stored: masked, at most 500 characters (the column limit). Empty when nothing useful is left. */
export function questionForLog(message: string): string {
  const masked = maskPersonalData(message);
  return masked.length > MAX_QUESTION_LENGTH ? masked.slice(0, MAX_QUESTION_LENGTH) : masked;
}
