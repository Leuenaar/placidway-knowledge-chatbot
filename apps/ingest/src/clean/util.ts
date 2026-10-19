/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/clean/util.ts
 * PURPOSE : Small cleaning helpers: finds $ amounts exactly as written,
 *           strips URLs, sha256 hash, the $ amount check (R10), and
 *           reading raw files.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. $ amount pattern and the extractAmounts function
 *    2. URL pattern and the stripUrls function (remove links)
 *    3. sha256 hash of the clean text (R9)
 *    4. Check R10: every $ amount is in the clean text or recorded as removed
 *    5. Read a raw file ('key: value' header, a --- line, the text)
 * IF ASKED TO CHANGE:
 *    - Change how $ amounts are recognised (PART 1)
 *    - Change the rule for missing or extra price checks (PART 4)
 * ============================================================================ */

import { createHash } from "node:crypto";
import type { AmountCheck, Line, RawPage } from "./types.js";

// ===== PART 1: $ amount pattern and the extractAmounts function =====
/** A $ amount exactly as written on the page, e.g. $18,995, $18995, $3,950. */
const AMOUNT_RE = /\$\s?\d[\d,]*(?:\.\d+)?/g;

export function extractAmounts(text: string): string[] {
  return (text.match(AMOUNT_RE) ?? []).map((a) => a.replace(/\s/g, ""));
}

// ===== PART 2: URL pattern and the stripUrls function (remove links) =====
/** Angle-bracket links the crawler writes after link text, e.g. "Name <https://...>" or "<null>". */
const URL_GLUED = /\s*<(?:https?:\/\/[^>\s]*|null)>(?=[A-Za-z0-9])/g;
const URL_ANY = /\s*<(?:https?:\/\/[^>\s]*|null)>/g;

/** R4: remove <url> markers. A link glued to the next word becomes a space so words do not fuse. */
export function stripUrls(s: string): { text: string; removed: number } {
  const removed = (s.match(/<(?:https?:\/\/[^>\s]*|null)>/g) ?? []).length;
  if (removed === 0) return { text: s, removed };
  const text = s.replace(URL_GLUED, " ").replace(URL_ANY, "").replace(/\s+,/g, ",");
  return { text, removed };
}

// ===== PART 3: sha256 hash of the clean text (R9) =====
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ===== PART 4: Check R10: every $ amount is in the clean text or recorded as removed =====
/** Compare two lists of amounts as multisets. */
export function checkAmounts(kept: string[], cleaned: string[], dropped: string[]): AmountCheck {
  const count = (list: string[]) => {
    const m = new Map<string, number>();
    for (const a of list) m.set(a, (m.get(a) ?? 0) + 1);
    return m;
  };
  const have = count([...cleaned, ...dropped]);
  const want = count(kept);
  const lost: string[] = [];
  const invented: string[] = [];
  for (const [a, n] of want) {
    const diff = n - (have.get(a) ?? 0);
    for (let i = 0; i < diff; i++) lost.push(a);
  }
  for (const [a, n] of have) {
    const diff = n - (want.get(a) ?? 0);
    for (let i = 0; i < diff; i++) invented.push(a);
  }
  return { kept, cleaned, dropped, ok: lost.length === 0 && invented.length === 0, lost, invented };
}

// ===== PART 5: Read a raw file ('key: value' header, a --- line, the text) =====
/**
 * Parse a file written by the fetch step:
 *   source_url: ...
 *   page_type: ...
 *   fetched_at: ...
 *   ---
 *   <page text>
 */
export function parseRawFile(pageNo: number, content: string): RawPage {
  const all = content.replace(/\r\n/g, "\n").split("\n");
  const sep = all.findIndex((l) => l.trim() === "---");
  if (sep < 0) throw new Error(`page ${pageNo}: raw file has no "---" line after the header`);
  const header = new Map<string, string>();
  for (const l of all.slice(0, sep)) {
    const i = l.indexOf(":");
    if (i > 0) header.set(l.slice(0, i).trim(), l.slice(i + 1).trim());
  }
  const sourceUrl = header.get("source_url");
  if (!sourceUrl) throw new Error(`page ${pageNo}: raw header has no source_url`);
  const lines: Line[] = all.slice(sep + 1).map((t, i) => ({ n: sep + 2 + i, t }));
  return {
    pageNo,
    sourceUrl,
    pageType: header.get("page_type") ?? "",
    fetchedAt: header.get("fetched_at") ?? "",
    lines,
  };
}
