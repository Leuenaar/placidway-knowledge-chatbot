/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/embed/run.ts
 * TUJUAN  : Membuat vektor (embedding) untuk semua chunk. Chunk yang tidak
 *           berubah memakai ulang vektor lama; vektor dari model lain tidak
 *           pernah dipakai ulang. Berkas dijaga berurutan sehingga dua kali
 *           jalan memberi berkas identik.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: berkas vektor dan hasil embed
 *    2. Membaca berkas vektor lama (atau tidak ada bila model berbeda)
 *    3. Membuat vektor untuk daftar chunk (pakai ulang yang sama)
 *    4. Membaca chunks.json lalu menulis vectors.json
 *    5. Lokasi bawaan berkas vektor
 * KALAU DIMINTA MENGUBAH:
 *    - Mengganti model embedding: lihat packages/embed dan makeEmbedder di
 *      cli.ts BAGIAN 7
 * ============================================================================ */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Embedder } from "@pwbot/embed";
import type { Chunk } from "../chunk/types.js";

// ===== BAGIAN 1: Tipe: berkas vektor dan hasil embed =====
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

// ===== BAGIAN 2: Membaca berkas vektor lama (atau tidak ada bila model berbeda) =====
/** Read an earlier vectors file, or undefined when there is none or it was made by another model. */
export function readVectorFile(path: string): VectorFile | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as VectorFile;
}

// ===== BAGIAN 3: Membuat vektor untuk daftar chunk (pakai ulang yang sama) =====
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

// ===== BAGIAN 4: Membaca chunks.json lalu menulis vectors.json =====
export async function embedDirectory(chunksFile: string, outFile: string, embedder: Embedder): Promise<EmbedRun> {
  const chunks = JSON.parse(readFileSync(chunksFile, "utf8")) as Chunk[];
  const run = await embedChunks(chunks, embedder, readVectorFile(outFile));
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(run.file) + "\n", "utf8");
  return run;
}

// ===== BAGIAN 5: Lokasi bawaan berkas vektor =====
export const defaultVectorPath = (root: string) => join(root, "data", "embeddings", "vectors.json");
