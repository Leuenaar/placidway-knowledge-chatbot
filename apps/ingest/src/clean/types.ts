/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/clean/types.ts
 * TUJUAN  : Tipe data pembersih halaman: halaman mentah, baris, barang yang
 *           dibuang, metadata, pemeriksaan jumlah $, laporan dan hasil.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: halaman mentah dari tahap fetch
 *    2. Tipe: satu baris teks
 *    3. Tipe: barang yang dibuang beserta aturannya
 *    4. Tipe: metadata halaman (judul, tanggal, dll.)
 *    5. Tipe: hasil pemeriksaan jumlah $ (R10)
 *    6. Tipe: laporan pembersihan
 *    7. Tipe: hasil pembersihan satu halaman
 * ============================================================================ */

// ===== BAGIAN 1: Tipe: halaman mentah dari tahap fetch =====
/** A file as saved by the fetch step: a small "key: value" header, a line with ---, then the page text. */
export interface RawPage {
  pageNo: number;
  sourceUrl: string;
  pageType: string;
  fetchedAt: string;
  /** Page text lines. `n` is the 1-based line number in the raw file, so reports can point at it. */
  lines: Line[];
}

// ===== BAGIAN 2: Tipe: satu baris teks =====
export interface Line {
  n: number;
  t: string;
}

// ===== BAGIAN 3: Tipe: barang yang dibuang beserta aturannya =====
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

// ===== BAGIAN 4: Tipe: metadata halaman (judul, tanggal, dll.) =====
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

// ===== BAGIAN 5: Tipe: hasil pemeriksaan jumlah $ (R10) =====
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

// ===== BAGIAN 6: Tipe: laporan pembersihan =====
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

// ===== BAGIAN 7: Tipe: hasil pembersihan satu halaman =====
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
