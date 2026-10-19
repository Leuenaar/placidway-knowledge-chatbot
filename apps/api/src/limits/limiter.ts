/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/limits/limiter.ts
 * PURPOSE : Limits that keep the paid model calls under control, all in
 *           memory. Four limits in order: the daily token budget, the daily
 *           limit per address, the burst limit per address, and parallel
 *           chats. Crisis messages pass the limits (with a small limit of
 *           their own) because a visitor must always get the crisis text. A
 *           network address is only used as a key hashed with a random salt.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type of the refusal reason and the limit options
 *    2. Limiter contract
 *    3. Default crisis constants and limits
 *    4. Limiter builder: hashed key, time window, UTC day
 *    5. admit: check the four limits in order, and the crisis path
 *    6. addTokens and stats: count the tokens used
 * IF ASKED TO CHANGE:
 *    - The order or rule of the four limits (PART 5)
 *    - Limit on crisis messages (5 per window, 200 per day) (PART 3)
 *    - Wait delay when busy (10 seconds) (PART 3)
 * ============================================================================ */

/**
 * Limits that keep the paid model calls under control. Everything lives in memory: a restart empties it, which is why the real hard stop is the
 * spend limit set in the Anthropic Console (see the README). Visitors are told apart by their network address, but the address is only used as a
 * key: it is hashed with a random salt that exists only in this process, it is never written to the database or to a log, and entries expire.
 *
 * Four limits, checked in this order:
 *  1. budget: all tokens the model API reported today (UTC), over every visitor
 *  2. daily: messages per visitor address per UTC day
 *  3. burst: messages per visitor address in a sliding window
 *  4. busy: chats being answered right now
 * A message that looks like a crisis message skips all four, because the visitor must always get the crisis text. That bypass has its own small caps
 * (per address and per day over all visitors) so it cannot be used to drain the budget.
 */
import { createHash, randomBytes } from "node:crypto";

// ===== PART 1: Type of the refusal reason and the limit options =====
export type LimitReason = "burst" | "daily" | "budget" | "busy";

export type Admission = { ok: true; release: () => void } | { ok: false; reason: LimitReason; retryAfterSec: number };

export interface LimiterOptions {
  /** Messages allowed per address inside windowMs. */
  perWindow: number;
  windowMs: number;
  /** Messages allowed per address per UTC day. */
  perDay: number;
  /** Tokens (input + output, including reasoning) allowed per UTC day over all visitors. */
  dailyTokens: number;
  /** Chats answered at the same time. */
  maxConcurrent: number;
  /** Crisis messages that skip the limits: per address inside windowMs, and per UTC day over all visitors. */
  crisisPerWindow?: number;
  crisisPerDay?: number;
  /** Most addresses kept in memory; the least recently seen is dropped first. */
  maxKeys?: number;
  now?: () => number;
  salt?: string;
}

// ===== PART 2: Limiter contract =====
export interface Limiter {
  admit(address: string | undefined, options?: { crisis?: boolean }): Admission;
  /** Adds tokens the model API reported for one call. */
  addTokens(tokens: number): void;
  /** Numbers for tests and startup checks. Never contains an address. */
  stats(): { day: string; tokens: number; inFlight: number; keys: number; crisisToday: number };
}

interface Entry {
  times: number[];
  crisisTimes: number[];
  day: string;
  dayCount: number;
}

// ===== PART 3: Default crisis constants and limits =====
const DAY_MS = 86_400_000;
const BUSY_RETRY_SEC = 10;

export const DEFAULT_CRISIS_PER_WINDOW = 5;
export const DEFAULT_CRISIS_PER_DAY = 200;

// ===== PART 4: Limiter builder: hashed key, time window, UTC day =====
export function createLimiter(options: LimiterOptions): Limiter {
  const { perWindow, windowMs, perDay, dailyTokens, maxConcurrent } = options;
  const crisisPerWindow = options.crisisPerWindow ?? DEFAULT_CRISIS_PER_WINDOW;
  const crisisPerDay = options.crisisPerDay ?? DEFAULT_CRISIS_PER_DAY;
  const maxKeys = options.maxKeys ?? 20_000;
  const now = options.now ?? Date.now;
  const salt = options.salt ?? randomBytes(16).toString("hex");

  const entries = new Map<string, Entry>();
  let day = dayOf(now());
  let tokens = 0;
  let crisisToday = 0;
  let inFlight = 0;
  let calls = 0;

  function dayOf(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }
  function secondsToMidnight(ms: number): number {
    return Math.max(1, Math.ceil((DAY_MS - (ms % DAY_MS)) / 1000));
  }
  function rollDay(ms: number): void {
    const d = dayOf(ms);
    if (d !== day) {
      day = d;
      tokens = 0;
      crisisToday = 0;
    }
  }
  function keyOf(address: string | undefined): string {
    return createHash("sha256").update(salt).update(address ?? "unknown").digest("hex").slice(0, 16);
  }
  function entryFor(key: string, ms: number): Entry {
    let e = entries.get(key);
    if (e) {
      // Re-insert so the Map order is "least recently seen first".
      entries.delete(key);
    } else {
      e = { times: [], crisisTimes: [], day, dayCount: 0 };
    }
    entries.set(key, e);
    e.times = e.times.filter((t) => ms - t < windowMs);
    e.crisisTimes = e.crisisTimes.filter((t) => ms - t < windowMs);
    if (e.day !== day) {
      e.day = day;
      e.dayCount = 0;
    }
    while (entries.size > maxKeys) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
    return e;
  }
  function sweep(ms: number): void {
    for (const [k, e] of entries) {
      const idle = e.times.every((t) => ms - t >= windowMs) && e.crisisTimes.every((t) => ms - t >= windowMs);
      if (idle && e.day !== day) entries.delete(k);
    }
  }
  function releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      inFlight = Math.max(0, inFlight - 1);
    };
  }

  return {

    // ===== PART 5: admit: check the four limits in order, and the crisis path =====
    admit(address, opts = {}) {
      const ms = now();
      rollDay(ms);
      if (++calls % 500 === 0) sweep(ms);
      const e = entryFor(keyOf(address), ms);

      if (opts.crisis) {
        if (e.crisisTimes.length < crisisPerWindow && crisisToday < crisisPerDay) {
          e.crisisTimes.push(ms);
          crisisToday++;
          return { ok: true, release: () => {} };
        }
        // Too many "crisis" messages from one address, or too many today: treated like any other message from here on.
      }

      if (tokens >= dailyTokens) return { ok: false, reason: "budget", retryAfterSec: secondsToMidnight(ms) };
      if (e.dayCount >= perDay) return { ok: false, reason: "daily", retryAfterSec: secondsToMidnight(ms) };
      if (e.times.length >= perWindow) {
        const oldest = e.times[0] ?? ms;
        return { ok: false, reason: "burst", retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - ms) / 1000)) };
      }
      if (inFlight >= maxConcurrent) return { ok: false, reason: "busy", retryAfterSec: BUSY_RETRY_SEC };

      e.times.push(ms);
      e.dayCount++;
      inFlight++;
      return { ok: true, release: releaser() };
    },

    // ===== PART 6: addTokens and stats: count the tokens used =====
    addTokens(n) {
      if (!Number.isFinite(n) || n <= 0) return;
      rollDay(now());
      tokens += n;
    },

    stats() {
      rollDay(now());
      return { day, tokens, inFlight, keys: entries.size, crisisToday };
    },
  };
}
