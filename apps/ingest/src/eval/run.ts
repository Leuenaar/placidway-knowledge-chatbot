/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/eval/run.ts
 * PURPOSE : Test the search quality without a database: each question is
 *           ranked by cosine against all chunks, then we see at which rank the
 *           correct chunk appears, per language.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type: one test question together with the expected chunk
 *    2. The chunk that counts as correct for a price question
 *    3. Type: result of one question
 *    4. Type: evaluation summary
 *    5. Read the question set
 *    6. Run the evaluation: rank of the correct chunk
 *    7. Build the evaluation report
 * IF ASKED TO CHANGE:
 *    - Add an evaluation question: edit apps/ingest/eval/questions.json (PART
 *      5)
 * ============================================================================ */

import { readFileSync } from "node:fs";
import { cosine, type Embedder } from "@pwbot/embed";
import type { Chunk } from "../chunk/types.js";
import type { VectorFile } from "../embed/run.js";

// ===== PART 1: Type: one test question together with the expected chunk =====
export interface EvalQuestion {
  id: string;
  lang: string;
  q: string;
  /** Any one of these chunk ids is a correct answer. "PRICE" stands for the price and out-patient chunks (PRICE_IDS). */
  expect: string[];
}

// ===== PART 2: The chunk that counts as correct for a price question =====
/**
 * Chunks that correctly answer "how much does the out-patient program cost": the packages share one price, so any of them is fine.
 * P7-price-2 is left out on purpose: it holds averages for alternative medicine in general, not this program.
 */
export const PRICE_IDS = [
  "P1-faq-3", "P2-price-1", "P2-price-2", "P2-included-1", "P3-price-1", "P3-price-2", "P3-included-1",
  "P4-price-1", "P4-price-2", "P4-included-1", "P6-price-1",
];

// ===== PART 3: Type: result of one question =====
export interface EvalRow {
  id: string;
  lang: string;
  q: string;
  /** 1-based position of the first correct chunk in the ranking, or undefined when it is not in the top 10. */
  rank: number | undefined;
  top: string[];
}

// ===== PART 4: Type: evaluation summary =====
export interface EvalSummary {
  lang: string;
  n: number;
  hit1: number;
  hit3: number;
  hit5: number;
  mrr: number;
}

// ===== PART 5: Read the question set =====
export function readQuestions(path: string): EvalQuestion[] {
  return JSON.parse(readFileSync(path, "utf8")) as EvalQuestion[];
}

// ===== PART 6: Run the evaluation: rank of the correct chunk =====
/** Rank every chunk by cosine similarity to each question and see where the first correct chunk lands. */
export async function evaluate(questions: EvalQuestion[], chunks: Chunk[], vectors: VectorFile, embedder: Embedder): Promise<{ rows: EvalRow[]; byLang: EvalSummary[]; all: EvalSummary }> {
  if (vectors.model !== embedder.model) throw new Error(`the vectors were made by "${vectors.model}" but the questions would be embedded by "${embedder.model}"; they must be the same model`);
  const known = new Set(chunks.map((c) => c.id));
  const rows: EvalRow[] = [];
  for (const item of questions) {
    const expect = item.expect.flatMap((e) => (e === "PRICE" ? PRICE_IDS : [e]));
    for (const e of expect) if (!known.has(e)) throw new Error(`${item.id}: expected chunk ${e} does not exist`);
    const qv = await embedder.embedQuery(item.q);
    const ranked = chunks
      .map((c) => ({ id: c.id, score: cosine(qv, vectors.items[c.id]!.vector) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .map((x) => x.id);
    const pos = ranked.findIndex((id) => expect.includes(id));
    rows.push({ id: item.id, lang: item.lang, q: item.q, rank: pos >= 0 && pos < 10 ? pos + 1 : undefined, top: ranked.slice(0, 3) });
  }
  const summarize = (lang: string, rs: EvalRow[]): EvalSummary => ({
    lang,
    n: rs.length,
    hit1: rs.filter((r) => r.rank !== undefined && r.rank <= 1).length / rs.length,
    hit3: rs.filter((r) => r.rank !== undefined && r.rank <= 3).length / rs.length,
    hit5: rs.filter((r) => r.rank !== undefined && r.rank <= 5).length / rs.length,
    mrr: rs.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / rs.length,
  });
  const langs = [...new Set(rows.map((r) => r.lang))];
  return { rows, byLang: langs.map((l) => summarize(l, rows.filter((r) => r.lang === l))), all: summarize("all", rows) };
}

// ===== PART 7: Build the evaluation report =====
export function renderEvalReport(model: string, res: Awaited<ReturnType<typeof evaluate>>): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const out = [`# Retrieval test`, "", `Model: \`${model}\`. A question counts as a hit@k when a correct chunk is among the k most similar chunks.`, "", "| Language | Questions | hit@1 | hit@3 | hit@5 | MRR |", "| --- | ---: | ---: | ---: | ---: | ---: |"];
  for (const s of [...res.byLang, res.all]) out.push(`| ${s.lang} | ${s.n} | ${pct(s.hit1)} | ${pct(s.hit3)} | ${pct(s.hit5)} | ${s.mrr.toFixed(2)} |`);
  out.push("", "## Per question", "", "| Question id | Lang | Rank of first correct chunk | Top 3 |", "| --- | --- | ---: | --- |");
  for (const r of res.rows) out.push(`| ${r.id} | ${r.lang} | ${r.rank ?? "not in top 10"} | ${r.top.join(", ")} |`);
  out.push("");
  return out.join("\n");
}
