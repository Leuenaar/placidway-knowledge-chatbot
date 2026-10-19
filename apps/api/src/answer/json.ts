/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/answer/json.ts
 * TUJUAN  : Mengambil objek JSON dari balasan model, walaupun model
 *           membungkusnya dengan pagar kode atau kalimat tambahan.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Pengambil JSON dari teks balasan
 * ============================================================================ */

import { AnswerError } from "./config";

// ===== BAGIAN 1: Pengambil JSON dari teks balasan =====
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
