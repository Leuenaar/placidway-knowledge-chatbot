/* ============================================================================
 * FILE MAP
 * FILE    : packages/embed/src/index.ts
 * PURPOSE : Entry point of the @pwbot/embed package: it exports the real
 *           embedder (e5), the fake embedder for tests, and the vector maths
 *           functions. The server and the ingest tool use the same package.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Export of the real e5 embedder
 *    2. Export of the fake embedder (for tests)
 *    3. Export of the vector functions (cosine, normalisation, pgvector shape)
 *    4. Export of the Embedder type and the database vector length
 * ============================================================================ */

// ===== PART 1: Export of the real e5 embedder =====
export { createE5Embedder, PASSAGE_PREFIX, QUERY_PREFIX, type E5Options } from "./e5.js";

// ===== PART 2: Export of the fake embedder (for tests) =====
export { createFakeEmbedder, FAKE_MODEL } from "./fake.js";

// ===== PART 3: Export of the vector functions (cosine, normalisation, pgvector shape) =====
export { cosine, l2normalize, toPgVector } from "./math.js";

// ===== PART 4: Export of the Embedder type and the database vector length =====
export { DB_VECTOR_DIMS, type Embedder } from "./types.js";
