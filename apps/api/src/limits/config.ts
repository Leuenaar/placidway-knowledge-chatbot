/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/limits/config.ts
 * TUJUAN  : Membaca pengaturan batas pemakaian dari environment. Semua
 *           opsional; nilai salah menghentikan server saat start dengan pesan
 *           jelas.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Nilai bawaan batas (15 per 10 menit, 100 per hari, 5 juta token, 8 chat paralel)
 *    2. Pembaca angka bulat dengan batas bawah dan atas
 *    3. Membaca semua pengaturan batas dan TRUST_PROXY
 * KALAU DIMINTA MENGUBAH:
 *    - Angka bawaan batas pemakaian (BAGIAN 1)
 *    - Nama variabel pengaturan di .env.api (BAGIAN 3)
 * ============================================================================ */

/** Reads the limit settings from the environment. Every setting is optional; a wrong value stops the server at startup with a plain message. */
import { DEFAULT_CRISIS_PER_DAY, DEFAULT_CRISIS_PER_WINDOW, type LimiterOptions } from "./limiter";

// ===== BAGIAN 1: Nilai bawaan batas (15 per 10 menit, 100 per hari, 5 juta token, 8 chat paralel) =====
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

// ===== BAGIAN 2: Pembaca angka bulat dengan batas bawah dan atas =====
function intSetting(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max} (got "${raw}")`);
  return n;
}

// ===== BAGIAN 3: Membaca semua pengaturan batas dan TRUST_PROXY =====
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
