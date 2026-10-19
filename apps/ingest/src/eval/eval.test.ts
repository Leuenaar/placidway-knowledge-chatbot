/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/eval/eval.test.ts
 * TUJUAN  : Uji alat evaluasi pencarian: menemukan chunk yang benar,
 *           melaporkan peringkat per bahasa, menolak vektor dari model lain,
 *           set pertanyaan valid.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. evaluate: finds the right chunk, reports rank and per-language numbers
 *    2. evaluate: refuses vectors from another model and expectations that do not e...
 *    3. question set: ids unique, 4 languages, every question has an expectation
 *    4. question set: every expected chunk id exists in the real chunks
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createFakeEmbedder } from "@pwbot/embed";
import type { Chunk } from "../chunk/types.js";
import { embedChunks } from "../embed/run.js";
import { evaluate, PRICE_IDS, readQuestions, renderEvalReport } from "./run.js";

const mk = (id: string, text: string): Chunk => ({
  id,
  page_no: Number(id.slice(1, 2)),
  source_url: "u",
  page_type: "package",
  h1: "H",
  section: "S",
  kind: "overview",
  text,
  text_hash: `h-${text}`,
  page_modified: null,
});

const corpus = [mk("P1-a-1", "hotel pool towels and breakfast"), mk("P1-a-2", "insurance does not cover alternative therapy abroad"), mk("P1-a-3", "airport shuttle from San Diego")];

// ===== BAGIAN 1: evaluate: finds the right chunk, reports rank and per-language numbers =====
test("evaluate: finds the right chunk, reports rank and per-language numbers", async () => {
  const embedder = createFakeEmbedder();
  const { file } = await embedChunks(corpus, embedder);
  const res = await evaluate(
    [
      { id: "q1", lang: "en", q: "does insurance cover therapy", expect: ["P1-a-2"] },
      { id: "q2", lang: "en", q: "shuttle from the airport", expect: ["P1-a-3"] },
      { id: "q3", lang: "xx", q: "zzz qqq", expect: ["P1-a-1"] },
    ],
    corpus,
    file,
    embedder,
  );
  assert.deepEqual(res.rows.slice(0, 2).map((r) => r.rank), [1, 1]);
  assert.equal(res.byLang.find((l) => l.lang === "en")!.hit1, 1);
  assert.equal(res.all.n, 3);
  assert.ok(res.all.hit1 < 1 || res.rows[2]!.rank !== undefined);
  assert.match(renderEvalReport(embedder.model, res), /\| en \| 2 \| 100% \|/);
});

// ===== BAGIAN 2: evaluate: refuses vectors from another model and expectations that do not e... =====
test("evaluate: refuses vectors from another model and expectations that do not exist", async () => {
  const embedder = createFakeEmbedder();
  const { file } = await embedChunks(corpus, embedder);
  await assert.rejects(evaluate([], corpus, { ...file, model: "other" }, embedder), /must be the same model/);
  await assert.rejects(evaluate([{ id: "q", lang: "en", q: "x", expect: ["P9-missing-1"] }], corpus, file, embedder), /does not exist/);
});

// ===== BAGIAN 3: question set: ids unique, 4 languages, every question has an expectation =====
test("question set: ids unique, 4 languages, every question has an expectation", () => {
  const qs = readQuestions(resolve(fileURLToPath(new URL("../../eval/questions.json", import.meta.url))));
  assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
  assert.deepEqual([...new Set(qs.map((q) => q.lang))].sort(), ["ar", "en", "es", "id"]);
  for (const q of qs) assert.ok(q.q.length > 5 && q.expect.length > 0, q.id);
});

const chunksPath = resolve(fileURLToPath(new URL("../../../../data/chunks/chunks.json", import.meta.url)));

// ===== BAGIAN 4: question set: every expected chunk id exists in the real chunks =====
test("question set: every expected chunk id exists in the real chunks", { skip: existsSync(chunksPath) ? false : "data/chunks is not present" }, () => {
  const ids = new Set((JSON.parse(readFileSync(chunksPath, "utf8")) as Chunk[]).map((c) => c.id));
  const qs = readQuestions(resolve(fileURLToPath(new URL("../../eval/questions.json", import.meta.url))));
  for (const e of [...PRICE_IDS, ...qs.flatMap((q) => q.expect).filter((x) => x !== "PRICE")]) assert.ok(ids.has(e), `${e} missing`);
});
