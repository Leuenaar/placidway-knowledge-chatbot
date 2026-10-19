/* ============================================================================
 * PETA FILE
 * FILE    : packages/embed/src/fake.ts
 * TUJUAN  : Embedder palsu untuk uji: vektor 384 dimensi dari hash kata,
 *           deterministik, panjang 1, kata yang sama membuat vektor lebih
 *           dekat. Tidak mengunduh model dan tidak pernah dipakai ke database
 *           sungguhan (pemuat menolaknya).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Hash FNV-1a kecil yang stabil
 *    2. Membuat vektor dari teks
 *    3. Nama model palsu (dicek agar tidak ikut ke database)
 *    4. Pembuat embedder palsu
 * ============================================================================ */

import { l2normalize } from "./math.js";
import { DB_VECTOR_DIMS, type Embedder } from "./types.js";

// ===== BAGIAN 1: Hash FNV-1a kecil yang stabil =====
/** FNV-1a, a small stable hash. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ===== BAGIAN 2: Membuat vektor dari teks =====
function vectorOf(text: string): number[] {
  const v = new Array<number>(DB_VECTOR_DIMS).fill(0);
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}$]+/u)) {
    if (word) v[hash(word) % DB_VECTOR_DIMS]! += 1;
  }
  return l2normalize(v);
}

// ===== BAGIAN 3: Nama model palsu (dicek agar tidak ikut ke database) =====
export const FAKE_MODEL = "fake-hash-384";

// ===== BAGIAN 4: Pembuat embedder palsu =====
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
