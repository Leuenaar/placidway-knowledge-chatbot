/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/clean/clean.ts
 * PURPOSE : Cleaner for one raw page. Rules: R1 take the region from the H1
 *           heading to the '## Request your Free Quote' marker; R2 header; R3
 *           images, booking widgets, 'Read More'; R4 remove links; R5 tables
 *           become sentences; R6 videos become 'Video:' lines; R7 table of
 *           contents; R9 hash; R10 safe $ amounts; X1 Related cards; X3
 *           duplicate videos. A pure function.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Constant: marker for the end of the content region (R1)
 *    2. Cleaner context and rule counters
 *    3. Record the removed text
 *    4. Remove the matching lines
 *    5. Remove the matching block from start to end
 *    6. Find the end of the header block (R2)
 *    7. Get the metadata (title, author, date)
 *    8. R6: a video block becomes one 'Video:' line
 *    9. R5: tables become sentences
 *    10. R4: remove links across the whole page
 *    11. X3: remove a video list that only repeats the titles
 *    12. R3: tidy the list bullet marks
 *    13. Tidy blank lines and trailing spaces
 *    14. cleanPage: the order of all the cleaning rules
 * IF ASKED TO CHANGE:
 *    - Add a new cleaning rule: add a step in cleanPage (PART 14) and its
 *      function above
 *    - Change the end-of-content marker (PART 1)
 * ============================================================================ */

import { convertTable, isTableStart } from "./tables.js";
import type { CleanMeta, CleanReport, CleanResult, DroppedItem, Line, RawPage } from "./types.js";
import { checkAmounts, extractAmounts, sha256, stripUrls } from "./util.js";

// ===== PART 1: Constant: marker for the end of the content region (R1) =====
/**
 * Cleaner for one page. Implements the approved rules R1 to R10 (see docs/INGESTION.md in the repo
 * for the plain-language version). The function is pure: same raw page in, same text and hash out.
 *
 * Two small additions to the approved rules are marked X1 and X2 and listed in the report:
 *   X1  drop the "### Related ..." card lists (they change on every visit, which would break R9)
 *   X2  drop bare two-digit counters such as 00 to 09 (carousel numbers, not content)
 *   X3  drop the page 5 list item that only repeats every video title (checked, not assumed)
 */
export const QUOTE_MARKER = "## Request your Free Quote";

/** Headings inside the header block that belong to the header (R2), not to the body. */
const HEADER_HEADINGS = new Set(["Package Price", "Medical Center Reviews"]);

// ===== PART 2: Cleaner context and rule counters =====
interface Ctx {
  dropped: DroppedItem[];
  counts: Record<string, number>;
  urlsRemoved: number;
  warnings: string[];
}

function count(ctx: Ctx, rule: string, n = 1): void {
  ctx.counts[rule] = (ctx.counts[rule] ?? 0) + n;
}

// ===== PART 3: Record the removed text =====
/** Record removed text. Blank-only blocks are not worth reporting. */
function recordDrop(ctx: Ctx, rule: string, removed: Line[]): void {
  const filled = removed.filter((l) => l.t.trim() !== "");
  if (filled.length === 0) return;
  const text = filled.map((l) => l.t.trim()).join(" ");
  ctx.dropped.push({
    rule,
    line: filled[0]!.n,
    count: filled.length,
    preview: text.slice(0, 100),
    amounts: extractAmounts(text),
  });
  count(ctx, rule, filled.length);
}

// ===== PART 4: Remove the matching lines =====
function removeWhere(ctx: Ctx, lines: Line[], rule: string, pred: (l: Line) => boolean): Line[] {
  const keep: Line[] = [];
  const gone: Line[] = [];
  for (const l of lines) (pred(l) ? gone : keep).push(l);
  recordDrop(ctx, rule, gone);
  return keep;
}

// ===== PART 5: Remove the matching block from start to end =====
/** Remove every block that starts at a line matching isStart and ends before the next line matching isEnd. */
function dropBlocks(
  ctx: Ctx,
  lines: Line[],
  rule: string,
  isStart: (l: Line) => boolean,
  isEnd: (l: Line) => boolean,
): Line[] {
  const out: Line[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (!isStart(l)) {
      out.push(l);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < lines.length && !isEnd(lines[j]!)) j++;
    recordDrop(ctx, rule, lines.slice(i, j));
    i = j;
  }
  return out;
}

