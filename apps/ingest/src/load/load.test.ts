/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/load/load.test.ts
 * TUJUAN  : Uji pemuat ke database: konfigurasi aman (kunci tidak pernah
 *           dicetak), pemeriksaan input, tulis halaman lalu chunk, jalan dua
 *           kali tidak mengubah apa pun, dry run tidak menulis.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. checkConfig: refuses missing values, http, a publishable key and a non-serv...
 *    2. checkLoadInput: stand-in model, stale or missing vectors and bad shapes are...
 *    3. loadToDatabase: writes pages then chunks, verifies counts, sends the key on...
 *    4. loadToDatabase: running twice changes nothing; a changed chunk is updated;...
 *    5. loadToDatabase: dry run reads but never writes, and lists what would be rem...
 *    6. loadToDatabase: dry run without credentials only checks the files
 *    7. loadToDatabase: bad input stops before any request; database errors surface...
 *    8. Rest.deleteIds: refuses an id that could change the URL
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeEmbedder } from "@pwbot/embed";
import type { ManifestEntry } from "../chunk/run.js";
import type { Chunk } from "../chunk/types.js";
import { embedChunks } from "../embed/run.js";
import { KEY, mockDb } from "../testing/mockdb.js";
import { checkConfig, DbError } from "./postgrest.js";
import { checkLoadInput, loadToDatabase, type LoadInput } from "./run.js";

const manifest: ManifestEntry[] = [1, 2].map((n) => ({
  pageNo: n,
  file: `0${n}.md`,
  sourceUrl: `https://example.test/${n}`,
  pageType: "package",
  hash: `pagehash${n}`,
  meta: { h1: `Page ${n}`, ...(n === 1 ? { modifiedDate: "Oct 12, 2026" } : {}) },
}));

const mk = (id: string, page: number, text: string): Chunk => ({
  id,
  page_no: page,
  source_url: `https://example.test/${page}`,
  page_type: "package",
  h1: `Page ${page}`,
  section: "S",
  kind: "overview",
  text: `[Page: Page ${page} / Type: overview / Section: S]\n${text}`,
  text_hash: `h-${id}-${text}`,
  page_modified: null,
});

async function input(chunks: Chunk[], model = createFakeEmbedder()): Promise<LoadInput> {
  const run = await embedChunks(chunks, model);
  return { manifest, chunks, vectors: run.file, allowFake: true };
}

const base = [mk("P1-overview-1", 1, "alpha text for page one"), mk("P1-overview-2", 1, "beta text for page one"), mk("P2-overview-1", 2, "gamma text for page two")];

// ===== BAGIAN 1: checkConfig: refuses missing values, http, a publishable key and a non-serv... =====
test("checkConfig: refuses missing values, http, a publishable key and a non-service JWT; never echoes the key", () => {
  assert.throws(() => checkConfig(undefined, KEY), DbError);
  assert.throws(() => checkConfig("http://abc.supabase.co", KEY), /https/);
  assert.throws(() => checkConfig("https://abc.supabase.co", "sb_publishable_xyz"), /publishable/);
  const anon = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.sig`;
  assert.throws(() => checkConfig("https://abc.supabase.co", anon), /anon/);
  const service = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.sig`;
  assert.equal(checkConfig("https://abc.supabase.co/", service).url, "https://abc.supabase.co");
  try {
    checkConfig("https://abc.supabase.co", "sb_publishable_SECRETPART");
  } catch (e) {
    assert.ok(!String(e).includes("SECRETPART"));
  }
});

// ===== BAGIAN 2: checkLoadInput: stand-in model, stale or missing vectors and bad shapes are... =====
test("checkLoadInput: stand-in model, stale or missing vectors and bad shapes are caught before anything is written", async () => {
  const good = await input(base);
  assert.deepEqual(checkLoadInput(good), []);
  assert.ok(checkLoadInput({ ...good, allowFake: false })[0]!.includes("stand-in"));

  const stale = structuredClone(good);
  stale.chunks[0]!.text_hash = "changed";
  assert.ok(checkLoadInput(stale).some((p) => p.includes("older text")));

  const missing = structuredClone(good);
  delete missing.vectors.items["P1-overview-2"];
  assert.ok(checkLoadInput(missing).some((p) => p.includes("no vector")));

  const short = structuredClone(good);
  short.vectors.items["P2-overview-1"]!.vector = [1, 0];
  assert.ok(checkLoadInput(short).some((p) => p.includes("2 numbers")));

  const notUnit = structuredClone(good);
  notUnit.vectors.items["P2-overview-1"]!.vector = notUnit.vectors.items["P2-overview-1"]!.vector.map((x) => x * 3);
  assert.ok(checkLoadInput(notUnit).some((p) => p.includes("unit length")));

  const orphan = structuredClone(good);
  orphan.vectors.items["P9-x-1"] = { text_hash: "x", vector: good.vectors.items["P1-overview-1"]!.vector };
  assert.ok(checkLoadInput(orphan).some((p) => p.includes("without a chunk")));
});

