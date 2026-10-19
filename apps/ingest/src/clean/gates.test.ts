/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/clean/gates.test.ts
 * PURPOSE : Test of the cleaner gate on the 7 real pages: no boilerplate is
 *           left, the result is deterministic, the size matches the
 *           measurement, and the important content of each page survives.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. gate: all 7 pages are cleaned, no warnings, R10 passes on each
 *    2. gate: no boilerplate is left in any page
 *    3. gate: the only $ amount removed anywhere is the unnamed row on page 6
 *    4. gate: the cleaner is deterministic (two runs give identical text and
 *       hash)
 *    5. gate: sizes are close to the measurements in the handoff (R1 to R5)
 *    6. gate page 1: header, price table and the Appendix package name
 *       survive; the...
 *    7. gate pages 2 to 4: 'Price starting from' and both program prices are
 *       present
 *    8. gate pages 2 to 4: the three packages differ only by cancer type in
 *       their H1
 *    9. gate page 5: every video is one 'Video:' line and no video link is
 *       left
 *    10. gate page 6: prices are sentences, the unnamed row is reported, the
 *        broken...
 *    11. gate page 7: tables are sentences with modified dates, the disclaimer
 *        stays...
 *    12. gate: reviewer names are clean (page 7 used to swallow the review
 *        block)
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { cleanPage } from "./clean.js";
import type { CleanResult } from "./types.js";
import { parseRawFile } from "./util.js";

/**
 * Gates for P1 on the real pages (C2.1 part): run against data/raw, which is not committed.
 * When the folder is missing the tests are skipped, so a fresh clone still passes `npm test`.
 */
const rawDir = resolve(fileURLToPath(new URL("../../../../data/raw", import.meta.url)));
const skip = !existsSync(rawDir) || readdirSync(rawDir).filter((f) => /^\d{2}_.+\.txt$/.test(f)).length !== 7;
const opts = { skip: skip ? "data/raw is not present" : false };

function load(): Map<number, CleanResult> {
  const out = new Map<number, CleanResult>();
  for (const f of readdirSync(rawDir).filter((x) => /^\d{2}_.+\.txt$/.test(x)).sort()) {
    const pageNo = Number(f.slice(0, 2));
    out.set(pageNo, cleanPage(parseRawFile(pageNo, readFileSync(join(rawDir, f), "utf8"))));
  }
  return out;
}

const pages = skip ? new Map<number, CleanResult>() : load();
const get = (n: number): CleanResult => {
  const p = pages.get(n);
  assert.ok(p, `page ${n} missing`);
  return p;
};

// ===== PART 1: gate: all 7 pages are cleaned, no warnings, R10 passes on each =====
test("gate: all 7 pages are cleaned, no warnings, R10 passes on each", opts, () => {
  assert.equal(pages.size, 7);
  for (const p of pages.values()) {
    assert.deepEqual(p.report.warnings, [], `page ${p.pageNo} warnings`);
    assert.equal(p.report.amounts.ok, true, `page ${p.pageNo} amounts`);
    assert.ok(p.text.startsWith("# "), `page ${p.pageNo} starts at the H1`);
  }
});

