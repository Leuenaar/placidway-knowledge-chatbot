/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/load/postgrest.ts
 * TUJUAN  : Klien kecil untuk REST Supabase (PostgREST) hanya dengan fetch.
 *           Alat ingest hanya butuh empat hal: upsert baris, baca satu kolom,
 *           hapus per id, hitung baris. Kunci hanya dikirim di header apikey
 *           dan tidak pernah dicetak.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: fetch dan konfigurasi database
 *    2. Kelas error database
 *    3. Id aman (hanya huruf, angka, _ dan -)
 *    4. Memeriksa URL dan kunci (tolak http, kunci publishable, JWT bukan service)
 *    5. Klien Rest: upsert, baca, hapus, hitung
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah pemeriksaan kunci atau URL Supabase (BAGIAN 4)
 * ============================================================================ */

// ===== BAGIAN 1: Tipe: fetch dan konfigurasi database =====
/**
 * A very small client for Supabase's REST layer (PostgREST), using only fetch. The ingest tool needs four things:
 * upsert rows, read a column, delete by id, and count rows. The key is sent in the `apikey` header only, as the
 * Supabase docs require for the new secret keys, and is never printed or put into an error message.
 */
export type FetchFn = typeof fetch;

export interface DbConfig {
  url: string;
  key: string;
}

// ===== BAGIAN 2: Kelas error database =====
export class DbError extends Error {}

// ===== BAGIAN 3: Id aman (hanya huruf, angka, _ dan -) =====
/** The id characters the chunker produces. Anything else is refused before it can reach a URL. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

// ===== BAGIAN 4: Memeriksa URL dan kunci (tolak http, kunci publishable, JWT bukan service) =====
export function checkConfig(url: string | undefined, key: string | undefined): DbConfig {
  if (!url || !key) throw new DbError("SUPABASE_URL and SUPABASE_INGEST_KEY must both be set (see apps/ingest/README.md)");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new DbError("SUPABASE_URL is not a valid URL");
  }
  if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") throw new DbError("SUPABASE_URL must start with https://");
  if (key.startsWith("sb_publishable_")) throw new DbError("SUPABASE_INGEST_KEY is a publishable key; ingest needs a secret key (sb_secret_...)");
  if (key.startsWith("eyJ")) {
    // A legacy JWT key: refuse the anon one, it cannot write and would only mean the wrong key was pasted.
    try {
      const role = (JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")) as { role?: string }).role;
      if (role && role !== "service_role") throw new DbError(`SUPABASE_INGEST_KEY has role "${role}", ingest needs a secret (service_role) key`);
    } catch (e) {
      if (e instanceof DbError) throw e;
    }
  }
  return { url: u.origin, key };
}

// ===== BAGIAN 5: Klien Rest: upsert, baca, hapus, hitung =====
export class Rest {
  constructor(
    private readonly cfg: DbConfig,
    private readonly doFetch: FetchFn = fetch,
  ) {}

  private async call(method: string, path: string, init: { body?: unknown; prefer?: string; range?: string } = {}): Promise<Response> {
    const headers: Record<string, string> = { apikey: this.cfg.key };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.prefer) headers.Prefer = init.prefer;
    if (init.range) headers.Range = init.range;
    let res: Response;
    try {
      res = await this.doFetch(`${this.cfg.url}/rest/v1/${path}`, { method, headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
    } catch (e) {
      throw new DbError(`${method} ${path.split("?")[0]}: network error (${e instanceof Error ? e.message : String(e)})`);
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      throw new DbError(`${method} ${path.split("?")[0]}: HTTP ${res.status} ${text}`);
    }
    return res;
  }

  /** Insert rows, or update them when the conflict column already has the value. */
  async upsert(table: string, rows: object[], onConflict: string): Promise<void> {
    if (rows.length === 0) return;
    await this.call("POST", `${table}?on_conflict=${onConflict}`, { body: rows, prefer: "resolution=merge-duplicates,return=minimal" });
  }

  async selectColumn(table: string, column: string, filter: string): Promise<string[]> {
    const res = await this.call("GET", `${table}?select=${column}&${filter}&limit=10000`);
    return ((await res.json()) as Record<string, string>[]).map((r) => r[column]!);
  }

  /** Read several columns. Used for the page hashes and the (id, text_hash) pairs Refresh compares. */
  async selectRows<T extends Record<string, unknown>>(table: string, select: string, filter = ""): Promise<T[]> {
    const res = await this.call("GET", `${table}?select=${select}${filter ? `&${filter}` : ""}&limit=10000`);
    return (await res.json()) as T[];
  }

  async deleteIds(table: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) if (!SAFE_ID.test(id)) throw new DbError(`refusing to delete unsafe id "${id}"`);
    await this.call("DELETE", `${table}?id=in.(${ids.join(",")})`, { prefer: "return=minimal" });
  }

  /** Exact row count for a filter, read from the Content-Range header. */
  async count(table: string, filter: string): Promise<number> {
    const res = await this.call("GET", `${table}?select=id${filter ? `&${filter}` : ""}`, { prefer: "count=exact", range: "0-0" });
    const total = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "");
    if (!total) throw new DbError(`${table}: no row count in the response`);
    return Number(total[1]);
  }
}
