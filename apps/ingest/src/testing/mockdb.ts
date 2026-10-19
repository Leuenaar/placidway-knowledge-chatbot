/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/testing/mockdb.ts
 * TUJUAN  : Database palsu di memori untuk uji: meniru aturan tabel asli
 *           (foreign key, panjang teks, panjang vektor) tanpa jaringan.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Kunci palsu untuk uji
 *    2. Database palsu PostgREST
 * ============================================================================ */

import { checkConfig, Rest } from "../load/postgrest.js";

// ===== BAGIAN 1: Kunci palsu untuk uji =====
export const KEY = "sb_secret_TESTKEY_do_not_print";

// ===== BAGIAN 2: Database palsu PostgREST =====
/** A tiny in-memory stand-in for PostgREST that enforces the same rules as the real tables (foreign key, text length, vector shape). */
export function mockDb() {
  const tables: Record<string, Map<string, Record<string, unknown>>> = { pages: new Map(), chunks: new Map() };
  const requests: { method: string; url: string; headers: Record<string, string>; body?: string }[] = [];
  const keyOf: Record<string, string> = { pages: "page_no", chunks: "id" };
  const rowsFor = (table: string, query: URLSearchParams) =>
    [...tables[table]!.values()].filter((r) => {
      const pg = query.get("page_no");
      if (pg?.startsWith("eq.") && String(r.page_no) !== pg.slice(3)) return false;
      if (query.get("embedding") === "not.is.null" && !r.embedding) return false;
      return true;
    });

  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    const table = u.pathname.split("/").pop()!;
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    requests.push({ method: init?.method ?? "GET", url: String(input), headers, ...(init?.body ? { body: String(init.body) } : {}) });
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: extra });
    if (init?.method === "POST") {
      const col = u.searchParams.get("on_conflict")!;
      for (const row of JSON.parse(String(init.body)) as Record<string, unknown>[]) {
        if (table === "chunks") {
          if (!tables.pages!.has(String(row.page_no))) return json(409, { message: "violates foreign key" });
          const len = String(row.text).length;
          if (len < 40 || len > 1800) return json(400, { message: "chunks_text_check" });
          if (!/^\[(-?[\d.e-]+,){383}-?[\d.e-]+\]$/.test(String(row.embedding))) return json(400, { message: "bad vector" });
        }
        tables[table]!.set(String(row[col]), { ...tables[table]!.get(String(row[col])), ...row });
      }
      return new Response(null, { status: 201 });
    }
    if (init?.method === "DELETE") {
      const ids = u.searchParams.get("id")!.slice(4, -1).split(",");
      for (const id of ids) tables[table]!.delete(id);
      return new Response(null, { status: 204 });
    }
    const rows = rowsFor(table, u.searchParams);
    if (init && (init.headers as Record<string, string>).Prefer === "count=exact") return json(200, rows.slice(0, 1), { "content-range": rows.length ? `0-0/${rows.length}` : "*/0" });
    const cols = u.searchParams.get("select")!.split(",");
    return json(200, rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))));
  }) as typeof fetch;
  return { tables, requests, rest: new Rest(checkConfig("https://abc.supabase.co", KEY), fetchFn), keyOf };
}