// ===== PART 2: gate: no boilerplate is left in any page =====
test("gate: no boilerplate is left in any page", opts, () => {
  const banned: [RegExp, string][] = [
    [/\[img:/, "image line"],
    [/<https?:\/\//, "link"],
    [/<null>/, "null link"],
    [/Share this listing/, "share block"],
    [/2024-11-03/, "dummy booking date"],
    [/No slots available/, "booking widget"],
    [/Book a consultation/, "booking widget"],
    [/Request your Free Quote/, "footer marker"],
    [/Trusted Medical Tourism Platform/, "footer"],
    [/Table of Contents/, "table of contents"],
    [/Read More/, "truncated copy"],
    [/We value your privacy|cookieyes/i, "cookie banner"],
    [/^\|/m, "raw table line"],
    [/^-$/m, "empty list marker"],
    [/^0\d$/m, "carousel counter"],
  ];
  for (const p of pages.values()) {
    for (const [re, label] of banned) assert.ok(!re.test(p.text), `page ${p.pageNo} still has ${label}`);
  }
});

// ===== PART 3: gate: the only $ amount removed anywhere is the unnamed row on page 6 =====
test("gate: the only $ amount removed anywhere is the unnamed row on page 6", opts, () => {
  const dropped = [...pages.values()].flatMap((p) => p.report.dropped.filter((d) => d.amounts.length).map((d) => ({ page: p.pageNo, rule: d.rule, amounts: d.amounts })));
  assert.deepEqual(dropped, [{ page: 6, rule: "R5-unnamed-row", amounts: ["$18995"] }]);
});

// ===== PART 4: gate: the cleaner is deterministic (two runs give identical text and hash) =====
test("gate: the cleaner is deterministic (two runs give identical text and hash)", opts, () => {
  const again = load();
  for (const [n, p] of pages) {
    assert.equal(again.get(n)!.hash, p.hash, `page ${n}`);
    assert.equal(again.get(n)!.text, p.text, `page ${n}`);
  }
  const hashes = new Set([...pages.values()].map((p) => p.hash));
  assert.equal(hashes.size, 7, "seven different pages give seven different hashes");
});

// ===== PART 5: gate: sizes are close to the measurements in the handoff (R1 to R5) =====
test("gate: sizes are close to the measurements in the handoff (R1 to R5)", opts, () => {
  // Handoff 5.3 measured: 21,594 / ~11,900 x3 / 38,738 (before R6) / 4,301 / 8,727.
  const near = (n: number, expected: number, tol = 0.12) => {
    const got = get(n).text.length;
    assert.ok(Math.abs(got - expected) / expected <= tol, `page ${n}: ${got} chars vs ${expected} measured`);
  };
  near(1, 21594);
  near(2, 11900);
  near(3, 11900);
  near(4, 11900);
  near(6, 4301);
  near(7, 8727);
  // Page 5 drops from 38,738 to titles only (R6), so it must be clearly smaller.
  assert.ok(get(5).text.length < 30000);
});

// ===== PART 6: gate page 1: header, price table and the Appendix package name survive; the... =====
test("gate page 1: header, price table and the Appendix package name survive; the booking widget does not", opts, () => {
  const p = get(1);
  assert.equal(p.meta.modifiedDate, "Oct 12, 2026");
  assert.equal(p.meta.location, "Tijuana, Mexico");
  assert.ok(p.text.includes("Base Package Price: $18,995;"));
  assert.ok(p.text.includes("Alternative Appendix Cancer Treatment Package in Tijuana, Mexico by ITC"));
  assert.ok(!p.text.includes("Confirm Your Virtual Consultation"));
  assert.ok(p.text.includes("Medically reviewed by: Dr. Carlos Bautista"));
});

// ===== PART 7: gate pages 2 to 4: 'Price starting from' and both program prices are present =====
test("gate pages 2 to 4: 'Price starting from' and both program prices are present", opts, () => {
  for (const n of [2, 3, 4]) {
    const p = get(n);
    assert.equal(p.meta.priceStartingFrom, "$18,995", `page ${n} meta`);
    assert.ok(p.text.includes("$18,995 Price starting from"), `page ${n} header price`);
    assert.ok(p.text.includes("- Out-Patient Program: Duration: 3 Weeks; Total Cost (USD): $18,995."), `page ${n} out-patient row`);
    assert.ok(p.text.includes("- In-Patient Program: Duration: 3 Weeks; Total Cost (USD): $30,000."), `page ${n} in-patient row`);
    assert.ok(!p.text.includes("Related Experiences"), `page ${n} related cards`);
  }
});

// ===== PART 8: gate pages 2 to 4: the three packages differ only by cancer type in their H1 =====
test("gate pages 2 to 4: the three packages differ only by cancer type in their H1", opts, () => {
  const h1s = [2, 3, 4].map((n) => get(n).meta.h1);
  assert.equal(new Set(h1s).size, 3);
  assert.ok(/Adenocarcinoma/.test(h1s[0]!) && /Adrenal/.test(h1s[1]!) && /Anal/.test(h1s[2]!));
});

// ===== PART 9: gate page 5: every video is one 'Video:' line and no video link is left =====
test("gate page 5: every video is one 'Video:' line and no video link is left", opts, () => {
  const p = get(5);
  const videos = p.text.split("\n").filter((l) => l.startsWith("- Video: "));
  assert.ok(videos.length >= 100, `${videos.length} videos`);
  assert.ok(!p.text.includes("/video/"));
  assert.ok(!p.text.includes("#### "), "video details are gone");
  assert.ok(!p.text.includes("Medical Center Videos:"), "the 10,000 character duplicate list is gone");
  assert.ok(p.text.length < 16000, `page 5 is ${p.text.length} chars`);
  assert.ok(get(1).text.includes("Medical Center Videos:"), "page 1 has no Video lines, so its item stays");
  assert.ok(p.text.includes("## Recent Reviews"));
});

// ===== PART 10: gate page 6: prices are sentences, the unnamed row is reported, the broken... =====
test("gate page 6: prices are sentences, the unnamed row is reported, the broken intro is kept as is", opts, () => {
  const p = get(6);
  assert.ok(p.text.includes("- Breast Cancer: $18995 (Price in USD)."));
  assert.ok(p.text.includes("- Colorectal Cancer: Details: 18995 USD; Price in USD: $18995."));
  assert.equal((p.text.match(/\(Price in USD\)/g) ?? []).length, 5);
  assert.ok(p.report.dropped.some((d) => d.rule === "R5-unnamed-row"));
  assert.ok(p.text.includes("prices range between in Tijuana"), "the broken sentence is content, not removed; rules must not use it");
});

// ===== PART 11: gate page 7: tables are sentences with modified dates, the disclaimer stays... =====
test("gate page 7: tables are sentences with modified dates, the disclaimer stays, the contents list goes", opts, () => {
  const p = get(7);
  assert.ok(p.text.includes("Important Disclaimer"));
  assert.ok(p.text.includes("Prices on our site are estimates only"));
  assert.ok(!p.text.includes("Table of Contents"));
  assert.ok(/Fizikon Medical Center[^\n]*Standard: \$110 \(modified date Jul 31, 2023\)/.test(p.text));
  assert.ok(/Stem Health Guadalajara[^\n]*Standard: \$1000 \(modified date Mar 28, 2025\)/.test(p.text));
  assert.ok(/Polyclinic Markov[^\n]*Standard: \$70 \(modified date Mar 28, 2023\)/.test(p.text));
  assert.ok(p.text.includes("costs on average $15017"), "the intro paragraph in the header block is content and stays");
  assert.equal(p.meta.lastUpdated, "Oct 2026");
});

// ===== PART 12: gate: reviewer names are clean (page 7 used to swallow the review block) =====
test("gate: reviewer names are clean (page 7 used to swallow the review block)", opts, () => {
  assert.equal(get(7).meta.reviewedBy, "Dr. Felix Mendes");
  for (const n of [1, 2, 3, 4, 5, 6]) assert.equal(get(n).meta.reviewedBy, "Dr. Carlos Bautista", `page ${n}`);
});
