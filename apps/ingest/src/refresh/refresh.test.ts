/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/refresh/refresh.test.ts
 * PURPOSE : Test of the refresh flow: chunk diff (add, change, delete), the
 *           refresh plan, the warning report, refresh on the real pages, the
 *           guard against an older copy, and --force.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. diffChunks: added, changed, removed, and renumbered content
 *    2. planRefresh: new, unchanged, changed, same text but other chunks, and
 *       the o...
 *    3. renderRefreshReport: lists blocked pages and renumbered ids as
 *       warnings
 *    4. refresh on the real pages: new -> loaded, again -> nothing to do, one
 *       page...
 *    5. refresh blocks an older copy of a page, and --force loads it anyway
 *    6. refresh stops before touching the database when a raw page is broken
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createFakeEmbedder } from "@pwbot/embed";
import type { ManifestEntry } from "../chunk/run.js";
import type { Chunk } from "../chunk/types.js";
import { mockDb } from "../testing/mockdb.js";
import { diffChunks, planRefresh, renderRefreshReport } from "./plan.js";
import { refresh } from "./run.js";

const chunk = (id: string, hash: string): Chunk => ({ id, page_no: Number(id[1]), source_url: "u", page_type: "package", h1: "H", section: "S", kind: "overview", text: "t".repeat(50), text_hash: hash, page_modified: null });
const entry = (pageNo: number, hash: string, modifiedDate?: string): ManifestEntry => ({ pageNo, file: "f", sourceUrl: "u", pageType: "package", hash, meta: { h1: "H", ...(modifiedDate ? { modifiedDate } : {}) } });

// ===== PART 1: diffChunks: added, changed, removed, and renumbered content =====
test("diffChunks: added, changed, removed, and renumbered content", () => {
  const old = [{ id: "P2-a-1", text_hash: "h1" }, { id: "P2-a-2", text_hash: "h2" }, { id: "P2-a-3", text_hash: "h3" }];
  const next = [chunk("P2-a-1", "h1"), chunk("P2-a-2", "hNEW"), chunk("P2-a-3", "h2"), chunk("P2-a-4", "h3")];
  const d = diffChunks(old, next);
  assert.deepEqual(d.added, ["P2-a-4"]);
  assert.deepEqual(d.changed.sort(), ["P2-a-2", "P2-a-3"]);
  assert.deepEqual(d.removed, []);
  assert.deepEqual(d.renumbered.sort(), ["P2-a-3", "P2-a-4"], "h2 moved to a-3 and h3 moved to a-4");
  assert.deepEqual(diffChunks(old, [chunk("P2-a-1", "h1")]).removed, ["P2-a-2", "P2-a-3"]);
});

// ===== PART 2: planRefresh: new, unchanged, changed, same text but other chunks, and the o... =====
test("planRefresh: new, unchanged, changed, same text but other chunks, and the older-copy guard", () => {
  const manifest = [entry(1, "A"), entry(2, "B"), entry(3, "C"), entry(4, "D"), entry(5, "E", "Oct 02, 2026"), entry(6, "F", "Oct 12, 2026")];
  const chunks = [chunk("P2-a-1", "x"), chunk("P3-a-1", "y"), chunk("P4-a-1", "z"), chunk("P4-a-2", "z2")];
  const dbPages = [
    { page_no: 2, cleaned_hash: "B", page_modified: null },
    { page_no: 3, cleaned_hash: "OLD", page_modified: null },
    { page_no: 4, cleaned_hash: "D", page_modified: null },
    { page_no: 5, cleaned_hash: "OLD5", page_modified: "2026-10-12" },
    { page_no: 6, cleaned_hash: "OLD6", page_modified: "2026-10-12" },
  ];
  const dbChunks = new Map([
    [2, [{ id: "P2-a-1", text_hash: "x" }]],
    [3, [{ id: "P3-a-1", text_hash: "y" }]],
    [4, [{ id: "P4-a-1", text_hash: "z" }]],
  ]);
  const plans = planRefresh(manifest, chunks, dbPages, dbChunks);
  const status = Object.fromEntries(plans.map((p) => [p.pageNo, p.status]));
  assert.deepEqual(status, { 1: "new", 2: "unchanged", 3: "changed", 4: "changed", 5: "blocked-older", 6: "changed" });
  assert.match(plans.find((p) => p.pageNo === 4)!.reason, /chunker now produces different chunks/);
  assert.match(plans.find((p) => p.pageNo === 5)!.reason, /older copy/);
  assert.match(plans.find((p) => p.pageNo === 6)!.reason, /did not/, "same Modified date but other text");
});

