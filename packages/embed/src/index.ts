/* ============================================================================
 * PETA FILE
 * FILE    : packages/embed/src/index.ts
 * TUJUAN  : Pintu paket @pwbot/embed: mengekspor embedder asli (e5), embedder
 *           palsu untuk uji, dan fungsi matematika vektor. Server dan alat
 *           ingest memakai paket yang sama.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Ekspor embedder e5 (asli)
 *    2. Ekspor embedder palsu (untuk uji)
 *    3. Ekspor fungsi vektor (cosine, normalisasi, bentuk pgvector)
 *    4. Ekspor tipe Embedder dan panjang vektor database
 * ============================================================================ */

// ===== BAGIAN 1: Ekspor embedder e5 (asli) =====
export { createE5Embedder, PASSAGE_PREFIX, QUERY_PREFIX, type E5Options } from "./e5.js";

// ===== BAGIAN 2: Ekspor embedder palsu (untuk uji) =====
export { createFakeEmbedder, FAKE_MODEL } from "./fake.js";

// ===== BAGIAN 3: Ekspor fungsi vektor (cosine, normalisasi, bentuk pgvector) =====
export { cosine, l2normalize, toPgVector } from "./math.js";

// ===== BAGIAN 4: Ekspor tipe Embedder dan panjang vektor database =====
export { DB_VECTOR_DIMS, type Embedder } from "./types.js";