// ===== PART 6: Find the end of the header block (R2) =====
function headerEnd(lines: Line[]): number {
  for (let i = 1; i < lines.length; i++) {
    const m = /^## (.+?)\s*$/.exec(lines[i]!.t);
    if (m && !HEADER_HEADINGS.has(m[1]!)) return i;
  }
  return lines.length;
}

function isHeaderJunk(t: string): boolean {
  const s = t.trim();
  return (
    s === "Medical Center Reviews" ||
    s === "## Medical Center Reviews" ||
    s === "Share this listing" ||
    /^\d+\s+Reviews?\b/.test(s) ||
    /^\d+(\.\d+)?K?$/.test(s) ||
    /^-\s*(<(?:https?:\/\/[^>]*|null)>)?\s*$/.test(s)
  );
}

// ===== PART 7: Get the metadata (title, author, date) =====
function extractMeta(lines: Line[]): CleanMeta {
  const h1 = lines[0]!.t.replace(/^#\s+/, "").trim();
  const head = lines.slice(0, headerEnd(lines));
  const headText = head.slice(1).map((l) => stripUrls(l.t).text).join(" ");
  const date = "([A-Z][a-z]{2} \\d{1,2}, \\d{4})";
  const meta: CleanMeta = { h1 };
  const firstLine = head.slice(1).find((l) => l.t.trim() !== "");
  if (firstLine && !/(Publish date|Last Updated|Modified date)/.test(firstLine.t) && !firstLine.t.includes("$")) {
    const loc = stripUrls(firstLine.t).text.trim();
    if (loc.length <= 80 && !loc.startsWith("#")) meta.location = loc;
  }
  meta.publishDate = new RegExp(`Publish date:\\s*${date}`).exec(headText)?.[1];
  meta.modifiedDate = new RegExp(`Modified date:\\s*${date}`).exec(headText)?.[1];
  meta.lastUpdated = /Last Updated:\s*([A-Za-z]{3,9} \d{1,2}, \d{4}|[A-Za-z]{3,9} \d{4})/.exec(headText)?.[1];
  // The name ends at "on <date>", "Author:", a heading, or a double space: on page 7 the text after the name is the review block.
  const reviewed = /Medically reviewed by:?\s*(.+)/.exec(headText)?.[1];
  meta.reviewedBy = reviewed?.split(/\s{2,}|\s+#|\s+Author:|\s+on\s+[A-Z][a-z]{2} \d{1,2}, \d{4}/)[0]?.trim() || undefined;
  meta.priceStartingFrom = /(\$\d[\d,]*)\s+Price starting from/.exec(headText)?.[1];
  const all = lines.map((l) => l.t).join("\n");
  meta.quoteUrl = /<(https?:\/\/[^>\s]*\/(?:rfi\/\d+\/[^>\s]*|request-info))>/.exec(all)?.[1];
  for (const k of Object.keys(meta) as (keyof CleanMeta)[]) if (meta[k] === undefined) delete meta[k];
  return meta;
}

// ===== PART 8: R6: a video block becomes one 'Video:' line =====
function convertVideos(ctx: Ctx, lines: Line[]): Line[] {
  const out: Line[] = [];
  const leftovers: Line[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    const m = /^###\s+(.+?)\s*<https?:\/\/[^>\s]*\/video\/[^>\s]*>\s*$/.exec(l.t);
    if (!m) {
      out.push(l);
      i++;
      continue;
    }
    const title = stripUrls(m[1]!).text.replace(/\s+/g, " ").trim();
    ctx.urlsRemoved += 1;
    out.push({ n: l.n, t: `- Video: ${title}` });
    count(ctx, "R6-video");
    let j = i + 1;
    while (j < lines.length && !/^#{1,3}\s/.test(lines[j]!.t)) {
      leftovers.push(lines[j]!);
      j++;
    }
    i = j;
  }
  recordDrop(ctx, "R6-video-details", leftovers);
  return out;
}

// ===== PART 9: R5: tables become sentences =====
function convertTables(ctx: Ctx, lines: Line[]): Line[] {
  const out: Line[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!isTableStart(lines, i)) {
      out.push(lines[i]!);
      i++;
      continue;
    }
    const conv = convertTable(lines, i);
    out.push({ n: lines[i]!.n, t: "" }, ...conv.rows, { n: lines[i]!.n, t: "" });
    ctx.urlsRemoved += conv.urlsRemoved;
    ctx.warnings.push(...conv.warnings);
    for (const d of conv.drops) {
      ctx.dropped.push({ rule: d.rule, line: d.line, count: 1, preview: d.preview, amounts: d.amounts });
      count(ctx, d.rule);
    }
    count(ctx, "R5-table");
    count(ctx, "R5-row", conv.rows.length);
    i = conv.next;
  }
  return out;
}

// ===== PART 10: R4: remove links across the whole page =====
/** R4 plus tidy-up that must happen after tables and videos have used the links. */
function stripUrlsEverywhere(ctx: Ctx, lines: Line[]): Line[] {
  return lines.map((l) => {
    const noImg = l.t.replace(/\[img:[^\]]*\]\s*/g, () => {
      count(ctx, "R3-img-inline");
      return "";
    });
    const s = stripUrls(noImg);
    ctx.urlsRemoved += s.removed;
    return { n: l.n, t: s.text.replace(/ /g, " ").replace(/[ \t]+$/g, "") };
  });
}

