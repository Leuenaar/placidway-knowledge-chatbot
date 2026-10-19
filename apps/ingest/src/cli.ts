/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/cli.ts
 * PURPOSE : Entry point of all ingest commands: clean, chunk, embed, load,
 *           eval, refresh (through npm run ingest:clean, ingest:chunk,
 *           ingest:embed, ingest:load, ingest:eval, ingest:refresh). The data/
 *           folder is not in git because the PlacidWay text is not committed.
 *           It reads .env.api for the commands that touch the database.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports (tools used)
 *    2. Location of the project's main folder and the optional argument reader
 *       (--name value)
 *    3. Read the secrets from the .env.api file
 *    4. Command chooser (clean, chunk, embed, load, eval, refresh)
 *    5. Command clean: clean the raw pages (data/raw to data/cleaned)
 *    6. Command chunk: cut the clean pages into chunks (data/chunks)
 *    7. Choose the embedding model (real e5 or the fake one for tests)
 *    8. Command eval: test the search quality with the question set
 *    9. Command refresh: compare with the database, load only what changed
 *    10. Command embed: turn the chunks into 384-dimension vectors
 *    11. Command load: write the pages, chunks and vectors to Supabase
 *    12. Run and catch errors
 * IF ASKED TO CHANGE:
 *    - Add a new ingest command: add a branch in main (PART 4), a new run
 *      function, and a script in package.json
 *    - Change the default data folder: see arg(...) in each run function (PART
 *      5)
 * ============================================================================ */

// ===== PART 1: Imports (tools used) =====
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Chunk } from "./chunk/types.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createE5Embedder, createFakeEmbedder, type Embedder } from "@pwbot/embed";
import { chunkDirectory } from "./chunk/run.js";
import { cleanDirectory } from "./clean/run.js";
import { defaultVectorPath, embedDirectory } from "./embed/run.js";
import { checkConfig, DbError, Rest } from "./load/postgrest.js";
import { loadToDatabase, readLoadInput } from "./load/run.js";
import { refresh } from "./refresh/run.js";
import { evaluate, readQuestions, renderEvalReport } from "./eval/run.js";
import { readVectorFile } from "./embed/run.js";

// ===== PART 2: Location of the project's main folder and the optional argument reader (--name value) =====
/**
 * Usage:  npm run ingest:clean            (reads data/raw, writes data/cleaned)
 *         npm run ingest:clean -- --raw some/dir --out other/dir
 *
 * data/ is git-ignored on purpose: the PlacidWay text is not committed.
 */
const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const flag = (name: string) => process.argv.includes(`--${name}`);

// ===== PART 3: Read the secrets from the .env.api file =====
/** Read KEY=VALUE lines from a git-ignored file at the repo root. Values already in the environment win. */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = value;
  }
}

// ===== PART 4: Command chooser (clean, chunk, embed, load, eval, refresh) =====
async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "clean") return runClean();
  if (cmd === "chunk") return runChunk();
  if (cmd === "embed") return runEmbed();
  if (cmd === "load") return runLoad();
  if (cmd === "eval") return runEval();
  if (cmd === "refresh") return runRefresh();
  console.error("usage: tsx src/cli.ts clean|chunk|embed|load|eval|refresh [--raw dir] [--cleaned dir] [--out dir] [--fake] [--dtype fp32] [--dry-run] [--allow-fake] [--apply] [--force]");
  process.exit(2);
}

// ===== PART 5: Command clean: clean the raw pages (data/raw to data/cleaned) =====
function runClean(): void {
  const rawDir = resolve(root, arg("raw", "data/raw"));
  const outDir = resolve(root, arg("out", "data/cleaned"));
  const results = cleanDirectory(rawDir, outDir);

  let bad = 0;
  console.log("page  chars  hash          $kept $dropped  R10   warnings");
  for (const r of results) {
    const a = r.report.amounts;
    if (!a.ok || r.report.warnings.length) bad++;
    console.log(
      `${String(r.pageNo).padStart(4)}  ${String(r.text.length).padStart(5)}  ${r.hash.slice(0, 12)}  ${String(a.cleaned.length).padStart(5)} ${String(a.dropped.length).padStart(8)}  ${a.ok ? "OK   " : "FAIL "} ${r.report.warnings.length}`,
    );
  }
  console.log(`\nwritten to ${outDir}`);
  if (bad) {
    console.error(`${bad} page(s) need attention, see cleaning-report.md`);
    process.exit(1);
  }
}

// ===== PART 6: Command chunk: cut the clean pages into chunks (data/chunks) =====
function runChunk(): void {
  const cleanedDir = resolve(root, arg("cleaned", "data/cleaned"));
  const outDir = resolve(root, arg("out", "data/chunks"));
  const run = chunkDirectory(cleanedDir, outDir);
  console.log("page  chunks  smallest  largest  kinds");
  for (const p of run.perPage) {
    const kinds = Object.entries(p.kinds).map(([k, v]) => `${k}:${v}`).join(" ");
    console.log(`${String(p.pageNo).padStart(4)}  ${String(p.chunks).padStart(6)}  ${String(p.minChars).padStart(8)}  ${String(p.maxChars).padStart(7)}  ${kinds}`);
  }
  console.log(`\n${run.chunks.length} chunks written to ${outDir}`);
  for (const w of run.warnings) console.log(`warning: ${w}`);
  if (run.problems.length) {
    for (const p of run.problems) console.error(`PROBLEM: ${p}`);
    process.exit(1);
  }
}

