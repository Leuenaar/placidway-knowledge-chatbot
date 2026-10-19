/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/embed/embed.test.ts
 * PURPOSE : Test of the vector builder (embed): the first run creates
 *           everything, unchanged chunks reuse the old vector, and vectors
 *           from another model are not reused.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. embedChunks: first run embeds everything, in chunk order
 *    2. embedChunks: an unchanged chunk keeps its vector, only the changed one
 *       goes...
 *    3. embedChunks: vectors from another model are never reused, removed
 *       chunks ar...
 *    4. embedChunks: no change gives a byte-identical file
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeEmbedder, type Embedder } from "@pwbot/embed";
import type { Chunk } from "../chunk/types.js";
import { embedChunks } from "./run.js";

const chunk = (id: string, text: string): Chunk => ({
  id,
  page_no: 1,
  source_url: "https://example.test",
  page_type: "clinic_profile",
  h1: "H",
  section: "S",
  kind: "overview",
  text,
  text_hash: `hash-${text}`,
  page_modified: null,
});

function counting(): { embedder: Embedder; calls: string[][] } {
  const base = createFakeEmbedder();
  const calls: string[][] = [];
  return { calls, embedder: { ...base, embedPassages: (t) => (calls.push(t), base.embedPassages(t)) } };
}

// ===== PART 1: embedChunks: first run embeds everything, in chunk order =====
test("embedChunks: first run embeds everything, in chunk order", async () => {
  const { embedder, calls } = counting();
  const run = await embedChunks([chunk("P1-a-1", "first text here"), chunk("P1-a-2", "second text here")], embedder);
  assert.deepEqual([run.total, run.embedded, run.reused, run.removed], [2, 2, 0, 0]);
  assert.deepEqual(Object.keys(run.file.items), ["P1-a-1", "P1-a-2"]);
  assert.equal(run.file.model, embedder.model);
  assert.equal(calls.length, 1);
});

// ===== PART 2: embedChunks: an unchanged chunk keeps its vector, only the changed one goes... =====
test("embedChunks: an unchanged chunk keeps its vector, only the changed one goes to the model", async () => {
  const first = await embedChunks([chunk("P1-a-1", "same text"), chunk("P1-a-2", "old text")], counting().embedder);
  const { embedder, calls } = counting();
  const run = await embedChunks([chunk("P1-a-1", "same text"), chunk("P1-a-2", "new text")], embedder, first.file);
  assert.deepEqual([run.embedded, run.reused], [1, 1]);
  assert.deepEqual(calls, [["new text"]]);
  assert.deepEqual(run.file.items["P1-a-1"], first.file.items["P1-a-1"]);
  assert.notDeepEqual(run.file.items["P1-a-2"]!.vector, first.file.items["P1-a-2"]!.vector);
});

// ===== PART 3: embedChunks: vectors from another model are never reused, removed chunks ar... =====
test("embedChunks: vectors from another model are never reused, removed chunks are counted and dropped", async () => {
  const first = await embedChunks([chunk("P1-a-1", "text"), chunk("P1-a-2", "gone")], counting().embedder);
  const other = { ...first.file, model: "some-other-model" };
  const { embedder, calls } = counting();
  const rerun = await embedChunks([chunk("P1-a-1", "text")], embedder, other);
  assert.equal(rerun.reused, 0);
  assert.equal(calls.length, 1);
  const same = await embedChunks([chunk("P1-a-1", "text")], counting().embedder, first.file);
  assert.deepEqual([same.reused, same.embedded, same.removed], [1, 0, 1]);
  assert.deepEqual(Object.keys(same.file.items), ["P1-a-1"]);
});

// ===== PART 4: embedChunks: no change gives a byte-identical file =====
test("embedChunks: no change gives a byte-identical file", async () => {
  const chunks = [chunk("P1-a-1", "alpha beta"), chunk("P1-a-2", "gamma delta")];
  const a = await embedChunks(chunks, counting().embedder);
  const b = await embedChunks(chunks, counting().embedder, a.file);
  assert.equal(JSON.stringify(b.file), JSON.stringify(a.file));
});