// ===== PART 3: renderRefreshReport: lists blocked pages and renumbered ids as warnings =====
test("renderRefreshReport: lists blocked pages and renumbered ids as warnings", () => {
  const plans = planRefresh([entry(5, "E", "Oct 02, 2026")], [], [{ page_no: 5, cleaned_hash: "X", page_modified: "2026-10-12" }], new Map());
  const md = renderRefreshReport(plans, "plan", []);
  assert.match(md, /Plan only/);
  assert.match(md, /BLOCKED/);
});

const rawDir = resolve(fileURLToPath(new URL("../../../../data/raw", import.meta.url)));
const skip = !existsSync(rawDir) || readdirSync(rawDir).filter((f) => /^\d{2}_.+\.txt$/.test(f)).length !== 7;
const opts = { skip: skip ? "data/raw is not present" : false };

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "refresh-"));
  cpSync(rawDir, join(root, "data", "raw"), { recursive: true });
  return root;
}
const rawFile = (root: string, n: number) => join(root, "data", "raw", readdirSync(join(root, "data", "raw")).find((f) => f.startsWith(`0${n}_`))!);

function run(root: string, db: ReturnType<typeof mockDb>, o: { apply?: boolean; force?: boolean } = {}) {
  return refresh({ root, db: db.rest, apply: o.apply ?? false, force: o.force ?? false, makeEmbedder: createFakeEmbedder, allowFake: true });
}

// ===== PART 4: refresh on the real pages: new -> loaded, again -> nothing to do, one page... =====
test("refresh on the real pages: new -> loaded, again -> nothing to do, one page edited -> only that page is written", opts, async () => {
  const root = sandbox();
  const db = mockDb();

  const plan = await run(root, db);
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.plans.map((p) => p.status), Array(7).fill("new"));
  assert.equal(db.tables.chunks!.size, 0, "a plan writes nothing");
  assert.ok(existsSync(join(root, "data", "refresh-report.md")));

  const first = await run(root, db, { apply: true });
  assert.deepEqual(first.problems, []);
  assert.deepEqual(first.loaded, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(db.tables.chunks!.size, 149);
  assert.equal(db.tables.pages!.size, 7);

  const again = await run(root, db, { apply: true });
  assert.deepEqual(again.plans.map((p) => p.status), Array(7).fill("unchanged"));
  assert.deepEqual(again.loaded, []);

  const before = db.requests.length;
  const f = rawFile(root, 2);
  const text = readFileSync(f, "utf8");
  assert.ok(text.includes("three weeks"), "the page has the phrase this test edits");
  writeFileSync(f, text.replace("three weeks", "four weeks"));
  const edited = await run(root, db, { apply: true });
  assert.deepEqual(edited.problems, []);
  assert.deepEqual(edited.plans.filter((p) => p.status !== "unchanged").map((p) => p.pageNo), [2]);
  assert.deepEqual(edited.loaded, [2]);
  assert.equal(edited.embedded!.embedded > 0 && edited.embedded!.embedded < 10, true, `only a few chunks are embedded again (${edited.embedded!.embedded})`);
  const writes = db.requests.slice(before).filter((r) => r.method === "POST");
  assert.ok(writes.length > 0);
  for (const w of writes) {
    const rows = JSON.parse(w.body!) as { id?: string; page_no: number }[];
    for (const r of rows) assert.equal(r.page_no, 2, "no other page is written");
  }
});

// ===== PART 5: refresh blocks an older copy of a page, and --force loads it anyway =====
test("refresh blocks an older copy of a page, and --force loads it anyway", opts, async () => {
  const root = sandbox();
  const db = mockDb();
  await run(root, db, { apply: true });
  const f = rawFile(root, 5);
  const text = readFileSync(f, "utf8");
  assert.ok(text.includes("Modified date: Oct 12, 2026"));
  writeFileSync(f, text.replace("Modified date: Oct 12, 2026", "Modified date: Oct 02, 2026"));

  const blocked = await run(root, db, { apply: true });
  assert.ok(blocked.problems.some((p) => p.includes("page 5") && p.includes("blocked")));
  assert.deepEqual(blocked.loaded, []);
  assert.equal(blocked.plans.find((p) => p.pageNo === 5)!.status, "blocked-older");
  assert.match(readFileSync(join(root, "data", "refresh-report.md"), "utf8"), /BLOCKED/);

  const forced = await run(root, db, { apply: true, force: true });
  assert.deepEqual(forced.problems, []);
  assert.ok(forced.loaded.includes(5));
});

// ===== PART 6: refresh stops before touching the database when a raw page is broken =====
test("refresh stops before touching the database when a raw page is broken", opts, async () => {
  const root = sandbox();
  const db = mockDb();
  writeFileSync(rawFile(root, 3), "source_url: x\n---\nnot a page\n");
  await assert.rejects(run(root, db, { apply: true }));
  assert.equal(db.requests.filter((r) => r.method !== "GET").length, 0);
});
