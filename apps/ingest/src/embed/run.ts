/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/embed/run.ts
 * PURPOSE : Create vectors (embeddings) for all chunks. Unchanged chunks reuse
 *           the old vector; vectors from another model are never reused. The
 *           file is kept in order, so two runs give an identical file.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type: the vector file and the embed result
 *    2. Read the old vector file (or none if the model is different)
 *    3. Create vectors for a list of chunks (reusing the same ones)
 *    4. Read chunks.json, then write vectors.json
 *    5. Default location of the vector file
 * IF ASKED TO CHANGE:
 *    - Change the embedding model: see packages/embed and makeEmbedder in
 *      cli.ts PART 7
 * ============================================================================ */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Embedder } from "@pwbot/embed";
import type { Chunk } from "../chunk/types.js";

// ===== PART 1: Type: the vector file and the embed result =====
export interface VectorFile {
  model: string;
  dims: number;
  /** One entry per chunk id. text_hash says which text the vector was made from, so a changed chunk is never given an old vector. */
  items: Record<string, { text_hash: string; vector: number[] }>;
}

export interface EmbedRun {
  total: number;
  reused: number;
  embedded: number;
  removed: number;
  file: VectorFile;
}

// ===== PART 2: Read the old vector file (or none if the model is different) =====
/** Read an earlier vectors file, or undefined when there is none or it was made by another model. */
export function readVectorFile(path: string): VectorFile | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as VectorFile;
}

// ===== PART 3: Create vectors for a list of chunks (reusing the same ones) =====
/**
 * Give every chunk a vector. A chunk whose text_hash is unchanged since the last run keeps its vector (no model call),
 * so Refresh only pays for the chunks that changed. Vectors from another model are never reused.
 */
export async function embedChunks(chunks: Chunk[], embedder: Embedder, previous?: VectorFile): Promise<EmbedRun> {
  const old = previous && previous.model === embedder.model ? previous.items : {};
  const items: VectorFile["items"] = {};
  const todo: Chunk[] = [];
  for (const c of chunks) {
    const prev = old[c.id];
    if (prev && prev.text_hash === c.text_hash && prev.vector.length === embedder.dims) items[c.id] = prev;
    else todo.push(c);
  }
  if (todo.length) {
    const vectors = await embedder.embedPassages(todo.map((c) => c.text));
    if (vectors.length !== todo.length) throw new Error(`embedder returned ${vectors.length} vectors for ${todo.length} texts`);
    todo.forEach((c, i) => {
      items[c.id] = { text_hash: c.text_hash, vector: vectors[i]!.map((x) => Number(x.toFixed(6))) };
    });
  }
  // Keep the file in chunk order so two runs on the same input give the same file.
  const ordered: VectorFile["items"] = {};
  for (const c of chunks) ordered[c.id] = items[c.id]!;
  return {
    total: chunks.length,
    reused: chunks.length - todo.length,
    embedded: todo.length,
    removed: Object.keys(old).filter((id) => !(id in ordered)).length,
    file: { model: embedder.model, dims: embedder.dims, items: ordered },
  };
}

// ===== PART 4: Read chunks.json, then write vectors.json =====
export async function embedDirectory(chunksFile: string, outFile: string, embedder: Embedder): Promise<EmbedRun> {
  const chunks = JSON.parse(readFileSync(chunksFile, "utf8")) as Chunk[];
  const run = await embedChunks(chunks, embedder, readVectorFile(outFile));
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(run.file) + "\n", "utf8");
  return run;
}

// ===== PART 5: Default location of the vector file =====
export const defaultVectorPath = (root: string) => join(root, "data", "embeddings", "vectors.json");
