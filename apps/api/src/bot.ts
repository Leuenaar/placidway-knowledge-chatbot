/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/bot.ts
 * PURPOSE : The simple contract of a bot: what a bot must be able to do
 *           (reply, limited). The mock bot and the live bot both meet it, so
 *           the routes in app.ts never change.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Shape of the result and the bot contract
 * ============================================================================ */

/** What the HTTP layer needs from a bot. The mock bot and the live bot both fit it, so the routes never change. */
import type { ChatResponse, HistoryEntry } from "@pwbot/shared";
import type { LimitReason } from "./limits";

// ===== PART 1: Shape of the result and the bot contract =====
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
