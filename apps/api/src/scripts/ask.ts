/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/scripts/ask.ts
 * PURPOSE : The command `npm run ask -- "question"`: asks one question from
 *           start to finish against the real database, the real embedding
 *           model and the real answer model. It prints the answer, the source
 *           links, the chunks used and the time of each step. It writes
 *           nothing. Good for trying one question from your own computer.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports (tools this script uses)
 *    2. Main function of the script
 *    3. Read the question from the command line
 *    4. Load the secrets from .env.api
 *    5. Prepare the searcher, the answerer and the rewriter (a configuration
 *       error stops here)
 *    6. Run: rewrite, search, answer, then time each step
 *    7. Print the result: answer, sources, chunks, time
 *    8. Run the main function
 * IF ASKED TO CHANGE:
 *    - Change how the result is printed to the screen (PART 7)
 *    - Change the model settings used to try a single question (PART 5)
 *    - Change the message shown when the question is empty (PART 3)
 * ============================================================================ */

// ===== PART 1: Imports (tools this script uses) =====
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

// ===== PART 2: Main function of the script =====
async function main(): Promise<void> {

  // ===== PART 3: Read the question from the command line =====
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('usage: npm run ask -- "your question"');
    process.exit(2);
  }

  // ===== PART 4: Load the secrets from .env.api =====
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));

  // ===== PART 5: Prepare the searcher, the answerer and the rewriter (a configuration error stops here) =====
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

    // ===== PART 6: Run: rewrite, search, answer, then time each step =====
    // Warm the embedding model first so the timings below show the normal speed, not the one-time model load.
    await retriever.search("warm up", 1);
    const t0 = Date.now();
    const rw = await rewriter.rewrite(question, []);
    const t1 = Date.now();
    const chunks = await gatherChunks(retriever, rw.query, { resultCount: count, expandPages: expand, visitorMessage: question, log: console.error });
    const t2 = Date.now();
    const result = await answerer.answer(question, chunks, { language: rw.language, history: [] });
    const t3 = Date.now();

    // ===== PART 7: Print the result: answer, sources, chunks, time =====
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

// ===== PART 8: Run the main function =====
void main();
