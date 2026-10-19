/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/chunk/kinds.ts
 * TUJUAN  : Aturan R8: sebuah judul masuk jenis (kind) yang mana. Aturan
 *           pertama yang cocok menang, jadi urutan penting. Contoh: 'Included
 *           in the Out-Patient Program ($18,995 USD)' harus 'included', bukan
 *           'price'.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Fungsi: judul ke jenis chunk (urutan aturan menentukan)
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah atau menambah jenis chunk untuk sebuah judul: edit daftar
 *      aturan dalam fungsi ini. Jenis baru juga harus ada di KINDS
 *      (chunk/types.ts) dan di check constraint database (BAGIAN 1)
 * ============================================================================ */

import type { Kind } from "./types.js";

// ===== BAGIAN 1: Fungsi: judul ke jenis chunk (urutan aturan menentukan) =====
/**
 * R8: which kind a heading belongs to. The first matching line wins, so the order matters:
 * "Included in the Out-Patient Program ($18,995 USD)" must be "included", not "price".
 * Returns undefined when the heading says nothing (the caller then uses the section's kind or "overview").
 */
export function kindForHeading(raw: string): Kind | undefined {
  const h = raw.toLowerCase();
  if (/^package price$/.test(h)) return "price";
  if (/\bfaqs?\b|frequently asked/.test(h)) return "faq";
  // A heading that names both ("Included and Not Included") says nothing by itself; its sub-headings decide.
  if (/not included/.test(h) && /\bincluded\b/.test(h.replace(/not included/g, ""))) return undefined;
  if (/✗|not included|excluded|contingency/.test(h)) return "excluded";
  if (/✓|\bincluded\b/.test(h)) return "included";
  if (/optional/.test(h)) return "optional";
  if (/itinerary/.test(h)) return "itinerary";
  if (/\brisks?\b/.test(h)) return "risks";
  if (/testimonial|success stor|patient stor/.test(h)) return "patient_story";
  if (/\breviews?\b|real families/.test(h)) return "review";
  if (/destination|attraction|getting to|medical tourism for/.test(h)) return "destination";
  if (/\bcost|price|pricing|how much|quick facts|which clinics/.test(h)) return "price";
  if (/disclaimer/.test(h)) return "disclaimer";
  return undefined;
}
