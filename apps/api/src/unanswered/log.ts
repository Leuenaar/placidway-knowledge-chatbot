/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/unanswered/log.ts
 * PURPOSE : Log of unanswered questions (N5): questions the bot could not
 *           answer, to find gaps in the content. What is stored: the message
 *           with clear personal data masked, the reason, a random session id,
 *           the time. No IP. Rows older than 30 days are deleted. Writing the
 *           log must never slow down or break the chat.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Logged reasons and constants
 *    2. Shape of the data and the contract
 *    3. Log writer: send to Supabase, a failure is only noted
 *    4. Delete rows older than 30 days
 *    5. Deletion schedule: at start, then every day
 *    6. List of the newest entries for npm run unanswered
 * IF ASKED TO CHANGE:
 *    - Which reasons are logged (REASONS, must match the constraint in
 *      migration 001) (PART 1)
 *    - Keep for 30 days (also in migration 001) (PART 5)
 * ============================================================================ */

/**
 * The unanswered-questions log (nice-to-have N5): questions the bot could not answer, to find gaps in the content.
 *
 * What is stored: the visitor's message with obvious personal data masked, the reason, the session id (a random id made by the
 * browser, not a person) and the time. No IP address. Rows older than 30 days are deleted by the database function
 * purge_old_unanswered_questions (migration 001), which the server calls at start and then once a day.
 *
 * Writing the log must never slow down or break a chat: record() returns at once, a failed write is only noted in the server log
 * (without the question), and nothing is retried.
 */
import type { DbConfig } from "../retrieval";
import { questionForLog } from "./mask";

// ===== PART 1: Logged reasons and constants =====
export const REASONS = ["not_in_content", "price_not_listed", "out_of_scope", "medical_declined"] as const;
export type Reason = (typeof REASONS)[number];

const WRITE_TIMEOUT_MS = 2000;
const PURGE_TIMEOUT_MS = 10_000;
export const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ===== PART 2: Shape of the data and the contract =====
export interface UnansweredLog {
  /** Fire and forget. Never throws and never rejects. */
  record(entry: { question: string; reason: Reason; sessionId: string }): Promise<void>;
}

export interface UnansweredRow {
  id: number;
  question: string;
  reason: Reason;
  session_id: string | null;
  created_at: string;
}

interface Options {
  db: DbConfig;
  fetchFn?: typeof fetch;
  log?: (message: string) => void;
}

// ===== PART 3: Log writer: send to Supabase, a failure is only noted =====
export function createUnansweredLog({ db, fetchFn = fetch, log = (m) => console.error(m) }: Options): UnansweredLog {
  return {
    async record({ question, reason, sessionId }) {
      try {
        const text = questionForLog(question);
        if (!text) return;
        const res = await fetchFn(`${db.url}/rest/v1/unanswered_questions`, {
          method: "POST",
          headers: { apikey: db.key, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ question: text, reason, session_id: sessionId }),
          signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
        });
        if (!res.ok) log(`[unanswered] could not write the log: HTTP ${res.status}`);
      } catch (e) {
        log(`[unanswered] could not write the log (${e instanceof Error ? e.name : "error"})`);
      }
    },
  };
}

// ===== PART 4: Delete rows older than 30 days =====
/** Deletes rows older than 30 days. Returns how many were deleted, or undefined when it failed (the reason goes to the log). */
export async function purgeOld({ db, fetchFn = fetch, log = (m) => console.error(m) }: Options): Promise<number | undefined> {
  try {
    const res = await fetchFn(`${db.url}/rest/v1/rpc/purge_old_unanswered_questions`, {
      method: "POST",
      headers: { apikey: db.key, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      log(`[unanswered] purge failed: HTTP ${res.status}`);
      return undefined;
    }
    const n = Number(await res.json().catch(() => undefined));
    return Number.isInteger(n) ? n : undefined;
  } catch (e) {
    log(`[unanswered] purge failed (${e instanceof Error ? e.name : "error"})`);
    return undefined;
  }
}

// ===== PART 5: Deletion schedule: at start, then every day =====
/** Purge now and then every day. The timer does not keep the process alive. Returns a function that stops it. */
export function startPurgeSchedule(options: Options, intervalMs = PURGE_INTERVAL_MS): () => void {
  const run = async () => {
    const n = await purgeOld(options);
    if (n !== undefined && n > 0) (options.log ?? console.error)(`[unanswered] purged ${n} row(s) older than 30 days`);
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

// ===== PART 6: List of the newest entries for npm run unanswered =====
/** The newest rows, for the `npm run unanswered` command. */
export async function listRecent({ db, fetchFn = fetch }: Options, limit = 50): Promise<UnansweredRow[]> {
  const res = await fetchFn(`${db.url}/rest/v1/unanswered_questions?select=id,question,reason,session_id,created_at&order=created_at.desc&limit=${Math.min(500, Math.max(1, Math.trunc(limit)))}`, {
    headers: { apikey: db.key },
    signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Could not read the log: HTTP ${res.status}`);
  return (await res.json()) as UnansweredRow[];
}
