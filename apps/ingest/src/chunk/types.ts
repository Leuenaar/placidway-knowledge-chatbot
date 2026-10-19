/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/chunk/types.ts
 * PURPOSE : Data types of the chunker: the 13 chunk kinds (matching the chunks
 *           table check constraint), size limits (LIMITS), page input, chunk
 *           shape, and result.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. List of the 13 chunk kinds
 *    2. Chunk size limit
 *    3. Type: input of one page
 *    4. Type: one chunk
 *    5. Type: result of chunking one page
 * IF ASKED TO CHANGE:
 *    - Change the chunk size limits (minimum, maximum, target) (PART 2)
 *    - Add a chunk kind (PART 1)
 * ============================================================================ */

import type { DbPageType } from "../pages.js";

// ===== PART 1: List of the 13 chunk kinds =====
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

// ===== PART 2: Chunk size limit =====
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

// ===== PART 3: Type: input of one page =====
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

// ===== PART 4: Type: one chunk =====
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

// ===== PART 5: Type: result of chunking one page =====
export interface ChunkResult {
  chunks: Chunk[];
  warnings: string[];
}
