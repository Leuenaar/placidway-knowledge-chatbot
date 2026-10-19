/* ============================================================================
 * FILE MAP
 * FILE    : packages/embed/src/fake.ts
 * PURPOSE : Fake embedder for tests: 384-dimension vectors made from a hash of
 *           the words, deterministic, length 1, and the same words make
 *           vectors closer. It downloads no model and is never used with a
 *           real database (the loader refuses it).
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Small stable FNV-1a hash
 *    2. Create vectors from text
 *    3. Fake model name (checked so it never reaches the database)
 *    4. Builder of the fake embedder
 * ============================================================================ */

import { l2normalize } from "./math.js";
import { DB_VECTOR_DIMS, type Embedder } from "./types.js";

// ===== PART 1: Small stable FNV-1a hash =====
/** FNV-1a, a small stable hash. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ===== PART 2: Create vectors from text =====
function vectorOf(text: string): number[] {
  const v = new Array<number>(DB_VECTOR_DIMS).fill(0);
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}$]+/u)) {
    if (word) v[hash(word) % DB_VECTOR_DIMS]! += 1;
  }
  return l2normalize(v);
}

// ===== PART 3: Fake model name (checked so it never reaches the database) =====
export const FAKE_MODEL = "fake-hash-384";

// ===== PART 4: Builder of the fake embedder =====
/**
 * A stand-in for tests and for trying the pipeline where the real model cannot be downloaded: words are hashed into 384 buckets.
 * Texts that share words are close, but it knows nothing about meaning or languages, so it must never be loaded into the real database.
 */
export function createFakeEmbedder(): Embedder {
  return {
    model: FAKE_MODEL,
    dims: DB_VECTOR_DIMS,
    embedPassages: async (texts) => texts.map(vectorOf),
    embedQuery: async (text) => vectorOf(text),
  };
}
