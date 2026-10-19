/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/refresh/run.ts
 * PURPOSE : Run the refresh: clean, chunk, embed, compare with the database,
 *           then load only the pages that changed. Stops before touching the
 *           database if a raw file is broken. --force loads an older copy.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type: refresh options and result
 *    2. The refresh flow from start to finish
 *    3. Loading input without vectors (a dry-run plan before the model has
 *       ever been used)
 * IF ASKED TO CHANGE:
 *    - Change the refresh steps (PART 2)
 * ============================================================================ */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Embedder } from "@pwbot/embed";
import { chunkDirectory } from "../chunk/run.js";
import { cleanDirectory } from "../clean/run.js";
import { embedChunks, readVectorFile, type VectorFile } from "../embed/run.js";
import type { Rest } from "../load/postgrest.js";
import { loadToDatabase, readLoadInput, restrictToPages, type LoadReport } from "../load/run.js";
import { type DbChunkRef, type DbPage, type PagePlan, planRefresh, renderRefreshReport } from "./plan.js";

// ===== PART 1: Type: refresh options and result =====
export interface RefreshOptions {
  root: string;
  db: Rest;
  /** Write to the database. Without it the run only produces the plan. */
  apply: boolean;
  /** Also load pages that look unchanged, and pages blocked as older. */
  force: boolean;
  /** Needed only with apply. Created lazily so a plan never loads the model. */
  makeEmbedder?: () => Embedder;
  allowFake?: boolean;
}

export interface RefreshResult {
  plans: PagePlan[];
  warnings: string[];
  problems: string[];
  loaded: number[];
  load?: LoadReport;
  embedded?: { total: number; reused: number; embedded: number };
}

// ===== PART 2: The refresh flow from start to finish =====
/**
 * Raw files -> clean -> chunk -> compare with the database -> (with --apply) embed what changed and load those pages.
 * The raw files are put in data/raw by the person (option B); this command never fetches from the website.
 */
export async function refresh(opts: RefreshOptions): Promise<RefreshResult> {
  const { root, db } = opts;
  const res: RefreshResult = { plans: [], warnings: [], problems: [], loaded: [] };

  const cleaned = cleanDirectory(join(root, "data", "raw"), join(root, "data", "cleaned"));
  for (const r of cleaned) {
    if (!r.report.amounts.ok) res.problems.push(`page ${r.pageNo}: a $ amount was lost or invented while cleaning (see cleaning-report.md)`);
    for (const w of r.report.warnings) res.problems.push(`page ${r.pageNo}: ${w}`);
  }
  const chunked = chunkDirectory(join(root, "data", "cleaned"), join(root, "data", "chunks"));
  res.problems.push(...chunked.problems);
  res.warnings.push(...chunked.warnings);
  if (res.problems.length > 0) return res;

  const input = readLoadInput0(root);
  const dbPages = await db.selectRows<DbPage & Record<string, unknown>>("pages", "page_no,cleaned_hash,page_modified");
  const dbChunks = new Map<number, DbChunkRef[]>();
  for (const m of input.manifest) {
    dbChunks.set(m.pageNo, await db.selectRows<DbChunkRef & Record<string, unknown>>("chunks", "id,text_hash", `page_no=eq.${m.pageNo}`));
  }
  res.plans = planRefresh(input.manifest, input.chunks, dbPages, dbChunks);

  const toLoad = res.plans.filter((p) => (opts.force ? true : p.status === "new" || p.status === "changed")).map((p) => p.pageNo);
  if (!opts.force) for (const p of res.plans) if (p.status === "blocked-older") res.problems.push(`page ${p.pageNo}: blocked, ${p.reason}`);

  if (opts.apply && toLoad.length > 0 && res.problems.length === 0) {
    if (!opts.makeEmbedder) throw new Error("an embedder is needed to apply a refresh");
    const embedder = opts.makeEmbedder();
    const vectorPath = join(root, "data", "embeddings", "vectors.json");
    const run = await embedChunks(input.chunks, embedder, readVectorFile(vectorPath));
    mkdirSync(join(root, "data", "embeddings"), { recursive: true });
    writeFileSync(vectorPath, JSON.stringify(run.file) + "\n", "utf8");
    res.embedded = { total: run.total, reused: run.reused, embedded: run.embedded };
    const full = { ...input, vectors: run.file as VectorFile, allowFake: opts.allowFake ?? false };
    res.load = await loadToDatabase(restrictToPages(full, toLoad), db, { dryRun: false });
    res.problems.push(...res.load.problems);
    if (res.load.problems.length === 0) res.loaded = toLoad;
  }

  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(join(root, "data", "refresh-report.md"), renderRefreshReport(res.plans, opts.apply && res.loaded.length > 0 ? "applied" : "plan", res.warnings), "utf8");
  return res;
}

// ===== PART 3: Loading input without vectors (a dry-run plan before the model has ever been used) =====
/** The load input without needing vectors yet (a plan must work before the model has ever run). */
function readLoadInput0(root: string) {
  const read = <T>(...p: string[]): T => JSON.parse(readFileSync(join(root, ...p), "utf8")) as T;
  if (!existsSync(join(root, "data", "chunks", "chunks.json"))) throw new Error("chunking did not produce data/chunks/chunks.json");
  return {
    manifest: read<import("../chunk/run.js").ManifestEntry[]>("data", "cleaned", "manifest.json"),
    chunks: read<import("../chunk/types.js").Chunk[]>("data", "chunks", "chunks.json"),
    vectors: { model: "", dims: 384, items: {} } as VectorFile,
  };
}
