/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/clean/types.ts
 * PURPOSE : Data types of the page cleaner: raw page, line, removed item,
 *           metadata, $ amount check, report and result.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type: raw page from the fetch stage
 *    2. Type: one line of text
 *    3. Type: the removed item together with its rule
 *    4. Type: page metadata (title, date, and so on)
 *    5. Type: result of the $ amount check (R10)
 *    6. Type: cleaning report
 *    7. Type: result of cleaning one page
 * ============================================================================ */

// ===== PART 1: Type: raw page from the fetch stage =====
/** A file as saved by the fetch step: a small "key: value" header, a line with ---, then the page text. */
export interface RawPage {
  pageNo: number;
  sourceUrl: string;
  pageType: string;
  fetchedAt: string;
  /** Page text lines. `n` is the 1-based line number in the raw file, so reports can point at it. */
  lines: Line[];
}

// ===== PART 2: Type: one line of text =====
export interface Line {
  n: number;
  t: string;
}

// ===== PART 3: Type: the removed item together with its rule =====
/** One block of text the cleaner removed, kept so a human can review what disappeared. */
export interface DroppedItem {
  rule: string;
  /** First raw line number of the block. */
  line: number;
  /** How many raw lines the block covers. */
  count: number;
  preview: string;
  /** Every $ amount found inside the removed text. */
  amounts: string[];
}

// ===== PART 4: Type: page metadata (title, date, and so on) =====
export interface CleanMeta {
  h1: string;
  location?: string;
  publishDate?: string;
  modifiedDate?: string;
  lastUpdated?: string;
  reviewedBy?: string;
  priceStartingFrom?: string;
  quoteUrl?: string;
}

// ===== PART 5: Type: result of the $ amount check (R10) =====
export interface AmountCheck {
  /** $ amounts in the kept region of the raw file (after R1). */
  kept: string[];
  /** $ amounts in the cleaned text. */
  cleaned: string[];
  /** $ amounts inside text the cleaner removed on purpose. */
  dropped: string[];
  /** True when kept = cleaned + dropped (nothing lost without being listed). */
  ok: boolean;
  /** Amounts that exist in kept but are in neither cleaned nor dropped. */
  lost: string[];
  /** Amounts that exist in cleaned/dropped but not in kept (would mean text was invented). */
  invented: string[];
}

// ===== PART 6: Type: cleaning report =====
export interface CleanReport {
  pageNo: number;
  keptFromLine: number;
  keptToLine: number;
  dropped: DroppedItem[];
  ruleCounts: Record<string, number>;
  urlsRemoved: number;
  amounts: AmountCheck;
  warnings: string[];
}

// ===== PART 7: Type: result of cleaning one page =====
export interface CleanResult {
  pageNo: number;
  sourceUrl: string;
  pageType: string;
  /** The cleaned page text (markdown-like). */
  text: string;
  /** sha256 of `text`, used by Refresh (R9). */
  hash: string;
  meta: CleanMeta;
  report: CleanReport;
}
