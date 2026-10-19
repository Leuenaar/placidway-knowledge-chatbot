/* ============================================================================
 * FILE MAP
 * FILE    : packages/embed/src/types.ts
 * PURPOSE : The Embedder contract: one way to turn text into a vector. The
 *           ingest tool and the API server use the same embedder,
 *           because a question can only be matched against text
 *           embedded by the same model.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type: Embedder (model name, dims, embedPassages, embedQuery)
 *    2. Vector length in the database (384)
 * IF ASKED TO CHANGE:
 *    - Change the vector dimension: also change the vector(384) column in
 *      db/migrations (PART 2)
 * ============================================================================ */

// ===== PART 1: Type: Embedder (model name, dims, embedPassages, embedQuery) =====
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

// ===== PART 2: Vector length in the database (384) =====
export const DB_VECTOR_DIMS = 384;
