/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/storage.ts
 * PURPOSE : The chat the browser remembers, so a reload does not clear the
 *           screen and follow-up questions still connect. Saved in
 *           sessionStorage (belongs to this tab, gone when the tab is closed).
 *           A crisis chat is never saved. Data read back is checked; broken or
 *           old data is dropped. A question without an answer is not restored.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Storage limits (key, number of messages, size)
 *    2. Type: the storage interface that is used
 *    3. UUID pattern and the reply kinds that are not context
 *    4. Get sessionStorage safely
 *    5. Delete the saved chat
 *    6. Check the shape of one message read back
 *    7. Helper: whether there is a crisis reply
 *    8. Save the chat (or delete it if it is empty or a crisis)
 *    9. Read the saved chat (null if it cannot be trusted)
 *    10. Build the history that is sent with the next question
 * IF ASKED TO CHANGE:
 *    - Change the number of messages or the size that is stored: PART 1
 *    - Change the history sent to the server: PART 10
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

// ===== PART 1: Storage limits (key, number of messages, size) =====
export const STORAGE_KEY = "pwbot.chat.v1";
/** Messages kept on screen after a reload (a message is a question or an answer). */
export const MAX_STORED_MESSAGES = 30;
/** Upper bound for the stored text. Older messages are dropped until it fits. */
export const MAX_STORED_BYTES = 100_000;

// ===== PART 2: Type: the storage interface that is used =====
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

// ===== PART 3: UUID pattern and the reply kinds that are not context =====
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Replies that are never part of the context sent to the bot: the server does not remember them either. */
const NOT_CONTEXT = new Set(["error", "rate_limited", "crisis"]);

// ===== PART 4: Get sessionStorage safely =====
function tabStorage(): TabStorage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

// ===== PART 5: Delete the saved chat =====
export function clearChat(store: TabStorage | null = tabStorage()): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear, or storage is blocked.
  }
}

// ===== PART 6: Check the shape of one message read back =====
function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.text !== "string" || m.text.length > 20_000) return false;
  if (m.lead !== undefined && m.lead !== "done" && m.lead !== "declined") return false;
  if (m.role === "user") return m.response === undefined && m.lead === undefined;
  return m.role === "assistant" && (m.response === undefined || isChatResponse(m.response));
}

// ===== PART 7: Helper: whether there is a crisis reply =====
const hasCrisis = (messages: ChatMessage[]) => messages.some((m) => m.response?.kind === "crisis");

// ===== PART 8: Save the chat (or delete it if it is empty or a crisis) =====
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

// ===== PART 9: Read the saved chat (null if it cannot be trusted) =====
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

// ===== PART 10: Build the history that is sent with the next question =====
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
