/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/suite/harness.ts
 * PURPOSE : Wraps the real answerer and rewriter so the suite can see what is
 *           given to the model and what is quoted, while the bot itself
 *           (search, page expansion, checks, history, fixed replies) runs
 *           exactly as it does on the server.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type: temporary notes (chunks, quotes, tokens)
 *    2. Type: the bot together with the note taker
 *    3. Empty note
 *    4. Type: what is needed to build the harness
 *    5. Harness builder
 *    6. Supervised answerer (records chunks, quotes, tokens)
 *    7. Supervised rewriter (records the rewrite result)
 *    8. The real bot with a supervised answerer and rewriter
 * IF ASKED TO CHANGE:
 *    - Record something new from each answer: add a field in Probe, then fill
 *      it in watchedAnswerer (PART 6)
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

// ===== PART 1: Type: temporary notes (chunks, quotes, tokens) =====
export interface Probe {
  chunks: RetrievedChunk[];
  cited: string[];
  rewrite?: Rewrite;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

// ===== PART 2: Type: the bot together with the note taker =====
export interface Harness {
  bot: Bot;
  /** What was recorded since the last call; the record is emptied. */
  take(): Probe;
}

// ===== PART 3: Empty note =====
const empty = (): Probe => ({ chunks: [], cited: [], inputTokens: 0, outputTokens: 0, thinkingTokens: 0 });

// ===== PART 4: Type: what is needed to build the harness =====
export interface HarnessOptions {
  retriever: Retriever;
  answerer: Answerer;
  rewriter: Rewriter;
  localizer?: Localizer;
  smallTalker?: SmallTalker;
  resultCount: number;
  expandPages: number;
}

// ===== PART 5: Harness builder =====
export function createHarness({ retriever, answerer, rewriter, localizer, smallTalker, resultCount, expandPages }: HarnessOptions): Harness {
  let probe = empty();

  // ===== PART 6: Supervised answerer (records chunks, quotes, tokens) =====
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

  // ===== PART 7: Supervised rewriter (records the rewrite result) =====
  const watchedRewriter: Rewriter = {
    async rewrite(message, history) {
      const rw = await rewriter.rewrite(message, history);
      probe.rewrite = rw;
      return rw;
    },
  };

  // ===== PART 8: The real bot with a supervised answerer and rewriter =====
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
