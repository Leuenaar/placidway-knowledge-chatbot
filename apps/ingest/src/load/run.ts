/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/load/run.ts
 * TUJUAN  : Memuat halaman, chunk dan vektor ke database: periksa masukan
 *           lebih dulu (tanpa database), tulis halaman lalu chunk, hitung dan
 *           verifikasi, hapus yang sudah tidak ada. Dijalankan dua kali tidak
 *           mengubah apa pun. Dry run hanya membaca.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: masukan dan laporan pemuatan
 *    2. Pemeriksaan masukan tanpa database
 *    3. Pesan langkah sebelumnya bila berkas hilang
 *    4. Membaca berkas masukan dari folder data
 *    5. Membatasi ke halaman tertentu (dipakai Refresh)
 *    6. Ukuran batch tulis
 *    7. Memuat ke database: tulis, verifikasi, hapus yang usang
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah ukuran batch penulisan (BAGIAN 6)
 *    - Mengubah pemeriksaan sebelum memuat (BAGIAN 2)
 * ============================================================================ */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FAKE_MODEL, toPgVector } from "@pwbot/embed";
import { toIsoDate } from "../chunk/chunk.js";
import type { ManifestEntry } from "../chunk/run.js";
import type { Chunk } from "../chunk/types.js";
import type { VectorFile } from "../embed/run.js";
import { Rest } from "./postgrest.js";

// ===== BAGIAN 1: Tipe: masukan dan laporan pemuatan =====
export interface LoadInput {
  manifest: ManifestEntry[];
  chunks: Chunk[];
  vectors: VectorFile;
  allowFake?: boolean;
}

export interface LoadReport {
  dryRun: boolean;
  pages: number;
  chunksUpserted: number;
  staleDeleted: string[];
  perPage: { pageNo: number; local: number; db: number | undefined; withEmbedding: number | undefined }[];
  problems: string[];
}

// ===== BAGIAN 2: Pemeriksaan masukan tanpa database =====
/** Checks that need no database. Returns a list of problems, empty when the files are fit to load. */
export function checkLoadInput(input: LoadInput): string[] {
  const problems: string[] = [];
  const { manifest, chunks, vectors } = input;
  if (vectors.model === FAKE_MODEL && !input.allowFake) problems.push(`vectors were made by the stand-in model "${FAKE_MODEL}", which must not be loaded into the real database (use --allow-fake only on a throwaway project)`);
  if (vectors.dims !== 384) problems.push(`vectors have ${vectors.dims} dimensions, the database column is vector(384)`);
  const pageNos = new Set(manifest.map((m) => m.pageNo));
  for (const c of chunks) {
    if (!pageNos.has(c.page_no)) problems.push(`${c.id}: page ${c.page_no} is not in the manifest`);
    const v = vectors.items[c.id];
    if (!v) {
      problems.push(`${c.id}: no vector (run the embed step again)`);
      continue;
    }
    if (v.text_hash !== c.text_hash) problems.push(`${c.id}: the vector was made from older text (run the embed step again)`);
    if (v.vector.length !== 384) problems.push(`${c.id}: vector has ${v.vector.length} numbers`);
    else if (v.vector.some((x) => !Number.isFinite(x))) problems.push(`${c.id}: vector has a value that is not a number`);
    else if (Math.abs(Math.hypot(...v.vector) - 1) > 0.01) problems.push(`${c.id}: vector is not unit length`);
  }
  const ids = new Set(chunks.map((c) => c.id));
  for (const id of Object.keys(vectors.items)) if (!ids.has(id)) problems.push(`${id}: vector without a chunk`);
  return problems;
}

// ===== BAGIAN 3: Pesan langkah sebelumnya bila berkas hilang =====
const PREVIOUS_STEP: Record<string, string> = { cleaned: "npm run ingest:clean", chunks: "npm run ingest:chunk", embeddings: "npm run ingest:embed" };

// ===== BAGIAN 4: Membaca berkas masukan dari folder data =====
export function readLoadInput(root: string): LoadInput {
  const read = <T>(...p: string[]): T => {
    const file = join(root, ...p);
    if (!existsSync(file)) throw new Error(`${p.join("/")} does not exist yet, run \`${PREVIOUS_STEP[p[1]!] ?? "the earlier step"}\` first`);
    return JSON.parse(readFileSync(file, "utf8")) as T;
  };
  return {
    manifest: read<ManifestEntry[]>("data", "cleaned", "manifest.json"),
    chunks: read<Chunk[]>("data", "chunks", "chunks.json"),
    vectors: read<VectorFile>("data", "embeddings", "vectors.json"),
  };
}