// ===== BAGIAN 3: loadToDatabase: writes pages then chunks, verifies counts, sends the key on... =====
test("loadToDatabase: writes pages then chunks, verifies counts, sends the key only in apikey", async () => {
  const db = mockDb();
  const report = await loadToDatabase(await input(base), db.rest, { dryRun: false, now: new Date("2026-10-18T12:00:00Z") });
  assert.deepEqual(report.problems, []);
  assert.deepEqual(report.perPage, [
    { pageNo: 1, local: 2, db: 2, withEmbedding: 2 },
    { pageNo: 2, local: 1, db: 1, withEmbedding: 1 },
  ]);
  assert.equal(db.tables.pages!.size, 2);
  assert.equal(db.tables.pages!.get("1")!.page_modified, "2026-10-12");
  assert.equal(db.tables.pages!.get("2")!.page_modified, null);
  assert.equal(db.tables.pages!.get("1")!.cleaned_hash, "pagehash1");
  const firstWrite = db.requests.find((r) => r.method === "POST")!;
  assert.match(firstWrite.url, /\/pages\?/, "pages are written before chunks");
  for (const r of db.requests) {
    assert.equal(r.headers.apikey, KEY);
    assert.equal(r.headers.Authorization, undefined);
  }
});

// ===== BAGIAN 4: loadToDatabase: running twice changes nothing; a changed chunk is updated;... =====
test("loadToDatabase: running twice changes nothing; a changed chunk is updated; a removed chunk is deleted", async () => {
  const db = mockDb();
  await loadToDatabase(await input(base), db.rest, { dryRun: false });
  const again = await loadToDatabase(await input(base), db.rest, { dryRun: false });
  assert.deepEqual(again.problems, []);
  assert.equal(db.tables.chunks!.size, 3);

  const edited = [mk("P1-overview-1", 1, "alpha text, now edited"), mk("P2-overview-1", 2, "gamma text for page two")];
  const third = await loadToDatabase(await input(edited), db.rest, { dryRun: false });
  assert.deepEqual(third.staleDeleted, ["P1-overview-2"]);
  assert.deepEqual(third.problems, []);
  assert.equal(db.tables.chunks!.size, 2);
  assert.ok(String(db.tables.chunks!.get("P1-overview-1")!.text).includes("now edited"));
});

// ===== BAGIAN 5: loadToDatabase: dry run reads but never writes, and lists what would be rem... =====
test("loadToDatabase: dry run reads but never writes, and lists what would be removed", async () => {
  const db = mockDb();
  await loadToDatabase(await input(base), db.rest, { dryRun: false });
  const writesBefore = db.requests.filter((r) => r.method !== "GET").length;
  const dry = await loadToDatabase(await input(base.slice(0, 2)), db.rest, { dryRun: true });
  assert.deepEqual(dry.staleDeleted, ["P2-overview-1"]);
  assert.equal(db.requests.filter((r) => r.method !== "GET").length, writesBefore);
  assert.equal(db.tables.chunks!.size, 3, "nothing was deleted");
});

// ===== BAGIAN 6: loadToDatabase: dry run without credentials only checks the files =====
test("loadToDatabase: dry run without credentials only checks the files", async () => {
  const report = await loadToDatabase(await input(base), undefined, { dryRun: true });
  assert.deepEqual(report.problems, []);
  assert.equal(report.chunksUpserted, 3);
});

// ===== BAGIAN 7: loadToDatabase: bad input stops before any request; database errors surface... =====
test("loadToDatabase: bad input stops before any request; database errors surface without the key", async () => {
  const db = mockDb();
  const bad = await input(base);
  const stopped = await loadToDatabase({ ...bad, allowFake: false }, db.rest, { dryRun: false });
  assert.ok(stopped.problems.length > 0);
  assert.equal(db.requests.length, 0);

  const tooShort = [mk("P1-overview-1", 1, "x")];
  tooShort[0]!.text = "tiny";
  await assert.rejects(loadToDatabase(await input(tooShort), db.rest, { dryRun: false }), (e: Error) => /HTTP 400/.test(e.message) && !e.message.includes(KEY));
});

// ===== BAGIAN 8: Rest.deleteIds: refuses an id that could change the URL =====
test("Rest.deleteIds: refuses an id that could change the URL", async () => {
  const db = mockDb();
  await assert.rejects(db.rest.deleteIds("chunks", ["P1-a-1),page_no=gt.0"]), /unsafe id/);
  assert.equal(db.requests.length, 0);
});
