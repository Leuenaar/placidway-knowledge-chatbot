/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/retrieval/amounts.ts
 * TUJUAN  : Mendeteksi nominal dolar di teks bebas dalam format angka apa pun
 *           ($18,995, 18.995 USD, angka Arab). Dipakai pencarian nominal
 *           persis dan oleh suite uji.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Normalisasi angka (digit Arab dan Persia, pemisah ribuan)
 *    2. Mengambil nominal dolar dari teks
 *    3. Cara nominal ditulis di halaman (1000 dan 1,000)
 *    4. Cek apakah teks memuat nominal tertentu
 * ============================================================================ */

// ===== BAGIAN 1: Normalisasi angka (digit Arab dan Persia, pemisah ribuan) =====
/**
 * Dollar amounts written in free text, in any number format. Shared by the exact-match lookup (what the visitor wrote)
 * and by the test suite (what the answer wrote).
 */
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Digits in any script become 0-9; a separator followed by exactly three digits (a thousands separator) is removed. */
export function normalizeNumbers(text: string): string {
  const ascii = text.replace(/[٠-٩۰-۹]/g, (d) => String(Math.max(ARABIC_DIGITS.indexOf(d), PERSIAN_DIGITS.indexOf(d))));
  return ascii.replace(/(?<=\d)[.,٫٬   ](?=\d{3}(?!\d))/g, "");
}

// ===== BAGIAN 2: Mengambil nominal dolar dari teks =====
/** Dollar amounts written in the text, as digit strings: "$18,995", "$ 18.995", "18995 USD", "USD 30,000", "50 dolares". */
export function dollarAmounts(text: string): string[] {
  const t = normalizeNumbers(text);
  const out: string[] = [];
  for (const m of t.matchAll(/\$\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?(?:USD|US\$|dollars?|dolar|dólares|دولار)|USD\s?(\d+(?:\.\d+)?)/gi)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out.filter(Boolean);
}

// ===== BAGIAN 3: Cara nominal ditulis di halaman (1000 dan 1,000) =====
/** The ways an amount is written in the page text: "1000" and "1,000". */
export function writtenForms(amount: string): string[] {
  const n = Number(amount);
  const forms = [amount];
  if (Number.isInteger(n) && n >= 1000) forms.push(n.toLocaleString("en-US"));
  return forms;
}

// ===== BAGIAN 4: Cek apakah teks memuat nominal tertentu =====
/** True when the text contains the amount written with a dollar sign, as a whole number ("$50" yes, "$500" and "$50,000" no). */
export function mentionsDollarAmount(text: string, amount: string): boolean {
  return writtenForms(amount).some((form) => new RegExp(`\\$\\s?${form.replace(/[.,]/g, (c) => `\\${c}`)}(?!\\d|,\\d)`).test(text));
}
