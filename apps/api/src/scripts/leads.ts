/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/scripts/leads.ts
 * TUJUAN  : Perintah `npm run leads`: menampilkan daftar kontak (nama dan
 *           email) dari pengunjung yang setuju dihubungi untuk penawaran,
 *           yang terbaru dulu. Dengan `-- purge` menghapus kontak yang lebih
 *           tua dari 90 hari. Ini data pribadi, hanya dicetak di terminal
 *           pemilik.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor (alat yang dipakai skrip ini)
 *    2. Fungsi utama skrip
 *    3. Muat rahasia dari .env.api
 *    4. Mode purge: hapus kontak lama sekarang
 *    5. Mode daftar: tampilkan kontak terbaru
 *    6. Jalankan fungsi utama
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah format baris kontak yang tampil (BAGIAN 5)
 *    - Mengubah lama penyimpanan kontak (90 hari): lihat LEAD_RETENTION_DAYS
 *      di leads/store.ts dan fungsi purge di db/migrations/004_leads.sql
 *      (BAGIAN 4)
 * ============================================================================ */

// ===== BAGIAN 1: Impor (alat yang dipakai skrip ini) =====
/**
 * Shows the leads (name and email left by visitors who agreed to be contacted about a quote), newest first.
 *   npm run leads            newest 50
 *   npm run leads -- 200     newest 200 (at most 500)
 *   npm run leads -- purge   delete leads older than 90 days now (the server also does this once a day)
 * Reads SUPABASE_URL and SUPABASE_API_KEY from .env.api at the repo root. This is personal data: it is printed only in your own terminal.
 */
import { resolve } from "node:path";
import { loadEnvFile } from "../env";
import { LEAD_RETENTION_DAYS, listLeads, purgeOldLeads } from "../leads";
import { loadDbConfig } from "../retrieval";

// ===== BAGIAN 2: Fungsi utama skrip =====
async function main(): Promise<void> {

  // ===== BAGIAN 3: Muat rahasia dari .env.api =====
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));
  try {
    const db = loadDbConfig();

    // ===== BAGIAN 4: Mode purge: hapus kontak lama sekarang =====
    if (process.argv[2] === "purge") {
      const n = await purgeOldLeads({ db });
      if (n === undefined) {
        console.error("PROBLEM: the purge did not work (see the message above). Has migration 004 been run?");
        process.exit(1);
      }
      console.log(`Deleted ${n} lead(s) older than ${LEAD_RETENTION_DAYS} days.`);
      return;
    }

    // ===== BAGIAN 5: Mode daftar: tampilkan kontak terbaru =====
    const limit = Number(process.argv[2] ?? 50);
    const rows = await listLeads({ db }, Number.isFinite(limit) ? limit : 50);
    console.log(`${rows.length} lead(s) shown.\n`);
    for (const r of rows) console.log(`${r.created_at.slice(0, 19).replace("T", " ")}  ${(r.language ?? "-").padEnd(3)}  ${r.name}  <${r.email}>  (consent ${r.consent_version})`);
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)} (has migration 004 been run?)`);
    process.exit(1);
  }
}

// ===== BAGIAN 6: Jalankan fungsi utama =====
void main();
