/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/pages.ts
 * PURPOSE : List of the 7 pages to process. page_no is the number in the raw
 *           file name (01_..., 02_...). page_type must match the check
 *           constraint of the public.pages table in Supabase.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type: page kinds the database allows
 *    2. Map from page number to page kind
 *    3. Number of pages that must exist (7)
 * IF ASKED TO CHANGE:
 *    - Add or change a source page: edit PAGE_TYPES, EXPECTED_PAGE_COUNT and
 *      SOURCE_PAGES in packages/shared/src/index.ts (PART 2)
 * ============================================================================ */

// ===== PART 1: Type: page kinds the database allows =====
/**
 * The seven pages of the assessment. page_no is the number in the raw file name (01_..., 02_...).
 * page_type must match the check constraint on public.pages in Supabase.
 */
export type DbPageType = "clinic_profile" | "package" | "videos" | "price_list" | "price_comparison";

// ===== PART 2: Map from page number to page kind =====
export const PAGE_TYPES: Record<number, DbPageType> = {
  1: "clinic_profile",
  2: "package",
  3: "package",
  4: "package",
  5: "videos",
  6: "price_list",
  7: "price_comparison",
};

// ===== PART 3: Number of pages that must exist (7) =====
export const EXPECTED_PAGE_COUNT = 7;