// ===== PART 11: X3: remove a video list that only repeats the titles =====
/**
 * X3: page 5 ends with one list item "Medical Center Videos:" that repeats all video titles in one
 * 10,000+ character line. It is dropped only when, after removing every "Video:" title from it,
 * nothing but commas and spaces is left, so it can never hide text that is not already a Video line.
 */
function dropVideoListDuplicate(ctx: Ctx, lines: Line[]): Line[] {
  const titles = lines
    .filter((l) => l.t.startsWith("- Video: "))
    .map((l) => l.t.slice("- Video: ".length))
    .sort((a, b) => b.length - a.length);
  if (titles.length === 0) return lines;
  const out: Line[] = [];
  const gone: Line[] = [];
  for (const l of lines) {
    if (l.t.startsWith("- Medical Center Videos:")) {
      let rest = l.t.slice("- Medical Center Videos:".length);
      for (const t of titles) rest = rest.split(t).join("");
      if (/^[\s,]*$/.test(rest)) {
        gone.push(l);
        continue;
      }
    }
    out.push(l);
  }
  recordDrop(ctx, "X3-video-list-duplicate", gone);
  return out;
}

// ===== PART 12: R3: tidy the list bullet marks =====
/** R3: "-" followed directly by text becomes "- text"; a "-" with nothing after it is dropped. */
function normalizeListMarkers(ctx: Ctx, lines: Line[]): Line[] {
  const out: Line[] = [];
  const empties: Line[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (l.t.trim() !== "-") {
      out.push(l);
      i++;
      continue;
    }
    const nxt = lines[i + 1];
    if (nxt && nxt.t.trim() !== "" && !/^(-|\||#)/.test(nxt.t.trim())) {
      out.push({ n: l.n, t: `- ${nxt.t.trim()}` });
      count(ctx, "R3-list-merge");
      i += 2;
    } else {
      empties.push(l);
      i++;
    }
  }
  if (empties.length) count(ctx, "R3-empty-marker", empties.length);
  return out;
}

// ===== PART 13: Tidy blank lines and trailing spaces =====
function tidy(lines: Line[]): string {
  const out: string[] = [];
  const isItem = (s: string | undefined) => (s ?? "").startsWith("- ");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.t;
    if (t.trim() === "") {
      if (out.length === 0) continue;
      if (out[out.length - 1] === "") continue;
      // keep list items together as one tight list (no blank line between two items)
      let k = i + 1;
      while (k < lines.length && lines[k]!.t.trim() === "") k++;
      if (isItem(out[out.length - 1]) && isItem(lines[k]?.t)) continue;
      out.push("");
      continue;
    }
    out.push(t);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

// ===== PART 14: cleanPage: the order of all the cleaning rules =====
export function cleanPage(raw: RawPage): CleanResult {
  const ctx: Ctx = { dropped: [], counts: {}, urlsRemoved: 0, warnings: [] };

  // R1: keep from the first "# " heading to "## Request your Free Quote" (which must appear once).
  const h1 = raw.lines.findIndex((l) => /^# \S/.test(l.t));
  const quotes = raw.lines.flatMap((l, i) => (l.t.trim() === QUOTE_MARKER ? [i] : []));
  if (h1 < 0) throw new Error(`page ${raw.pageNo}: no "# " heading found`);
  if (quotes.length !== 1) throw new Error(`page ${raw.pageNo}: expected exactly one "${QUOTE_MARKER}", found ${quotes.length}`);
  const q = quotes[0]!;
  if (q < h1) throw new Error(`page ${raw.pageNo}: "${QUOTE_MARKER}" comes before the H1`);
  let lines = raw.lines.slice(h1, q);
  const keptFromLine = lines[0]!.n;
  const keptToLine = lines[lines.length - 1]!.n;
  const keptAmounts = extractAmounts(lines.map((l) => l.t).join("\n"));
  const meta = extractMeta(lines);
  count(ctx, "R1-outside-removed", raw.lines.length - lines.length);

  // R3: image lines.
  lines = removeWhere(ctx, lines, "R3-img", (l) => /^\[img:[^\]]*\]\s*(<[^>]*>)?\s*$/.test(l.t));

  // R2: header block keeps metadata and prose, drops counts, share buttons and the like.
  const hEnd = headerEnd(lines);
  const head = lines.slice(0, hEnd);
  const goneHead = head.filter((l, i) => i > 0 && isHeaderJunk(l.t));
  recordDrop(ctx, "R2", goneHead);
  lines = [...head.filter((l, i) => i === 0 || !isHeaderJunk(l.t)), ...lines.slice(hEnd)];

  // R3: booking widget (page 1). From its heading to the next real section.
  lines = dropBlocks(ctx, lines, "R3-widget", (l) => /^## Book a consultation/.test(l.t), (l) => /^## /.test(l.t) && !/^## No slots available/.test(l.t));
  // R3: truncated copies that end in "Read More".
  lines = removeWhere(ctx, lines, "R3-readmore", (l) => stripUrls(l.t).text.trim().endsWith("Read More"));
  // X1: related-card lists.
  lines = dropBlocks(ctx, lines, "X1-related", (l) => /^###\s+Related\b/.test(l.t), (l) => /^#{1,3}\s/.test(l.t));
  // R7: table of contents (links only). The disclaimer above it stays.
  lines = dropBlocks(ctx, lines, "R7-toc", (l) => /^##\s+Table of Contents\s*$/.test(l.t), (l) => /^##\s/.test(l.t));

  // R6: videos become "Video: title". R5: tables become sentences. Both need the links, so they run before R4.
  lines = convertVideos(ctx, lines);
  lines = convertTables(ctx, lines);

  // R4: remove links. Then R3 list markers and X2 counters.
  lines = stripUrlsEverywhere(ctx, lines);
  lines = normalizeListMarkers(ctx, lines);
  lines = dropVideoListDuplicate(ctx, lines);
  lines = removeWhere(ctx, lines, "X2-counter", (l) => /^0\d$/.test(l.t.trim()));

  const text = tidy(lines);

  // R10: every $ amount in the kept region is in the cleaned text or listed as dropped.
  const amounts = checkAmounts(
    keptAmounts,
    extractAmounts(text),
    ctx.dropped.flatMap((d) => d.amounts),
  );
  if (!amounts.ok) {
    ctx.warnings.push(`R10: amounts do not add up. lost: [${amounts.lost.join(", ")}] invented: [${amounts.invented.join(", ")}]`);
  }

  const report: CleanReport = {
    pageNo: raw.pageNo,
    keptFromLine,
    keptToLine,
    dropped: ctx.dropped,
    ruleCounts: ctx.counts,
    urlsRemoved: ctx.urlsRemoved,
    amounts,
    warnings: ctx.warnings,
  };
  return {
    pageNo: raw.pageNo,
    sourceUrl: raw.sourceUrl,
    pageType: raw.pageType,
    text,
    hash: sha256(text),
    meta,
    report,
  };
}
