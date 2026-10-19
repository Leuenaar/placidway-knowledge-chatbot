/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/leads/store.ts
 * TUJUAN  : Tempat lead disimpan (N4): nama dan email yang sengaja
 *           ditinggalkan pengunjung. Yang disimpan hanya nama, email, bahasa,
 *           versi persetujuan, waktu. Nama atau email tidak pernah masuk log,
 *           pesan error, atau prompt model. Baris lebih dari 90 hari dihapus
 *           oleh fungsi database purge_old_leads.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Batas waktu dan interval
 *    2. Bentuk data lead dan kontrak penyimpanan
 *    3. Penyimpanan ke Supabase (PostgREST)
 *    4. Penyimpanan di memori untuk mode mock dan tes
 *    5. Hapus lead lebih dari 90 hari
 *    6. Jadwal hapus: saat start lalu tiap hari
 *    7. Daftar lead terbaru untuk npm run leads
 * KALAU DIMINTA MENGUBAH:
 *    - Lama simpan lead (LEAD_RETENTION_DAYS harus sama dengan migration 004)
 *      (BAGIAN 1)
 *    - Batas waktu menulis ke database (5 detik) (BAGIAN 1)
 * ============================================================================ */

/**
 * Where leads are kept (nice-to-have N4): the name and email a visitor chose to leave to be contacted about a quote.
 *
 * What is stored: name, email, the chat language, the version of the consent text they ticked, and the time. Nothing else: no chat
 * text, no session id, no IP address. Rows older than 90 days are deleted by the database function purge_old_leads (migration 004),
 * which the server calls at start and then once a day. The table is readable only with the server's secret key.
 *
 * Privacy rule for this whole folder: a name or an email never goes into a log line, an error message or a model prompt.
 */
import type { DbConfig } from "../retrieval";

// ===== BAGIAN 1: Batas waktu dan interval =====
export const LEAD_RETENTION_DAYS = 90;
const WRITE_TIMEOUT_MS = 5000;
const PURGE_TIMEOUT_MS = 10_000;
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ===== BAGIAN 2: Bentuk data lead dan kontrak penyimpanan =====
export interface NewLead {
  name: string;
  email: string;
  language?: string | undefined;
  consentVersion: string;
}

export interface LeadRow {
  id: number;
  name: string;
  email: string;
  language: string | null;
  consent_version: string;
  created_at: string;
}

export interface LeadStore {
  /** True when the lead was saved. Never throws. */
  add(lead: NewLead): Promise<boolean>;
}

interface Options {
  db: DbConfig;
  fetchFn?: typeof fetch;
  log?: (message: string) => void;
}

// ===== BAGIAN 3: Penyimpanan ke Supabase (PostgREST) =====
export function createLeadStore({ db, fetchFn = fetch, log = (m) => console.error(m) }: Options): LeadStore {
  return {
    async add({ name, email, language, consentVersion }) {
      try {
        const res = await fetchFn(`${db.url}/rest/v1/leads`, {
          method: "POST",
          headers: { apikey: db.key, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ name, email, language: language ?? null, consent_version: consentVersion }),
          signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
        });
        if (!res.ok) {
          log(`[leads] could not save a lead: HTTP ${res.status}`);
          return false;
        }
        return true;
      } catch (e) {
        log(`[leads] could not save a lead (${e instanceof Error ? e.name : "error"})`);
        return false;
      }
    },
  };
}

// ===== BAGIAN 4: Penyimpanan di memori untuk mode mock dan tes =====
/** For the mock mode and tests: leads are kept in memory and gone when the process ends. */
export function createMemoryLeadStore(): LeadStore & { rows: NewLead[] } {
  const rows: NewLead[] = [];
  return {
    rows,
    async add(lead) {
      rows.push({ ...lead });
      return true;
    },
  };
}

// ===== BAGIAN 5: Hapus lead lebih dari 90 hari =====
/** Deletes leads older than 90 days. Returns how many, or undefined when it failed. */
export async function purgeOldLeads({ db, fetchFn = fetch, log = (m) => console.error(m) }: Options): Promise<number | undefined> {
  try {
    const res = await fetchFn(`${db.url}/rest/v1/rpc/purge_old_leads`, {
      method: "POST",
      headers: { apikey: db.key, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      log(`[leads] purge failed: HTTP ${res.status}`);
      return undefined;
    }
    const n = Number(await res.json().catch(() => undefined));
    return Number.isInteger(n) ? n : undefined;
  } catch (e) {
    log(`[leads] purge failed (${e instanceof Error ? e.name : "error"})`);
    return undefined;
  }
}

// ===== BAGIAN 6: Jadwal hapus: saat start lalu tiap hari =====
/** Purge now and then every day. The timer does not keep the process alive. Returns a function that stops it. */
export function startLeadPurgeSchedule(options: Options, intervalMs = PURGE_INTERVAL_MS): () => void {
  const run = async () => {
    const n = await purgeOldLeads(options);
    if (n !== undefined && n > 0) (options.log ?? console.error)(`[leads] purged ${n} lead(s) older than ${LEAD_RETENTION_DAYS} days`);
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

// ===== BAGIAN 7: Daftar lead terbaru untuk npm run leads =====
/** The newest leads, for the `npm run leads` command (the owner reads them in their own terminal). */
export async function listLeads({ db, fetchFn = fetch }: Options, limit = 50): Promise<LeadRow[]> {
  const res = await fetchFn(`${db.url}/rest/v1/leads?select=id,name,email,language,consent_version,created_at&order=created_at.desc&limit=${Math.min(500, Math.max(1, Math.trunc(limit)))}`, {
    headers: { apikey: db.key },
    signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Could not read the leads: HTTP ${res.status}`);
  return (await res.json()) as LeadRow[];
}
