/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/pages.ts
 * TUJUAN  : Daftar 7 halaman tugas. page_no adalah angka di nama berkas
 *           mentah (01_..., 02_...). page_type harus sama dengan check
 *           constraint tabel public.pages di Supabase.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: jenis halaman yang diizinkan database
 *    2. Peta nomor halaman ke jenis halaman
 *    3. Jumlah halaman yang wajib ada (7)
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah atau mengubah halaman sumber: edit PAGE_TYPES,
 *      EXPECTED_PAGE_COUNT, dan SOURCE_PAGES di packages/shared/src/index.ts
 *      (BAGIAN 2)
 * ============================================================================ */

// ===== BAGIAN 1: Tipe: jenis halaman yang diizinkan database =====
/**
 * The seven pages of the assessment. page_no is the number in the raw file name (01_..., 02_...).
 * page_type must match the check constraint on public.pages in Supabase.
 */
export type DbPageType = "clinic_profile" | "package" | "videos" | "price_list" | "price_comparison";

// ===== BAGIAN 2: Peta nomor halaman ke jenis halaman =====
export const PAGE_TYPES: Record<number, DbPageType> = {
  1: "clinic_profile",
  2: "package",
  3: "package",
  4: "package",
  5: "videos",
  6: "price_list",
  7: "price_comparison",
};

// ===== BAGIAN 3: Jumlah halaman yang wajib ada (7) =====
export const EXPECTED_PAGE_COUNT = 7;
