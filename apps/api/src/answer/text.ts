/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/answer/text.ts
 * TUJUAN  : Pembersih teks sebelum ditempel ke dalam tag prompt, dan
 *           pemformat riwayat percakapan (pesan panjang dipotong supaya tidak
 *           menyingkirkan potongan halaman).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Menghapus tag palsu dari teks
 *    2. Format riwayat percakapan (potong 600 karakter)
 * KALAU DIMINTA MENGUBAH:
 *    - Panjang maksimum satu pesan riwayat (MAX_TURN_CHARS) (BAGIAN 2)
 * ============================================================================ */

import type { Turn } from "../history";

// ===== BAGIAN 1: Menghapus tag palsu dari teks =====
/** Remove anything that could close or fake our own tags from text we paste inside them. */
export function neutralize(text: string): string {
  return text.replace(/<\/?\s*(excerpts?|question|conversation|turn|reply_language|message|reminder|care_note)\b[^>]*>/gi, "");
}

// ===== BAGIAN 2: Format riwayat percakapan (potong 600 karakter) =====
const MAX_TURN_CHARS = 600;

/** The recent conversation as tagged text. Long messages are cut, so history can never crowd out the excerpts. */
export function formatConversation(history: Turn[]): string {
  if (history.length === 0) return "";
  const turns = history
    .map((t) => `<turn role="${t.role}">${neutralize(t.text.length > MAX_TURN_CHARS ? `${t.text.slice(0, MAX_TURN_CHARS)}...` : t.text)}</turn>`)
    .join("\n");
  return `<conversation>\n${turns}\n</conversation>`;
}
