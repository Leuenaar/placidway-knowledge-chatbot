/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/bot.ts
 * TUJUAN  : Kontrak sederhana sebuah bot: apa yang harus bisa dilakukan bot
 *           (reply, limited). Bot mock dan bot live sama-sama memenuhinya,
 *           jadi jalur di app.ts tidak pernah berubah.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Bentuk hasil dan kontrak bot
 * ============================================================================ */

/** What the HTTP layer needs from a bot. The mock bot and the live bot both fit it, so the routes never change. */
import type { ChatResponse, HistoryEntry } from "@pwbot/shared";
import type { LimitReason } from "./limits";

// ===== BAGIAN 1: Bentuk hasil dan kontrak bot =====
export interface BotResult {
  status: number;
  body: ChatResponse;
}

export interface Bot {
  /** `earlier` is what the browser remembers of the chat; the bot uses it only if it has no history of its own for the session. */
  reply(sessionId: string, message: string, earlier?: HistoryEntry[]): BotResult | Promise<BotResult>;
  /**
   * The reply for a message that was refused by a limit. Optional: without it the HTTP layer sends an English text.
   * It must never call the model, because it runs exactly when the server may not spend anything.
   */
  limited?(sessionId: string, message: string, reason: LimitReason): BotResult | Promise<BotResult>;
}