// ===== BAGIAN 5: Membatasi ke halaman tertentu (dipakai Refresh) =====
/** Keep only some pages: their manifest rows, chunks and vectors. Used by Refresh to leave unchanged pages alone. */
export function restrictToPages(input: LoadInput, pageNos: number[]): LoadInput {
  const keep = new Set(pageNos);
  const chunks = input.chunks.filter((c) => keep.has(c.page_no));
  const ids = new Set(chunks.map((c) => c.id));
  return {
    ...input,
    manifest: input.manifest.filter((m) => keep.has(m.pageNo)),
    chunks,
    vectors: { ...input.vectors, items: Object.fromEntries(Object.entries(input.vectors.items).filter(([id]) => ids.has(id))) },
  };
}

// ===== BAGIAN 6: Ukuran batch tulis =====
const BATCH = 40;

// ===== BAGIAN 7: Memuat ke database: tulis, verifikasi, hapus yang usang =====
/**
 * Write pages and chunks to Supabase, remove chunks that no longer exist, then count what is in the database.
 * Order matters: pages first (chunks point at them), then chunks, then the stale ones. Running it again is safe,
 * because rows are matched by id.
 */
export async function loadToDatabase(input: LoadInput, db: Rest | undefined, opts: { dryRun: boolean; now?: Date }): Promise<LoadReport> {
  const report: LoadReport = { dryRun: opts.dryRun, pages: input.manifest.length, chunksUpserted: 0, staleDeleted: [], perPage: [], problems: checkLoadInput(input) };
  if (report.problems.length > 0) return report;
  const fetchedAt = (opts.now ?? new Date()).toISOString();

  const stalePerPage = new Map<number, string[]>();
  if (db) {
    for (const m of input.manifest) {
      const have = await db.selectColumn("chunks", "id", `page_no=eq.${m.pageNo}`);
      const keep = new Set(input.chunks.filter((c) => c.page_no === m.pageNo).map((c) => c.id));
      stalePerPage.set(m.pageNo, have.filter((id) => !keep.has(id)));
    }
  }
  report.staleDeleted = [...stalePerPage.values()].flat();
  report.chunksUpserted = input.chunks.length;

  if (!opts.dryRun) {
    if (!db) throw new Error("a database client is needed to load");
    await db.upsert(
      "pages",
      input.manifest.map((m) => ({
        page_no: m.pageNo,
        url: m.sourceUrl,
        page_type: m.pageType,
        title: m.meta.h1,
        cleaned_hash: m.hash,
        page_modified: toIsoDate(m.meta.modifiedDate),
        fetched_at: fetchedAt,
      })),
      "page_no",
    );
    const rows = input.chunks.map((c) => ({
      id: c.id,
      page_no: c.page_no,
      source_url: c.source_url,
      page_type: c.page_type,
      h1: c.h1,
      section: c.section,
      kind: c.kind,
      text: c.text,
      text_hash: c.text_hash,
      page_modified: c.page_modified,
      fetched_at: fetchedAt,
      embedding: toPgVector(input.vectors.items[c.id]!.vector),
    }));
    for (let i = 0; i < rows.length; i += BATCH) await db.upsert("chunks", rows.slice(i, i + BATCH), "id");
    await db.deleteIds("chunks", report.staleDeleted);
  }

  for (const m of input.manifest) {
    const local = input.chunks.filter((c) => c.page_no === m.pageNo).length;
    if (db && !opts.dryRun) {
      const inDb = await db.count("chunks", `page_no=eq.${m.pageNo}`);
      const withEmb = await db.count("chunks", `page_no=eq.${m.pageNo}&embedding=not.is.null`);
      report.perPage.push({ pageNo: m.pageNo, local, db: inDb, withEmbedding: withEmb });
      if (inDb !== local) report.problems.push(`page ${m.pageNo}: ${local} chunks locally but ${inDb} in the database`);
      if (withEmb !== local) report.problems.push(`page ${m.pageNo}: ${local} chunks but ${withEmb} have an embedding`);
    } else {
      report.perPage.push({ pageNo: m.pageNo, local, db: undefined, withEmbedding: undefined });
    }
  }
  return report;
}
