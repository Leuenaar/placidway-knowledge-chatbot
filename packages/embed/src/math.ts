/* ============================================================================
 * PETA FILE
 * FILE    : packages/embed/src/math.ts
 * TUJUAN  : Matematika vektor kecil: normalisasi L2, cosine similarity, dan
 *           bentuk teks pgvector (enam desimal, tanpa NaN).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Normalisasi panjang vektor menjadi 1
 *    2. Cosine similarity dua vektor
 *    3. Bentuk teks untuk kolom pgvector
 * ============================================================================ */

// ===== BAGIAN 1: Normalisasi panjang vektor menjadi 1 =====
/** Scale a vector to length 1, so the dot product of two vectors is their cosine similarity. */
export function l2normalize(v: ArrayLike<number>): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum);
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = norm === 0 ? 0 : v[i]! / norm;
  return out;
}

// ===== BAGIAN 2: Cosine similarity dua vektor =====
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`vectors have different lengths: ${a.length} and ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

// ===== BAGIAN 3: Bentuk teks untuk kolom pgvector =====
/** The text form pgvector accepts: "[0.1,0.2,...]". Six decimals are plenty for cosine search and keep rows small. */
export function toPgVector(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? Number(x.toFixed(6)) : 0)).join(",")}]`;
}
