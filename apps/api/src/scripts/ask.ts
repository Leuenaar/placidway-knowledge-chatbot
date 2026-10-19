/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/scripts/ask.ts
 * TUJUAN  : Perintah `npm run ask -- "pertanyaan"`: menanyakan satu
 *           pertanyaan dari awal sampai akhir ke database asli, model
 *           embedding asli dan model jawaban asli. Mencetak jawaban, link
 *           sumber, chunk yang dipakai dan waktu tiap langkah. Tidak menulis
 *           apa pun. Cocok untuk mencoba satu pertanyaan dari komputer
 *           sendiri.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor (alat yang dipakai skrip ini)
 *    2. Fungsi utama skrip
 *    3. Baca pertanyaan dari baris perintah
 *    4. Muat rahasia dari .env.api
 *    5. Siapkan pencari, penjawab dan penulis ulang (error konfigurasi berhenti di sini)
 *    6. Jalankan: rewrite, cari, jawab, lalu ukur waktu tiap langkah
 *    7. Cetak hasil: jawaban, sumber, chunk, waktu
 *    8. Jalankan fungsi utama
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah cara hasil dicetak ke layar (BAGIAN 7)
 *    - Mengubah pengaturan model yang dipakai untuk uji coba satu pertanyaan
 *      (BAGIAN 5)
 *    - Mengubah pesan bila pertanyaan kosong (BAGIAN 3)
 * ============================================================================ */

// ===== BAGIAN 1: Impor (alat yang dipakai skrip ini) =====
/**
 * Ask one question end to end, against the real database, the real embedding model and the real answer model.
 *   npm run ask -- "How much does the treatment cost?"
 * Prints the answer, the source links, and what each step took. Writes nothing. Reads .env.api at the repo root.
 */
import { resolve } from "node:path";
import { createE5Embedder } from "@pwbot/embed";
import { AnswerError, DEFAULT_RULES_DIR, PROMPT_VERSION, buildSystemPrompt, createAnswerer, createAnthropicClient, loadAnthropicConfig, loadRules, withEffort } from "../answer";
import { loadEnvFile } from "../env";
import { RetrievalError, createRetriever, gatherChunks, loadDbConfig, loadExpandPages, loadRetrieveCount } from "../retrieval";
import { createRewriter } from "../rewrite";

// ===== BAGIAN 2: Fungsi utama skrip =====
async function main(): Promise<void> {

  // ===== BAGIAN 3: Baca pertanyaan dari baris perintah =====
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('usage: npm run ask -- "your question"');
    process.exit(2);
  }

  // ===== BAGIAN 4: Muat rahasia dari .env.api =====
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));

  // ===== BAGIAN 5: Siapkan pencari, penjawab dan penulis ulang (error konfigurasi berhenti di sini) =====
  let retriever, answerer, rewriter, model, effort, rewriteEffort, count = 0, expand = 0;
  try {
    const cfg = loadAnthropicConfig();
    model = cfg.model;
    count = loadRetrieveCount();
    expand = loadExpandPages();
    effort = cfg.effort ?? "API default";
    retriever = createRetriever({ db: loadDbConfig(), embedder: createE5Embedder() });
    answerer = createAnswerer(createAnthropicClient(cfg), buildSystemPrompt(loadRules()));
    rewriteEffort = cfg.rewriteEffort ?? "API default";
    rewriter = createRewriter(createAnthropicClient(withEffort(cfg, cfg.rewriteEffort), { timeoutMs: 12_000 }));
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  try {

    // ===== BAGIAN 6: Jalankan: rewrite, cari, jawab, lalu ukur waktu tiap langkah =====
    // Warm the embedding model first so the timings below show the normal speed, not the one-time model load.
    await retriever.search("warm up", 1);
    const t0 = Date.now();
    const rw = await rewriter.rewrite(question, []);
    const t1 = Date.now();
    const chunks = await gatherChunks(retriever, rw.query, { resultCount: count, expandPages: expand, visitorMessage: question, log: console.error });
    const t2 = Date.now();
    const result = await answerer.answer(question, chunks, { language: rw.language, history: [] });
    const t3 = Date.now();

    // ===== BAGIAN 7: Cetak hasil: jawaban, sumber, chunk, waktu =====
    console.log(`\nQuestion: ${question}\n`);
    console.log(`Rewrite:  language=${rw.language} category=${rw.category}${rw.fallback ? " (FALLBACK: model step failed, own words used)" : ""}\n          query="${rw.query}"`);
    console.log(`Kind:     ${result.kind}${result.ungrounded ? "  (UNGROUNDED: no valid chunk cited)" : ""}`);
    console.log(`Answer:   ${result.answer || "(none)"}\n`);
    console.log("Sources:");
    for (const s of result.sources) console.log(`  - ${s.title}\n    ${s.url}`);
    if (result.sources.length === 0) console.log("  (none)");
    const ranked = chunks.filter((c) => c.similarity > 0);
    console.log(`\nChunks sent:  ${chunks.length} (${ranked.length} from the search: ${ranked.map((c) => `${c.id} ${c.similarity.toFixed(3)}`).join(", ")}; the rest are whole-page context)`);
    console.log(`Chunks cited: ${result.usedChunks.map((c) => c.id).join(", ") || "(none)"}`);
    console.log(`Time: rewrite ${t1 - t0} ms, search ${t2 - t1} ms, answer ${t3 - t2} ms. Tokens: ${result.inputTokens} in, ${result.outputTokens} out (${result.thinkingTokens} of them internal reasoning). Model: ${model}, answer effort: ${effort}, rewrite effort: ${rewriteEffort}, chunks: ${count}, full pages added: ${expand}. Prompt ${PROMPT_VERSION}, rules from ${DEFAULT_RULES_DIR}`);
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof RetrievalError || e instanceof AnswerError ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ===== BAGIAN 8: Jalankan fungsi utama =====
void main();
