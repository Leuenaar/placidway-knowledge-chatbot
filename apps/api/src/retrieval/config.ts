/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/retrieval/config.ts
 * TUJUAN  : Pengaturan database untuk server API: alamat dan kunci rahasia
 *           Supabase, dengan pemeriksaan kesalahan umum (menempel kunci
 *           publishable) sebelum permintaan pertama. Juga jumlah potongan
 *           yang dikirim ke model dan jumlah halaman yang dibaca penuh.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Bentuk pengaturan dan jenis error
 *    2. Membaca dan memeriksa SUPABASE_URL dan SUPABASE_API_KEY
 *    3. Jumlah potongan ke model (RETRIEVE_COUNT)
 *    4. Jumlah halaman dibaca penuh (EXPAND_PAGES)
 * KALAU DIMINTA MENGUBAH:
 *    - Jumlah potongan bawaan ke model (8) (BAGIAN 3)
 *    - Jumlah halaman penuh bawaan (2) (BAGIAN 4)
 * ============================================================================ */

// ===== BAGIAN 1: Bentuk pengaturan dan jenis error =====
/**
 * Database settings for the API server. The server is the only thing that talks to the database, with a
 * secret key; the browser never does. The checks below catch the usual mistake (pasting the publishable key)
 * with a clear message before any request is made. Error messages never contain the key.
 */
export interface DbConfig {
  url: string;
  key: string;
}

export class RetrievalError extends Error {}

// ===== BAGIAN 2: Membaca dan memeriksa SUPABASE_URL dan SUPABASE_API_KEY =====
export function loadDbConfig(env: Record<string, string | undefined> = process.env): DbConfig {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_API_KEY;
  if (!url || !key) throw new RetrievalError("SUPABASE_URL and SUPABASE_API_KEY must both be set (see .env.api.example)");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new RetrievalError("SUPABASE_URL is not a valid URL");
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !local) throw new RetrievalError("SUPABASE_URL must start with https://");
  if (key.startsWith("sb_publishable_")) throw new RetrievalError("SUPABASE_API_KEY is a publishable key; the server needs a secret key (sb_secret_...)");
  if (key.startsWith("eyJ")) {
    // A legacy JWT key. Only the service_role one can read the tables, so refuse the anon one with a clear message.
    try {
      const role = (JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")) as { role?: string }).role;
      if (role && role !== "service_role") throw new RetrievalError(`SUPABASE_API_KEY has role "${role}", the server needs a secret (service_role) key`);
    } catch (e) {
      if (e instanceof RetrievalError) throw e;
    }
  }
  return { url: u.origin, key };
}

// ===== BAGIAN 3: Jumlah potongan ke model (RETRIEVE_COUNT) =====
export const DEFAULT_RETRIEVE_COUNT = 8;

/** How many chunks go to the answer step (setting RETRIEVE_COUNT, 1 to 20). More chunks catch a short price chunk that ranks low, but cost more tokens and time. */
export function loadRetrieveCount(env: Record<string, string | undefined> = process.env): number {
  const raw = env.RETRIEVE_COUNT?.trim();
  if (!raw) return DEFAULT_RETRIEVE_COUNT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new RetrievalError(`RETRIEVE_COUNT must be a whole number from 1 to 20, got "${raw}"`);
  return n;
}

// ===== BAGIAN 4: Jumlah halaman dibaca penuh (EXPAND_PAGES) =====
export const DEFAULT_EXPAND_PAGES = 2;

/** How many pages are sent in full next to the search hits (setting EXPAND_PAGES, 0 to 7; 0 = off). */
export function loadExpandPages(env: Record<string, string | undefined> = process.env): number {
  const raw = env.EXPAND_PAGES?.trim();
  if (!raw) return DEFAULT_EXPAND_PAGES;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 7) throw new RetrievalError(`EXPAND_PAGES must be a whole number from 0 to 7, got "${raw}"`);
  return n;
}
