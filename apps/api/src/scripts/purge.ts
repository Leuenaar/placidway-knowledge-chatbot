/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/scripts/purge.ts
 * TUJUAN  : Perintah `npm run purge`: menghapus catatan pertanyaan tak
 *           terjawab yang lebih tua dari 30 hari, sekali jalan, lalu menyebut
 *           jumlahnya. Server melakukan hal yang sama sendiri saat start dan
 *           sekali sehari.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor (alat yang dipakai skrip ini)
 *    2. Fungsi utama skrip
 *    3. Muat rahasia dari .env.api
 *    4. Hapus baris lama dan laporkan jumlahnya
 *    5. Jalankan fungsi utama
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah pesan hasil penghapusan (BAGIAN 4)
 * ============================================================================ */

// ===== BAGIAN 1: Impor (alat yang dipakai skrip ini) =====
/**
 * Deletes unanswered-questions rows older than 30 days, once, and says how many.
 *   npm run purge
 * (The server does the same by itself at start and once a day.) Reads .env.api at the repo root.
 */
import { resolve } from "node:path";
import { loadEnvFile } from "../env";
import { loadDbConfig } from "../retrieval";
import { purgeOld } from "../unanswered";

// ===== BAGIAN 2: Fungsi utama skrip =====
async function main(): Promise<void> {

  // ===== BAGIAN 3: Muat rahasia dari .env.api =====
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));
  try {

    // ===== BAGIAN 4: Hapus baris lama dan laporkan jumlahnya =====
    const n = await purgeOld({ db: loadDbConfig() });
    if (n === undefined) {
      console.error("PROBLEM: the purge did not work (see the message above)");
      process.exit(1);
    }
    console.log(`Deleted ${n} row(s) older than 30 days.`);
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ===== BAGIAN 5: Jalankan fungsi utama =====
void main();
