/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/crisis.ts
 * TUJUAN  : Lapisan kedua deteksi krisis: daftar frasa jelas dalam lima
 *           bahasa (Inggris, Indonesia, Turki, Spanyol, Arab). Lapisan
 *           pertama adalah kategori crisis dari langkah rewrite (model).
 *           Salah satu lapisan cukup untuk memicu balasan krisis.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Normalisasi teks (huruf kecil, tanpa aksen) sebelum dicocokkan
 *    2. Daftar frasa krisis per bahasa
 *    3. Fungsi pemeriksa: true kalau pesan terlihat krisis
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah frasa krisis baru atau bahasa baru (BAGIAN 2)
 * ============================================================================ */

// ===== BAGIAN 1: Normalisasi teks (huruf kecil, tanpa aksen) sebelum dicocokkan =====
/**
 * Second layer of crisis detection. The first layer is the "crisis" category from the rewrite step (a model); this one is a plain list
 * of clear phrases in five languages, so a message like "I want to kill myself" is caught even when the model misreads it.
 * Either layer is enough. The list is deliberately narrow: intent to harm oneself or not wanting to live. Fear about an illness
 * ("I'm scared of dying from this cancer") is distress, not crisis, and stays on the normal path.
 *
 * It will not catch every wording and it only knows these five languages. That limit is documented in the Build Journal.
 */
/** Lower case, no accents, Turkish dotless i as i, Arabic marks removed and alef variants unified, so one pattern covers typing variants. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .replace(/[آأإ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

// ===== BAGIAN 2: Daftar frasa krisis per bahasa =====
const PATTERNS: RegExp[] = [
  // English
  /\bkill(ing)? (myself|my self)\b/,
  /\bend(ing)? (my|this) (own )?life\b/,
  /\btake my own life\b/,
  /\bsuicid/,
  /\b(want|wanna|going|ready) to die\b/,
  /\b(don'?t|do not|dont) want to (live|be alive|be here|exist)\b/,
  /\bbetter off dead\b/,
  /\b(hurt|harm|cut) (myself|my self)\b/,
  /\bself[- ]?harm/,
  // Indonesian / Malay
  /\bbunuh diri\b/,
  /\b(mau|ingin|pengen|pingin|pengin) (mati|bunuh diri|mengakhiri hidup)\b/,
  /\b(mengakhiri|akhiri) hidup\b/,
  /\b(tidak|nggak|ngga|gak|enggak|ga) (mau|ingin|pengen) (hidup|ada lagi|lagi hidup)\b/,
  /\b(menyakiti|melukai|nyakitin) diri/,
  // Turkish
  /\bintihar/,
  /\bolmek istiyorum\b/,
  /\byasamak istemiyorum\b/,
  /\bkendimi (oldur|bitir)/,
  /\bhayatima son\b/,
  /\bkendime zarar\b/,
  // Spanish
  /\bsuicid/,
  /\bquiero (morir|morirme)\b/,
  /\bno quiero (vivir|seguir viviendo|estar aqui)\b/,
  /\b(quitarme|acabar con) (la|mi) vida\b/,
  /\bmatarme\b/,
  /\b(hacerme dano|lastimarme|hacerme mal)\b/,
  // Arabic
  /انتحار/,
  /(انتحر|اقتل نفسي|انهي حياتي)/,
  /اريد ان اموت/,
  /لا اريد ان اعيش/,
  /اريد ان اؤذي نفسي/,
];

// ===== BAGIAN 3: Fungsi pemeriksa: true kalau pesan terlihat krisis =====
export function looksLikeCrisis(message: string): boolean {
  const text = normalizeForMatch(message);
  return PATTERNS.some((p) => p.test(text));
}
