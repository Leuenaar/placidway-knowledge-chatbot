/* ============================================================================
 * FILE MAP
 * FILE    : packages/embed/src/embed.test.ts
 * PURPOSE : Test of the embed package: L2 normalisation, cosine, the pgvector
 *           text shape, and the fake embedder (384 dimensions, length 1,
 *           deterministic).
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. l2normalize: result has length 1 and a zero vector stays zero
 *    2. cosine: identical is 1, unrelated is near 0, different lengths throw
 *    3. toPgVector: pgvector text form, six decimals, no NaN
 *    4. fake embedder: 384 dimensions, unit length, deterministic, shared
 *       words are...
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";
import { cosine, createFakeEmbedder, DB_VECTOR_DIMS, l2normalize, toPgVector } from "./index.js";

// ===== PART 1: l2normalize: result has length 1 and a zero vector stays zero =====
test("l2normalize: result has length 1 and a zero vector stays zero", () => {
  const v = l2normalize([3, 4]);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12);
  assert.deepEqual(l2normalize([0, 0, 0]), [0, 0, 0]);
});

// ===== PART 2: cosine: identical is 1, unrelated is near 0, different lengths throw =====
test("cosine: identical is 1, unrelated is near 0, different lengths throw", () => {
  assert.ok(Math.abs(cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-12);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0);
  assert.throws(() => cosine([1], [1, 2]), /different lengths/);
});

// ===== PART 3: toPgVector: pgvector text form, six decimals, no NaN =====
test("toPgVector: pgvector text form, six decimals, no NaN", () => {
  assert.equal(toPgVector([0.1234567891, -1, 0]), "[0.123457,-1,0]");
  assert.equal(toPgVector([Number.NaN, Infinity]), "[0,0]");
});

// ===== PART 4: fake embedder: 384 dimensions, unit length, deterministic, shared words are... =====
test("fake embedder: 384 dimensions, unit length, deterministic, shared words are closer", async () => {
  const e = createFakeEmbedder();
  const [a, b, c] = await e.embedPassages(["cost of cancer treatment in Tijuana", "cancer treatment cost Tijuana price", "hotel pool towels"]);
  assert.equal(a!.length, DB_VECTOR_DIMS);
  assert.ok(Math.abs(Math.hypot(...a!) - 1) < 1e-9);
  assert.deepEqual((await e.embedPassages(["cost of cancer treatment in Tijuana"]))[0], a);
  assert.ok(cosine(a!, b!) > cosine(a!, c!));
  assert.deepEqual(await e.embedQuery("hotel pool towels"), c);
});
