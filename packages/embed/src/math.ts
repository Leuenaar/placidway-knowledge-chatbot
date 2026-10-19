/* ============================================================================
 * FILE MAP
 * FILE    : packages/embed/src/math.ts
 * PURPOSE : Small vector maths: L2 normalisation, cosine similarity, and the
 *           pgvector text shape (six decimals, no NaN).
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Normalise the vector length to 1
 *    2. Cosine similarity of two vectors
 *    3. Text shape for the pgvector column
 * ============================================================================ */

// ===== PART 1: Normalise the vector length to 1 =====
/** Scale a vector to length 1, so the dot product of two vectors is their cosine similarity. */
export function l2normalize(v: ArrayLike<number>): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum);
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = norm === 0 ? 0 : v[i]! / norm;
  return out;
}

// ===== PART 2: Cosine similarity of two vectors =====
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

// ===== PART 3: Text shape for the pgvector column =====
/** The text form pgvector accepts: "[0.1,0.2,...]". Six decimals are plenty for cosine search and keep rows small. */
export function toPgVector(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? Number(x.toFixed(6)) : 0)).join(",")}]`;
}
