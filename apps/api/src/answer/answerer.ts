/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/answer/answerer.ts
 * PURPOSE : Turn (question + page pieces) into a checked answer. The model
 *           only writes words. The server decides: which ids count as quoted,
 *           which source links are shown (from the 7 fixed pages, not from the
 *           model), and whether the answer is grounded or not.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Limit on the model output length and the accepted JSON shape
 *    2. Shape of the answer result
 *    3. Source links from the quoted pieces (from the list of 7 pages)
 *    4. Answerer builder: call the model, check the JSON, check the quoted ids
 * IF ASKED TO CHANGE:
 *    - Limit on the model output tokens (4096) (PART 1)
 *    - Maximum accepted answer length (3000 characters) (PART 1)
 *    - How a 'not grounded' answer is decided (PART 4)
 * ============================================================================ */

/**
 * Turns (question, retrieved chunks) into a checked answer.
 *
 * The model writes the words. The server decides everything else: which chunks count as cited (only ids that were really
 * in the excerpts), which source links are shown (taken from the fixed list of seven pages, never from the model), and
 * whether the answer is grounded at all.
 */
import { z } from "zod";
import { SOURCE_PAGES, type Source } from "@pwbot/shared";
import type { RetrievedChunk } from "../retrieval";
import type { ModelClient } from "./anthropic";
import { AnswerError } from "./config";
import { extractJson } from "./json";
import { buildUserMessage, type AnswerContext } from "./prompt";

// ===== PART 1: Limit on the model output length and the accepted JSON shape =====
/** A hard cap on everything the model writes, internal reasoning included. The visible answer is short; the rest is room for thinking. */
/** Reasoning tokens count toward this limit. 2000 was too small for effort "high" (six cut-off replies in the effort comparison). */
const MAX_OUTPUT_TOKENS = 4096;

const outputSchema = z.object({
  kind: z.enum(["answer", "not_in_content"]),
  answer: z.string().trim().min(1).max(3000),
  used_chunk_ids: z.array(z.string()).max(50).default([]),
});

// ===== PART 2: Shape of the answer result =====
export interface AnswerResult {
  /** "refused" means the model declined to answer at all (its stop reason was "refusal"); the pipeline decides what to say. */
  kind: "answer" | "not_in_content" | "refused";
  /** Text for the visitor. Empty when kind is "refused". */
  answer: string;
  /** The chunks the answer says it used, limited to ids that were really sent. */
  usedChunks: RetrievedChunk[];
  /** Page links for the cited chunks, from the fixed list of seven pages. One entry per page. */
  sources: Source[];
  /** True when kind is "answer" but no valid chunk is cited: the answer cannot be traced to the pages, so it must not be shown as is. */
  ungrounded: boolean;
  inputTokens: number;
  outputTokens: number;
  /** Part of outputTokens spent on internal reasoning. */
  thinkingTokens: number;
}

export interface Answerer {
  answer(question: string, chunks: RetrievedChunk[], ctx?: AnswerContext): Promise<AnswerResult>;
}

// ===== PART 3: Source links from the quoted pieces (from the list of 7 pages) =====
export function sourcesFor(chunks: RetrievedChunk[]): Source[] {
  const out: Source[] = [];
  const seen = new Set<number>();
  for (const c of chunks) {
    if (seen.has(c.pageNo)) continue;
    seen.add(c.pageNo);
    const page = SOURCE_PAGES.find((p) => p.n === c.pageNo);
    if (page) out.push({ url: page.url, title: page.title });
  }
  return out;
}

// ===== PART 4: Answerer builder: call the model, check the JSON, check the quoted ids =====
/** `systemPrompt` is built once at startup from the rule files (see rules.ts and prompt.ts). */
export function createAnswerer(client: ModelClient, systemPrompt: string): Answerer {
  return {
    async answer(question, chunks, ctx) {
      const empty = { usedChunks: [], sources: [], ungrounded: false, inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
      // Nothing was found, so there is nothing to answer from. No model call is needed (and none is paid for).
      if (chunks.length === 0) {
        return { ...empty, kind: "not_in_content", answer: "" };
      }
      const completion = await client.complete({ system: systemPrompt, user: buildUserMessage(question, chunks, ctx), maxTokens: MAX_OUTPUT_TOKENS });
      const tokens = { inputTokens: completion.inputTokens, outputTokens: completion.outputTokens, thinkingTokens: completion.thinkingTokens };
      if (completion.stopReason === "refusal") return { ...empty, ...tokens, kind: "refused", answer: "" };
      if (completion.stopReason === "max_tokens") throw new AnswerError("The model reply was cut off (max_tokens reached)");

      const parsed = outputSchema.safeParse(extractJson(completion.text));
      if (!parsed.success) throw new AnswerError("The model reply did not have the expected fields");
      const { kind, answer, used_chunk_ids } = parsed.data;

      if (kind === "not_in_content") return { ...empty, ...tokens, kind, answer };

      const byId = new Map(chunks.map((c) => [c.id, c]));
      const usedChunks = [...new Set(used_chunk_ids)].flatMap((id) => {
        const c = byId.get(id);
        return c ? [c] : [];
      });
      return { ...tokens, kind, answer, usedChunks, sources: sourcesFor(usedChunks), ungrounded: usedChunks.length === 0 };
    },
  };
}
