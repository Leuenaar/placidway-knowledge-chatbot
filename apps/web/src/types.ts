/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/types.ts
 * TUJUAN  : Tipe yang hanya dipakai di web: satu pesan obrolan dan hasil
 *           kartu kontak. Kontrak API sendiri ada di packages/shared.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Tipe: satu pesan obrolan
 *    3. Tipe: hasil kartu kontak (terkirim atau ditolak)
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/** Types used only inside the web app. The API contract itself lives in @pwbot/shared. */
import type { ChatResponse } from "@pwbot/shared";

// ===== BAGIAN 2: Tipe: satu pesan obrolan =====
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Present for assistant messages that came from the API (not for the local greeting). */
  response?: ChatResponse;
  /** What became of the contact card offered with this reply: sent, or declined. Never holds the visitor's name or email. */
  lead?: LeadOutcome;
}

// ===== BAGIAN 3: Tipe: hasil kartu kontak (terkirim atau ditolak) =====
export type LeadOutcome = "done" | "declined";
