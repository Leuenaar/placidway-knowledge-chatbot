/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/chunk/kinds.ts
 * PURPOSE : Rule R8: which kind a heading belongs to. The first matching rule
 *           wins, so the order matters. Example: 'Included in the Out-Patient
 *           Program ($18,995 USD)' must be 'included', not 'price'.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Function: heading to chunk kind (the order of the rules decides)
 * IF ASKED TO CHANGE:
 *    - Change or add a chunk kind for a heading: edit the rules list in this
 *      function. A new kind must also exist in KINDS (chunk/types.ts) and in
 *      the database check constraint (PART 1)
 * ============================================================================ */

import type { Kind } from "./types.js";

// ===== PART 1: Function: heading to chunk kind (the order of the rules decides) =====
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
