/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/scripts/suite.ts
 * PURPOSE : The command `npm run suite`: runs all the test cases (the 8
 *           official questions, extra traps, 5 languages) against the real
 *           database and model, then writes a full report to suite-report.md.
 *           Options: --efforts, --runs, --only, --lang, --out. Each case uses
 *           about 3 paid model calls (small). It writes nothing to the
 *           database.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports (tools this script uses)
 *    2. Helper: read the --name value options from the command line
 *    3. Load the secrets and the model configuration
 *    4. The --efforts and --runs options (checked, a typo stops here)
 *    5. The --only, --lang and --out options (choose which cases run)
 *    6. Prepare the searcher, the chunk count and the system prompt
 *    7. Prepare the rewriter, the fixed text translator and the small talker
 *    8. Warm up the embedding model
 *    9. Run all the cases (one by one)
 *    10. Print the summary and write the markdown report
 *    11. Run the main function
 * IF ASKED TO CHANGE:
 *    - Run just one case: npm run suite -- --only en-8 (PART 5)
 *    - Test several model effort levels: --efforts low,medium,high (PART 4)
 *    - Change the report file name: --out name.md (PART 5)
 * ============================================================================ */

// ===== PART 1: Imports (tools this script uses) =====
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

// ===== PART 2: Helper: read the --name value options from the command line =====
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {

  // ===== PART 3: Load the secrets and the model configuration =====
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));
  const cfg = (() => {
    try {
      return loadAnthropicConfig();
    } catch (e) {
      console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  })();

  // ===== PART 4: The --efforts and --runs options (checked, a typo stops here) =====
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

  // ===== PART 5: The --only, --lang and --out options (choose which cases run) =====
  const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const langs = arg("lang")?.split(",").map((s) => s.trim()).filter(Boolean);
  const cases = CASES.filter((c) => (!only || only.some((o) => c.id.includes(o))) && (!langs || langs.includes(c.lang)));
  if (cases.length === 0) {
    console.error("PROBLEM: no case matches --only / --lang");
    process.exit(2);
  }
  const out = resolve(process.cwd(), "../..", arg("out") ?? "suite-report.md");

  // ===== PART 6: Prepare the searcher, the chunk count and the system prompt =====
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

  // ===== PART 7: Prepare the rewriter, the fixed text translator and the small talker =====
  const rewriter = createRewriter(createAnthropicClient(withEffort(cfg, cfg.rewriteEffort), { timeoutMs: 12_000 }), () => {});

  const rewriteClient = createAnthropicClient(withEffort(cfg, cfg.rewriteEffort), { timeoutMs: 12_000 });
  const localizer = createLocalizer({ client: rewriteClient, log: () => {} });
  const smallTalker = createSmallTalker(rewriteClient);

  // ===== PART 8: Warm up the embedding model =====
  console.log(`Loading the embedding model and checking the database...`);
  await retriever.search("warm up", 1);
  console.log(`Running ${cases.length} cases x ${efforts.length} effort(s) x ${runs} run(s) = ${cases.length * efforts.length * runs} conversations. Model ${cfg.model}, prompt ${PROMPT_VERSION}.\n`);

  // ===== PART 9: Run all the cases (one by one) =====
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

  // ===== PART 10: Print the summary and write the markdown report =====
  console.log(`\n${summaryTable(summarize(results))}\n`);
  const report = markdownReport({ when: new Date().toISOString(), model: cfg.model, retrieveCount: resultCount, expandPages, efforts, runsPerCase: runs, promptVersion: PROMPT_VERSION }, results);
  writeFileSync(out, report, "utf8");
  console.log(`Full answers written to ${out}`);
}

// ===== PART 11: Run the main function =====
void main();
