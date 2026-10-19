/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/scripts/suite.ts
 * TUJUAN  : Perintah `npm run suite`: menjalankan semua kasus uji (8
 *           pertanyaan resmi, jebakan tambahan, 5 bahasa) ke database dan
 *           model asli, lalu menulis laporan lengkap ke suite-report.md.
 *           Pilihan: --efforts, --runs, --only, --lang, --out. Setiap kasus
 *           memakai sekitar 3 panggilan model berbayar (kecil). Tidak menulis
 *           ke database.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor (alat yang dipakai skrip ini)
 *    2. Pembantu: baca pilihan --nama nilai dari baris perintah
 *    3. Muat rahasia dan konfigurasi model
 *    4. Pilihan --efforts dan --runs (dicek, salah ketik berhenti di sini)
 *    5. Pilihan --only, --lang dan --out (memilih kasus yang dijalankan)
 *    6. Siapkan pencari, jumlah chunk dan system prompt
 *    7. Siapkan penulis ulang, penerjemah teks tetap dan pengobrol santai
 *    8. Pemanasan model embedding
 *    9. Jalankan semua kasus (satu per satu)
 *    10. Cetak ringkasan dan tulis laporan markdown
 *    11. Jalankan fungsi utama
 * KALAU DIMINTA MENGUBAH:
 *    - Menjalankan hanya satu kasus: npm run suite -- --only en-8 (BAGIAN 5)
 *    - Menguji beberapa tingkat usaha model: --efforts low,medium,high
 *      (BAGIAN 4)
 *    - Mengubah nama file laporan: --out nama.md (BAGIAN 5)
 * ============================================================================ */

// ===== BAGIAN 1: Impor (alat yang dipakai skrip ini) =====
/**
 * Runs the test suite against the real database and the real models.
 *   npm run suite
 *   npm run suite -- --efforts low,medium,high --runs 3
 *   npm run suite -- --only en-1,en-8 --lang en,tr --out my-report.md
 * Prints one line per case and a summary, and writes the full answers to suite-report.md at the repo root.
 * It makes real (small) paid model calls: about 3 per case. Writes nothing to the database. Reads .env.api.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createE5Embedder } from "@pwbot/embed";
import { EFFORT_LEVELS, PROMPT_VERSION, buildSystemPrompt, createAnswerer, createSmallTalker, createAnthropicClient, loadAnthropicConfig, loadRules, withEffort, type Effort } from "../answer";
import { loadEnvFile } from "../env";
import { createLocalizer } from "../i18n";
import { createRetriever, loadDbConfig, loadExpandPages, loadRetrieveCount } from "../retrieval";
import { createRewriter } from "../rewrite";
import { CASES } from "../suite/cases";
import { createHarness } from "../suite/harness";
import { markdownReport, lineFor, summarize, summaryTable } from "../suite/report";
import { runSuite } from "../suite/run";

// ===== BAGIAN 2: Pembantu: baca pilihan --nama nilai dari baris perintah =====
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {

  // ===== BAGIAN 3: Muat rahasia dan konfigurasi model =====
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));
  const cfg = (() => {
    try {
      return loadAnthropicConfig();
    } catch (e) {
      console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  })();

  // ===== BAGIAN 4: Pilihan --efforts dan --runs (dicek, salah ketik berhenti di sini) =====
  const efforts = (arg("efforts") ?? cfg.effort ?? "default").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const e of efforts) {
    if (e !== "default" && !(EFFORT_LEVELS as readonly string[]).includes(e)) {
      console.error(`PROBLEM: --efforts must list ${EFFORT_LEVELS.join(", ")} or default (got "${e}")`);
      process.exit(2);
    }
  }
  const runs = Number(arg("runs") ?? 1);
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    console.error("PROBLEM: --runs must be a whole number from 1 to 10");
    process.exit(2);
  }

  // ===== BAGIAN 5: Pilihan --only, --lang dan --out (memilih kasus yang dijalankan) =====
  const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const langs = arg("lang")?.split(",").map((s) => s.trim()).filter(Boolean);
  const cases = CASES.filter((c) => (!only || only.some((o) => c.id.includes(o))) && (!langs || langs.includes(c.lang)));
  if (cases.length === 0) {
    console.error("PROBLEM: no case matches --only / --lang");
    process.exit(2);
  }
  const out = resolve(process.cwd(), "../..", arg("out") ?? "suite-report.md");

  // ===== BAGIAN 6: Siapkan pencari, jumlah chunk dan system prompt =====
  let retriever, resultCount, expandPages, systemPrompt;
  try {
    retriever = createRetriever({ db: loadDbConfig(), embedder: createE5Embedder() });
    resultCount = loadRetrieveCount();
    expandPages = loadExpandPages();
    systemPrompt = buildSystemPrompt(loadRules());
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  // ===== BAGIAN 7: Siapkan penulis ulang, penerjemah teks tetap dan pengobrol santai =====
  const rewriter = createRewriter(createAnthropicClient(withEffort(cfg, cfg.rewriteEffort), { timeoutMs: 12_000 }), () => {});

  const rewriteClient = createAnthropicClient(withEffort(cfg, cfg.rewriteEffort), { timeoutMs: 12_000 });
  const localizer = createLocalizer({ client: rewriteClient, log: () => {} });
  const smallTalker = createSmallTalker(rewriteClient);

  // ===== BAGIAN 8: Pemanasan model embedding =====
  console.log(`Loading the embedding model and checking the database...`);
  await retriever.search("warm up", 1);
  console.log(`Running ${cases.length} cases x ${efforts.length} effort(s) x ${runs} run(s) = ${cases.length * efforts.length * runs} conversations. Model ${cfg.model}, prompt ${PROMPT_VERSION}.\n`);

  // ===== BAGIAN 9: Jalankan semua kasus (satu per satu) =====
  const results = await runSuite({
    efforts,
    runs,
    cases,
    makeHarness: (effort) =>
      createHarness({
        retriever,
        rewriter,
        localizer,
        smallTalker,
        answerer: createAnswerer(createAnthropicClient(withEffort(cfg, effort === "default" ? undefined : (effort as Effort))), systemPrompt),
        resultCount,
        expandPages,
      }),
    onResult: (r, i, n) => console.log(lineFor(r, i, n)),
  });

  // ===== BAGIAN 10: Cetak ringkasan dan tulis laporan markdown =====
  console.log(`\n${summaryTable(summarize(results))}\n`);
  const report = markdownReport({ when: new Date().toISOString(), model: cfg.model, retrieveCount: resultCount, expandPages, efforts, runsPerCase: runs, promptVersion: PROMPT_VERSION }, results);
  writeFileSync(out, report, "utf8");
  console.log(`Full answers written to ${out}`);
}

// ===== BAGIAN 11: Jalankan fungsi utama =====
void main();
