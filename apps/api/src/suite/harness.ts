/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/suite/harness.ts
 * TUJUAN  : Membungkus penjawab dan penulis ulang asli supaya suite bisa
 *           melihat apa yang diberikan ke model dan apa yang dikutip,
 *           sementara bot itu sendiri (pencarian, ekspansi halaman,
 *           pemeriksaan, riwayat, balasan tetap) berjalan sama persis seperti
 *           di server.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: catatan sementara (chunk, kutipan, token)
 *    2. Tipe: bot beserta pengambil catatan
 *    3. Catatan kosong
 *    4. Tipe: bahan yang dibutuhkan untuk membuat harness
 *    5. Pembuat harness
 *    6. Penjawab yang diawasi (mencatat chunk, kutipan, token)
 *    7. Penulis ulang yang diawasi (mencatat hasil rewrite)
 *    8. Bot asli dengan penjawab dan penulis ulang yang diawasi
 * KALAU DIMINTA MENGUBAH:
 *    - Mencatat hal baru dari tiap jawaban: tambah field di Probe lalu isi di
 *      watchedAnswerer (BAGIAN 6)
 * ============================================================================ */

/**
 * Wraps the real answer and rewrite steps so the suite can see what the model was given and what it cited,
 * while the bot itself (retrieval, page expansion, checks, history, fixed replies) runs exactly as in the server.
 */
import type { Answerer, AnswerResult, SmallTalker } from "../answer";
import type { Bot } from "../bot";
import { createHistoryStore } from "../history";
import { createLiveBot } from "../live/bot";
import type { Localizer } from "../i18n";
import type { RetrievedChunk, Retriever } from "../retrieval";
import type { Rewrite, Rewriter } from "../rewrite";

// ===== BAGIAN 1: Tipe: catatan sementara (chunk, kutipan, token) =====
export interface Probe {
  chunks: RetrievedChunk[];
  cited: string[];
  rewrite?: Rewrite;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

// ===== BAGIAN 2: Tipe: bot beserta pengambil catatan =====
export interface Harness {
  bot: Bot;
  /** What was recorded since the last call; the record is emptied. */
  take(): Probe;
}

// ===== BAGIAN 3: Catatan kosong =====
const empty = (): Probe => ({ chunks: [], cited: [], inputTokens: 0, outputTokens: 0, thinkingTokens: 0 });

// ===== BAGIAN 4: Tipe: bahan yang dibutuhkan untuk membuat harness =====
export interface HarnessOptions {
  retriever: Retriever;
  answerer: Answerer;
  rewriter: Rewriter;
  localizer?: Localizer;
  smallTalker?: SmallTalker;
  resultCount: number;
  expandPages: number;
}

// ===== BAGIAN 5: Pembuat harness =====
export function createHarness({ retriever, answerer, rewriter, localizer, smallTalker, resultCount, expandPages }: HarnessOptions): Harness {
  let probe = empty();

  // ===== BAGIAN 6: Penjawab yang diawasi (mencatat chunk, kutipan, token) =====
  const watchedAnswerer: Answerer = {
    async answer(question, chunks, ctx) {
      const r: AnswerResult = await answerer.answer(question, chunks, ctx);
      probe.chunks = chunks;
      probe.cited = r.usedChunks.map((c) => c.id);
      probe.inputTokens += r.inputTokens;
      probe.outputTokens += r.outputTokens;
      probe.thinkingTokens += r.thinkingTokens;
      return r;
    },
  };

  // ===== BAGIAN 7: Penulis ulang yang diawasi (mencatat hasil rewrite) =====
  const watchedRewriter: Rewriter = {
    async rewrite(message, history) {
      const rw = await rewriter.rewrite(message, history);
      probe.rewrite = rw;
      return rw;
    },
  };

  // ===== BAGIAN 8: Bot asli dengan penjawab dan penulis ulang yang diawasi =====
  const bot = createLiveBot({ retriever, answerer: watchedAnswerer, rewriter: watchedRewriter, ...(localizer ? { localizer } : {}), ...(smallTalker ? { smallTalker } : {}), history: createHistoryStore(), resultCount, expandPages, log: () => {} });
  return {
    bot,
    take() {
      const out = probe;
      probe = empty();
      return out;
    },
  };
}
