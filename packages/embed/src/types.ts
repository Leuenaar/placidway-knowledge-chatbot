/* ============================================================================
 * PETA FILE
 * FILE    : packages/embed/src/types.ts
 * TUJUAN  : Kontrak Embedder: satu cara mengubah teks menjadi vektor. Alat
 *           ingest dan server API memakai embedder yang sama karena
 *           pertanyaan hanya bisa dicocokkan dengan teks yang di-embed oleh
 *           model yang sama.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: Embedder (nama model, dims, embedPassages, embedQuery)
 *    2. Panjang vektor di database (384)
 * KALAU DIMINTA MENGUBAH:
 *    - Mengganti dimensi vektor: ubah juga kolom vector(384) di db/migrations
 *      (BAGIAN 2)
 * ============================================================================ */

// ===== BAGIAN 1: Tipe: Embedder (nama model, dims, embedPassages, embedQuery) =====
/**
 * One way to turn text into vectors. The ingest tool and the API server use the same one, because a
 * question can only be matched against passages that were embedded by the same model.
 */
export interface Embedder {
  /** Name stored next to the vectors, so vectors from two different models are never mixed. */
  readonly model: string;
  /** Length of every vector. The database column is vector(384). */
  readonly dims: number;
  /** Embed text that is stored and searched (a chunk). */
  embedPassages(texts: string[]): Promise<number[][]>;
  /** Embed text that searches (a user question). */
  embedQuery(text: string): Promise<number[]>;
}

// ===== BAGIAN 2: Panjang vektor di database (384) =====
export const DB_VECTOR_DIMS = 384;
