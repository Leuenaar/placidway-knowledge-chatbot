/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/storage.ts
 * TUJUAN  : Obrolan yang diingat browser agar reload tidak menghapus layar
 *           dan pertanyaan lanjutan tetap nyambung. Disimpan di
 *           sessionStorage (milik tab ini, hilang saat tab ditutup). Obrolan
 *           krisis tidak pernah disimpan. Data yang dibaca kembali diperiksa;
 *           data rusak atau lama dibuang. Pertanyaan tanpa jawaban tidak
 *           dipulihkan.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Batas penyimpanan (kunci, jumlah pesan, ukuran)
 *    2. Tipe: antarmuka penyimpanan yang dipakai
 *    3. Pola UUID dan jenis balasan yang bukan konteks
 *    4. Mengambil sessionStorage dengan aman
 *    5. Menghapus obrolan tersimpan
 *    6. Memeriksa bentuk satu pesan yang dibaca kembali
 *    7. Pembantu: apakah ada balasan krisis
 *    8. Menyimpan obrolan (atau menghapus bila kosong atau krisis)
 *    9. Membaca obrolan tersimpan (null bila tidak bisa dipercaya)
 *    10. Menyusun riwayat yang dikirim bersama pertanyaan berikutnya
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah jumlah pesan atau ukuran yang disimpan: BAGIAN 1
 *    - Mengubah riwayat yang dikirim ke server: BAGIAN 10
 * ============================================================================ */

/**
 * The chat the browser remembers, so a reload does not wipe the screen and the bot can still follow a follow-up question.
 *
 * It lives in sessionStorage, not localStorage: it belongs to this tab and disappears when the tab is closed, so nobody who
 * uses the computer later can read it. Nothing is sent anywhere for this; the server keeps its own short history in memory.
 *
 * Rules:
 *  - A chat that contained a crisis reply is never kept (and is erased the moment one arrives).
 *  - Storage may be missing, full or blocked (private windows, strict settings). Every access is wrapped; the chat then works
 *    exactly as before, just without recovery after a reload.
 *  - What is read back is checked like any other outside data. A broken or old-format entry is thrown away.
 *  - A question without an answer (the page was reloaded while the bot was thinking) is not restored.
 */
import {
  MAX_HISTORY_ANSWER_LENGTH,
  MAX_HISTORY_ENTRIES,
  isChatResponse,
  type HistoryEntry,
} from "@pwbot/shared";
import type { ChatMessage } from "./types";

// ===== BAGIAN 1: Batas penyimpanan (kunci, jumlah pesan, ukuran) =====
export const STORAGE_KEY = "pwbot.chat.v1";
/** Messages kept on screen after a reload (a message is a question or an answer). */
export const MAX_STORED_MESSAGES = 30;
/** Upper bound for the stored text. Older messages are dropped until it fits. */
export const MAX_STORED_BYTES = 100_000;

// ===== BAGIAN 2: Tipe: antarmuka penyimpanan yang dipakai =====
/** The part of the Storage interface used here, so tests can pass a plain object. */
export interface TabStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedChat {
  sessionId: string;
  messages: ChatMessage[];
}

// ===== BAGIAN 3: Pola UUID dan jenis balasan yang bukan konteks =====
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Replies that are never part of the context sent to the bot: the server does not remember them either. */
const NOT_CONTEXT = new Set(["error", "rate_limited", "crisis"]);

// ===== BAGIAN 4: Mengambil sessionStorage dengan aman =====
function tabStorage(): TabStorage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

// ===== BAGIAN 5: Menghapus obrolan tersimpan =====
export function clearChat(store: TabStorage | null = tabStorage()): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear, or storage is blocked.
  }
}

// ===== BAGIAN 6: Memeriksa bentuk satu pesan yang dibaca kembali =====
function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.text !== "string" || m.text.length > 20_000) return false;
  if (m.lead !== undefined && m.lead !== "done" && m.lead !== "declined") return false;
  if (m.role === "user") return m.response === undefined && m.lead === undefined;
  return m.role === "assistant" && (m.response === undefined || isChatResponse(m.response));
}

// ===== BAGIAN 7: Pembantu: apakah ada balasan krisis =====
const hasCrisis = (messages: ChatMessage[]) => messages.some((m) => m.response?.kind === "crisis");

// ===== BAGIAN 8: Menyimpan obrolan (atau menghapus bila kosong atau krisis) =====
/** Saves the chat, or erases the saved one when there is nothing worth keeping (empty, or it contains a crisis reply). */
export function saveChat(sessionId: string, messages: ChatMessage[], store: TabStorage | null = tabStorage()): void {
  if (!store) return;
  try {
    if (messages.length === 0 || hasCrisis(messages)) {
      store.removeItem(STORAGE_KEY);
      return;
    }
    let kept = messages.slice(-MAX_STORED_MESSAGES);
    let text = JSON.stringify({ v: 1, sessionId, messages: kept });
    while (text.length > MAX_STORED_BYTES && kept.length > 2) {
      kept = kept.slice(2);
      text = JSON.stringify({ v: 1, sessionId, messages: kept });
    }
    if (text.length > MAX_STORED_BYTES) {
      store.removeItem(STORAGE_KEY);
      return;
    }
    store.setItem(STORAGE_KEY, text);
  } catch {
    // Full or blocked: the chat keeps working without recovery.
  }
}

// ===== BAGIAN 9: Membaca obrolan tersimpan (null bila tidak bisa dipercaya) =====
/** The saved chat, or null when there is none or it cannot be trusted. */
export function loadChat(store: TabStorage | null = tabStorage()): SavedChat | null {
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) throw new Error("shape");
    const d = data as Record<string, unknown>;
    if (d.v !== 1 || typeof d.sessionId !== "string" || !UUID.test(d.sessionId) || !Array.isArray(d.messages)) throw new Error("shape");
    if (d.messages.length > MAX_STORED_MESSAGES || !d.messages.every(isMessage)) throw new Error("shape");
    let messages = d.messages as ChatMessage[];
    if (hasCrisis(messages)) throw new Error("crisis");
    // A question the bot never answered is dropped.
    if (messages[messages.length - 1]?.role === "user") messages = messages.slice(0, -1);
    if (messages.length === 0) throw new Error("empty");
    return { sessionId: d.sessionId, messages };
  } catch {
    clearChat(store);
    return null;
  }
}

// ===== BAGIAN 10: Menyusun riwayat yang dikirim bersama pertanyaan berikutnya =====
/**
 * The earlier exchanges to send with the next question, oldest first: complete question + answer pairs only, no failed or crisis
 * replies, the last MAX_HISTORY_ENTRIES / 2 pairs, long answers cut. The question being sent now is not part of it.
 */
export function buildHistory(messages: ChatMessage[]): HistoryEntry[] {
  const pairs: HistoryEntry[][] = [];
  for (let i = 0; i + 1 < messages.length; i++) {
    const q = messages[i]!;
    const a = messages[i + 1]!;
    if (q.role !== "user" || a.role !== "assistant" || !a.response || NOT_CONTEXT.has(a.response.kind)) continue;
    if (!q.text.trim() || !a.text.trim()) continue;
    pairs.push([
      { role: "visitor", text: q.text },
      { role: "assistant", text: a.text.length > MAX_HISTORY_ANSWER_LENGTH ? a.text.slice(0, MAX_HISTORY_ANSWER_LENGTH) : a.text },
    ]);
  }
  return pairs.slice(-(MAX_HISTORY_ENTRIES / 2)).flat();
}