// ===== PART 7: Choose the embedding model (real e5 or the fake one for tests) =====
function makeEmbedder(): Embedder {
  if (flag("fake")) return createFakeEmbedder();
  const dtype = arg("dtype", "q8") === "fp32" ? "fp32" : "q8";
  return createE5Embedder({ model: arg("model", "Xenova/multilingual-e5-small"), dtype, cacheDir: resolve(root, "data/models") });
}

// ===== PART 8: Command eval: test the search quality with the question set =====
async function runEval(): Promise<void> {
  const vectorsPath = resolve(root, arg("vectors", defaultVectorPath(root)));
  const vectors = readVectorFile(vectorsPath);
  if (!vectors) {
    console.error(`PROBLEM: ${vectorsPath} does not exist yet, run \`npm run ingest:embed\` first`);
    process.exit(1);
  }
  const chunks = JSON.parse(readFileSync(resolve(root, "data/chunks/chunks.json"), "utf8")) as Chunk[];
  const questions = readQuestions(resolve(root, arg("questions", "apps/ingest/eval/questions.json")));
  const embedder = makeEmbedder();
  const res = await evaluate(questions, chunks, vectors, embedder);
  const report = renderEvalReport(embedder.model, res);
  const outPath = resolve(root, arg("report", "data/embeddings/eval-report.md"));
  writeFileSync(outPath, report, "utf8");
  console.log(report.split("\n").slice(0, 12).join("\n"));
  console.log(`full report: ${outPath}`);
}

// ===== PART 9: Command refresh: compare with the database, load only what changed =====
async function runRefresh(): Promise<void> {
  loadEnvFile(resolve(root, ".env.ingest"));
  let db: Rest;
  try {
    db = new Rest(checkConfig(process.env.SUPABASE_URL, process.env.SUPABASE_INGEST_KEY));
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  try {
    const res = await refresh({ root, db, apply: flag("apply"), force: flag("force"), makeEmbedder, allowFake: flag("allow-fake") });
    console.log("page  status          added changed removed renumbered");
    for (const p of res.plans) console.log(`${String(p.pageNo).padStart(4)}  ${p.status.padEnd(14)} ${String(p.diff.added.length).padStart(6)} ${String(p.diff.changed.length).padStart(7)} ${String(p.diff.removed.length).padStart(7)} ${String(p.diff.renumbered.length).padStart(10)}  ${p.reason}`);
    for (const w of res.warnings) console.log(`warning: ${w}`);
    if (res.embedded) console.log(`embedded ${res.embedded.embedded} chunk(s), reused ${res.embedded.reused}`);
    if (res.loaded.length) console.log(`loaded pages: ${res.loaded.join(", ")}`);
    else if (!flag("apply")) console.log("PLAN ONLY, nothing was written. Add --apply to write the changed pages.");
    if (res.problems.length) {
      for (const p of res.problems) console.error(`PROBLEM: ${p}`);
      process.exit(1);
    }
    console.log("report: data/refresh-report.md");
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ===== PART 10: Command embed: turn the chunks into 384-dimension vectors =====
async function runEmbed(): Promise<void> {
  const chunksFile = resolve(root, arg("chunks", "data/chunks/chunks.json"));
  const outFile = resolve(root, arg("out", defaultVectorPath(root)));
    const embedder = makeEmbedder();
  console.log(`model: ${embedder.model}${flag("fake") ? "  (stand-in, not for the real database)" : ""}`);
  const started = Date.now();
  const run = await embedDirectory(chunksFile, outFile, embedder);
  console.log(`${run.total} chunks: ${run.embedded} embedded, ${run.reused} reused from the last run, ${run.removed} dropped`);
  console.log(`written to ${outFile} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

// ===== PART 11: Command load: write the pages, chunks and vectors to Supabase =====
async function runLoad(): Promise<void> {
  loadEnvFile(resolve(root, ".env.ingest"));
  const dryRun = flag("dry-run");
  let input;
  try {
    input = readLoadInput(root);
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  if (flag("allow-fake")) input.allowFake = true;

  let db: Rest | undefined;
  try {
    db = new Rest(checkConfig(process.env.SUPABASE_URL, process.env.SUPABASE_INGEST_KEY));
  } catch (e) {
    if (!dryRun) {
      console.error(`PROBLEM: ${e instanceof DbError ? e.message : String(e)}`);
      process.exit(1);
    }
    console.log(`no database credentials (${e instanceof Error ? e.message : String(e)}): checking the files only`);
  }

  try {
    const report = await loadToDatabase(input, db, { dryRun });
    console.log(`${dryRun ? "DRY RUN, nothing was written. " : ""}${report.pages} pages, ${report.chunksUpserted} chunks, ${report.staleDeleted.length} stale chunk(s) ${dryRun ? "would be " : ""}removed`);
    for (const id of report.staleDeleted) console.log(`  stale: ${id}`);
    if (report.perPage.some((p) => p.db !== undefined)) {
      console.log("page  local  database  with embedding");
      for (const p of report.perPage) console.log(`${String(p.pageNo).padStart(4)}  ${String(p.local).padStart(5)}  ${String(p.db).padStart(8)}  ${String(p.withEmbedding).padStart(14)}`);
    }
    if (report.problems.length) {
      for (const p of report.problems) console.error(`PROBLEM: ${p}`);
      process.exit(1);
    }
    console.log(dryRun ? "files are fit to load" : "loaded and verified");
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ===== PART 12: Run and catch errors =====
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
