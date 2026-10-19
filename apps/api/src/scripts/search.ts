/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/scripts/search.ts
 * TUJUAN  : Perintah `npm run search -w @pwbot/api -- "pertanyaan"`: mencoba
 *           pencarian saja (tanpa model jawaban) ke database asli. Pertanyaan
 *           yang sama dijalankan dua kali: pertama termasuk memuat model,
 *           kedua menunjukkan kecepatan normal beserta 10 hasil teratas.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor (alat yang dipakai skrip ini)
 *    2. Fungsi utama skrip
 *    3. Baca pertanyaan dari baris perintah
 *    4. Muat rahasia dari .env.api
 *    5. Siapkan pencari
 *    6. Cari dua kali dan cetak 10 hasil teratas pada putaran kedua
 *    7. Jalankan fungsi utama
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah jumlah hasil yang ditampilkan atau lebar teks potongan
 *      (BAGIAN 6)
 * ============================================================================ */

// ===== BAGIAN 1: Impor (alat yang dipakai skrip ini) =====
/**
 * Try retrieval by hand, against the real database and the real embedding model.
 *   npm run search -w @pwbot/api -- "How much does the treatment cost?"
 * It runs the same question twice: the first run includes loading the model, the second shows the normal speed.
 * Reads SUPABASE_URL and SUPABASE_API_KEY from .env.api at the repo root. Writes nothing.
 */
import { resolve } from "node:path";
import { createE5Embedder } from "@pwbot/embed";
import { loadEnvFile } from "../env";
import { createRetriever, loadDbConfig, RetrievalError } from "../retrieval";

// ===== BAGIAN 2: Fungsi utama skrip =====
async function main(): Promise<void> {

  // ===== BAGIAN 3: Baca pertanyaan dari baris perintah =====
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('usage: npm run search -w @pwbot/api -- "your question"');
    process.exit(2);
  }

  // ===== BAGIAN 4: Muat rahasia dari .env.api =====
  // npm runs this from apps/api, so the repo root is two folders up.
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));

  // ===== BAGIAN 5: Siapkan pencari =====
  let retriever;
  try {
    retriever = createRetriever({ db: loadDbConfig(), embedder: createE5Embedder() });
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  try {

    // ===== BAGIAN 6: Cari dua kali dan cetak 10 hasil teratas pada putaran kedua =====
    for (const run of ["first run (loads the model)", "second run (normal speed)"]) {
      const t0 = Date.now();
      const hits = await retriever.search(question, 10);
      const ms = Date.now() - t0;
      console.log(`\n${run}: ${ms} ms`);
      if (run.startsWith("second")) {
        for (const [i, h] of hits.entries()) {
          console.log(`${i + 1}. ${h.id.padEnd(16)} ${h.similarity.toFixed(4)}  ${h.text.replace(/\s+/g, " ").slice(0, 90)}`);
        }
      }
    }
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof RetrievalError ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ===== BAGIAN 7: Jalankan fungsi utama =====
void main();
