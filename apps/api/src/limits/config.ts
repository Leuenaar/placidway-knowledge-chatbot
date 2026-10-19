/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/limits/config.ts
 * PURPOSE : Read the usage limit settings from the environment. All are
 *           optional; a wrong value stops the server at start with a clear
 *           message.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Default limit values (15 per 10 minutes, 100 per day, 5 million
 *       tokens, 8 parallel chats)
 *    2. Reader for whole numbers with a lower and an upper bound
 *    3. Read all the limit settings and TRUST_PROXY
 * IF ASKED TO CHANGE:
 *    - Default values for the usage limits (PART 1)
 *    - Names of the settings variables in .env.api (PART 3)
 * ============================================================================ */

/** Reads the limit settings from the environment. Every setting is optional; a wrong value stops the server at startup with a plain message. */
import { DEFAULT_CRISIS_PER_DAY, DEFAULT_CRISIS_PER_WINDOW, type LimiterOptions } from "./limiter";

// ===== PART 1: Default limit values (15 per 10 minutes, 100 per day, 5 million tokens, 8 parallel chats) =====
export const LIMIT_DEFAULTS = {
  perWindow: 15,
  windowMs: 10 * 60_000,
  perDay: 100,
  dailyTokens: 5_000_000,
  maxConcurrent: 8,
} as const;

export interface LimitsConfig extends LimiterOptions {
  /** How many proxies sit in front of the server (nginx = 1). 0: the address that connects is the visitor. */
  trustProxy: number;
}

// ===== PART 2: Reader for whole numbers with a lower and an upper bound =====
function intSetting(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max} (got "${raw}")`);
  return n;
}

// ===== PART 3: Read all the limit settings and TRUST_PROXY =====
export function loadLimitsConfig(env: Record<string, string | undefined> = process.env): LimitsConfig {
  return {
    perWindow: intSetting(env, "RATE_LIMIT_PER_10_MIN", LIMIT_DEFAULTS.perWindow, 1, 1000),
    windowMs: LIMIT_DEFAULTS.windowMs,
    perDay: intSetting(env, "RATE_LIMIT_PER_DAY", LIMIT_DEFAULTS.perDay, 1, 100_000),
    dailyTokens: intSetting(env, "DAILY_TOKEN_BUDGET", LIMIT_DEFAULTS.dailyTokens, 1000, 2_000_000_000),
    maxConcurrent: intSetting(env, "MAX_CONCURRENT_CHATS", LIMIT_DEFAULTS.maxConcurrent, 1, 1000),
    crisisPerWindow: DEFAULT_CRISIS_PER_WINDOW,
    crisisPerDay: DEFAULT_CRISIS_PER_DAY,
    trustProxy: intSetting(env, "TRUST_PROXY", 0, 0, 10),
  };
}
