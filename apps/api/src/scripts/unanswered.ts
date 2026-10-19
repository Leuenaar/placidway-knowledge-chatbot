/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/scripts/unanswered.ts
 * TUJUAN  : Perintah `npm run unanswered`: menampilkan log pertanyaan yang
 *           tidak terjawab (terbaru dulu) beserta jumlah per alasan. Hanya
 *           membaca, tidak mengubah apa pun.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor (alat yang dipakai skrip ini)
 *    2. Fungsi utama skrip
 *    3. Muat rahasia dari .env.api
 *    4. Ambil baris terbaru dan hitung per alasan
 *    5. Cetak satu baris per catatan
 *    6. Jalankan fungsi utama
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah kolom yang tampil di daftar (BAGIAN 5)
 *    - Mengubah jumlah baris bawaan (50) (BAGIAN 4)
 * ============================================================================ */

// ===== BAGIAN 1: Impor (alat yang dipakai skrip ini) =====
/**
 * Shows the unanswered-questions log: the newest rows and the count per reason.
 *   npm run unanswered            newest 50
 *   npm run unanswered -- 200     newest 200 (at most 500)
 * Reads SUPABASE_URL and SUPABASE_API_KEY from .env.api at the repo root. Only reads.
 */
import { resolve } from "node:path";
import { loadEnvFile } from "../env";
import { loadDbConfig } from "../retrieval";
import { listRecent } from "../unanswered";

// ===== BAGIAN 2: Fungsi utama skrip =====
async function main(): Promise<void> {

  // ===== BAGIAN 3: Muat rahasia dari .env.api =====
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));
  const limit = Number(process.argv[2] ?? 50);
  try {

    // ===== BAGIAN 4: Ambil baris terbaru dan hitung per alasan =====
    const rows = await listRecent({ db: loadDbConfig() }, Number.isFinite(limit) ? limit : 50);
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    console.log(`${rows.length} row(s) shown. Per reason: ${[...counts].map(([k, v]) => `${k} ${v}`).join(", ") || "none"}\n`);

    // ===== BAGIAN 5: Cetak satu baris per catatan =====
    for (const r of rows) console.log(`${r.created_at.slice(0, 19).replace("T", " ")}  ${r.reason.padEnd(16)}  ${(r.session_id ?? "-").slice(0, 8)}  ${r.question}`);
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ===== BAGIAN 6: Jalankan fungsi utama =====
void main();
