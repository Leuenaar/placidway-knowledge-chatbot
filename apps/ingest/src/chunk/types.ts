/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/chunk/types.ts
 * TUJUAN  : Tipe data pemotong: 13 jenis chunk (sesuai check constraint tabel
 *           chunks), batas ukuran (LIMITS), masukan halaman, bentuk chunk,
 *           dan hasil.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Daftar 13 jenis chunk
 *    2. Batas ukuran chunk
 *    3. Tipe: masukan satu halaman
 *    4. Tipe: satu chunk
 *    5. Tipe: hasil memotong satu halaman
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah batas ukuran chunk (minimal, maksimal, target) (BAGIAN 2)
 *    - Menambah jenis chunk (BAGIAN 1)
 * ============================================================================ */

import type { DbPageType } from "../pages.js";

// ===== BAGIAN 1: Daftar 13 jenis chunk =====
/** The 13 kinds allowed by the check constraint on public.chunks (R8). */
export const KINDS = [
  "price",
  "included",
  "excluded",
  "optional",
  "faq",
  "itinerary",
  "risks",
  "overview",
  "destination",
  "patient_story",
  "review",
  "disclaimer",
  "video_list",
] as const;
export type Kind = (typeof KINDS)[number];

// ===== BAGIAN 2: Batas ukuran chunk =====
/** Limits. Body = chunk text without the prefix. Total = prefix + body, which is what the database checks. */
export const LIMITS = {
  /** C3: a body shorter than this is merged into a neighbour. */
  minBody: 200,
  /** C2: target upper size of a body (about 350 tokens). */
  softBody: 1400,
  /** C6: a price section is kept whole up to this size. */
  priceBody: 1500,
  /** The database allows 40 to 1800 characters for the whole text. */
  minTotal: 40,
  maxTotal: 1800,
  /** C7: about 15 video titles per chunk. */
  videosPerChunk: 15,
} as const;

// ===== BAGIAN 3: Tipe: masukan satu halaman =====
/** What the chunker needs about one cleaned page. */
export interface PageInput {
  pageNo: number;
  sourceUrl: string;
  pageType: DbPageType;
  /** Cleaned text from stage 1. */
  text: string;
  h1: string;
  /** "Oct 12, 2026" or undefined. Becomes the page_modified date, or null when there is no full date. */
  modifiedDate?: string;
}

// ===== BAGIAN 4: Tipe: satu chunk =====
/** One row for public.chunks, minus the columns the database fills (char_len, fts) or later stages add. */
export interface Chunk {
  id: string;
  page_no: number;
  source_url: string;
  page_type: DbPageType;
  h1: string;
  section: string;
  kind: Kind;
  /** Prefix line + body. This is what is embedded and sent to the model (C4). */
  text: string;
  text_hash: string;
  page_modified: string | null;
  /** Characters at the start of the body that repeat the end of the previous chunk (C8). Omitted when 0. */
  overlap_chars?: number;
}

// ===== BAGIAN 5: Tipe: hasil memotong satu halaman =====
export interface ChunkResult {
  chunks: Chunk[];
  warnings: string[];
}
