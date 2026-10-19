/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/clean/clean.test.ts
 * PURPOSE : Unit test of the page cleaner (rules R1 to R10 and X1, X3):
 *           content region, header, images and widgets, links, tables to
 *           sentences, videos, table of contents, hash, the $ amount check.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. R1 keeps only the region from the H1 to the quote marker
 *    2. R1 fails loudly when the page shape is not what the rule expects
 *    3. R2 drops counts and share buttons, keeps metadata and prose in the
 *       header b...
 *    4. R3 drops image lines, the booking widget (with its dummy date), Read
 *       More c...
 *    5. R4 removes links, keeps a space when a link was glued to the next word
 *    6. R5 turns a two-value table into one sentence per row and reports the
 *       unname...
 *    7. R5 handles lists inside cells and money in the first column (page 1
 *       style)
 *    8. R5 keeps a note that continues a cell (Modified date) and removes the
 *       link
 *    9. R5 keeps the cells as plain lines and warns when a table does not fit
 *       its c...
 *    10. R6 turns each video block into one Video line and keeps the list
 *        tight
 *    11. R7 drops the table of contents but keeps the disclaimer above it
 *    12. X1 drops Related card lists (they change on every visit)
 *    13. R9 the hash is the sha256 of the cleaned text, stable across runs,
 *        and chan...
 *    14. R9 the hash ignores things R1 removes (cookie banner and footer
 *        change, has...
 *    15. R10 amount check: lost and invented amounts are detected, dropped
 *        amounts a...
 *    16. R10 amounts are read exactly as written
 *    17. R10 end to end: an amount removed on purpose is listed, the check
 *        still passes
 *    18. X3 drops a Medical Center Videos item that only repeats the video
 *        titles, k...
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanPage } from "./clean.js";
import { checkAmounts, extractAmounts, parseRawFile, sha256, stripUrls } from "./util.js";

const FOOT = "\n## Request your Free Quote\n×\n## Footer\nfooter text $999\n";

function page(body: string, pageNo = 2) {
  return parseRawFile(pageNo, `source_url: https://example.test/p\npage_type: Test\nfetched_at: now\n---\n${body}${body.includes("## Request your Free Quote") ? "" : FOOT}`);
}

// ===== PART 1: R1 keeps only the region from the H1 to the quote marker =====
test("R1 keeps only the region from the H1 to the quote marker", () => {
  const r = cleanPage(page("cookie banner\n- Home <https://x.test/>\n\n# Title\n\nHello world.\n"));
  assert.ok(r.text.startsWith("# Title\n"));
  assert.ok(!r.text.includes("cookie banner"));
  assert.ok(!r.text.includes("footer text"));
  assert.ok(!r.text.includes("$999"), "amounts after the marker are outside the kept region");
  assert.equal(r.report.amounts.ok, true);
});

// ===== PART 2: R1 fails loudly when the page shape is not what the rule expects =====
test("R1 fails loudly when the page shape is not what the rule expects", () => {
  assert.throws(() => cleanPage(page("# Title\ntext\n## Request your Free Quote\n## Request your Free Quote\n")), /exactly one/);
  assert.throws(() => cleanPage(parseRawFile(2, "source_url: u\n---\n# Title\ntext\n")), /exactly one/);
  assert.throws(() => cleanPage(page("no heading here\n")), /no "# " heading/);
});

// ===== PART 3: R2 drops counts and share buttons, keeps metadata and prose in the header b... =====
test("R2 drops counts and share buttons, keeps metadata and prose in the header block", () => {
  const body = [
    "# Title",
    "",
    "Tijuana, Mexico <https://x.test/a>",
    "",
    "Publish date: Mar 02, 2026 Medically reviewed by: Dr. A B <https://x.test/d> on Mar 02, 2026 Author: Zed <https://x.test/z>",
    "",
    "Average cost is $15017 across clinics.",
    "",
    "## Package Price",
    "",
    "## Medical Center Reviews",
    "",
    "5 Reviews <https://x.test/r>",
    "",
    "1.4K",
    "",
    "$18,995 Price starting from",
    "",
    "Share this listing",
    "",
    "- <https://www.facebook.com/share.php>",
    "",
    "- <https://twitter.com/intent/tweet>",
    "",
    "-",
    "",
    "- <https://api.whatsapp.com/send>",
    "",
    "## Body",
    "",
    "Real text.",
    "",
  ].join("\n");
  const r = cleanPage(page(body));
  for (const keep of ["Tijuana, Mexico", "Publish date: Mar 02, 2026", "Dr. A B", "Average cost is $15017", "## Package Price", "$18,995 Price starting from", "Real text."]) {
    assert.ok(r.text.includes(keep), `should keep: ${keep}`);
  }
  for (const gone of ["Reviews", "1.4K", "Share this listing", "facebook", "whatsapp"]) {
    assert.ok(!r.text.includes(gone), `should drop: ${gone}`);
  }
  assert.equal(r.meta.location, "Tijuana, Mexico");
  assert.equal(r.meta.publishDate, "Mar 02, 2026");
  assert.equal(r.meta.reviewedBy, "Dr. A B");
  assert.equal(r.meta.priceStartingFrom, "$18,995");
  assert.equal(r.report.amounts.ok, true);
});

// ===== PART 4: R3 drops image lines, the booking widget (with its dummy date), Read More c... =====
test("R3 drops image lines, the booking widget (with its dummy date), Read More copies and empty markers", () => {
  const body = [
    "# Title",
    "",
    "## Book a consultation with X",
    "",
    "## No slots available for the week",
    "",
    "[img: Slider image (1) X]",
    "",
    "### Confirm Your Virtual Consultation",
    "",
    "Date:2024-11-03",
    "",
    "Time:15:30:00",
    "",
    "- Profile <https://x.test/p>",
    "",
    "## Real section",
    "",
    "[img: Logo] <https://x.test/logo>",
    "",
    "Dr. C Read More <https://x.test/p>",
    "",
    "-",
    "Merged item text",
    "",
    "-",
    "",
    "Paragraph after an empty marker $5.",
    "",
    "01",
    "",
  ].join("\n");
  const r = cleanPage(page(body));
  assert.ok(!r.text.includes("2024-11-03"));
  assert.ok(!r.text.includes("No slots available"));
  assert.ok(!r.text.includes("Book a consultation"));
  assert.ok(!r.text.includes("[img:"));
  assert.ok(!r.text.includes("Read More"));
  assert.ok(r.text.includes("- Merged item text"));
  assert.ok(!/^-$/m.test(r.text), "no empty list marker is left");
  assert.ok(!/^01$/m.test(r.text));
  assert.ok(r.text.includes("## Real section"));
  assert.ok(r.report.dropped.some((d) => d.rule === "R3-widget"));
  assert.equal(r.report.amounts.ok, true);
});

// ===== PART 5: R4 removes links, keeps a space when a link was glued to the next word =====
test("R4 removes links, keeps a space when a link was glued to the next word", () => {
  assert.equal(stripUrls("Name <https://x.test/a>Bangkok, Thailand").text, "Name Bangkok, Thailand");
  assert.equal(stripUrls("A <https://x.test/1>, B <https://x.test/2>").text, "A, B");
  assert.equal(stripUrls("share <null>").text, "share");
  const r = cleanPage(page("# T\n\nSee the Get a Free Quote <https://www.placidway.com/rfi/5/Some-Clinic> button.\n"));
  assert.ok(!r.text.includes("http"));
  assert.equal(r.meta.quoteUrl, "https://www.placidway.com/rfi/5/Some-Clinic");
});

// ===== PART 6: R5 turns a two-value table into one sentence per row and reports the unname... =====
test("R5 turns a two-value table into one sentence per row and reports the unnamed row", () => {
  const body = [
    "# Prices",
    "",
    "| Procedure",
    "| Details",
    "| Price in USD",
    "| Actions",
    "",
    "| Breast Cancer",
    "| Breast Cancer",
    "| $18995",
    "|",
    "",
    "|",
    "|",
    "| $18995",
    "|",
    "",
    "| Colorectal Cancer",
    "| 18995 USD",
    "| $18995",
    "|",
    "",
    "After the table.",
    "",
  ].join("\n");
  const r = cleanPage(page(body));
  assert.ok(r.text.includes("- Breast Cancer: $18995 (Price in USD)."));
  assert.ok(r.text.includes("- Colorectal Cancer: Details: 18995 USD; Price in USD: $18995."));
  assert.ok(r.text.includes("After the table."));
  assert.equal((r.text.match(/\$18995/g) ?? []).length, 2, "the unnamed row is not in the text");
  const unnamed = r.report.dropped.find((d) => d.rule === "R5-unnamed-row");
  assert.ok(unnamed, "the unnamed row is reported");
  assert.deepEqual(unnamed.amounts, ["$18995"]);
  assert.equal(r.report.amounts.ok, true, "kept = cleaned + dropped");
  assert.deepEqual(r.report.warnings, []);
});

// ===== PART 7: R5 handles lists inside cells and money in the first column (page 1 style) =====
test("R5 handles lists inside cells and money in the first column (page 1 style)", () => {
  const body = [
    "# Cost",
    "",
    "## Cost and packages",
    "",
    "| Base Package Price",
    "| Cancer Types Treated",
    "| Standard Inclusions",
    "",
    "| $18,995",
    "|",
    "",
    "-",
    "Breast Cancer",
    "",
    "-",
    "Prostate Cancer",
    "",
    "|",
    "",
    "-",
    "Physician consultations",
    "",
    "-",
    "Daily care",
    "",
    "Patients can ask for a quote.",
    "",
  ].join("\n");
  const r = cleanPage(page(body));
  assert.ok(
    r.text.includes("- Base Package Price: $18,995; Cancer Types Treated: Breast Cancer, Prostate Cancer; Standard Inclusions: Physician consultations, Daily care."),
    r.text,
  );
  assert.ok(r.text.includes("Patients can ask for a quote."));
  assert.deepEqual(r.report.warnings, []);
});

// ===== PART 8: R5 keeps a note that continues a cell (Modified date) and removes the link =====
test("R5 keeps a note that continues a cell (Modified date) and removes the link", () => {
  const body = [
    "# Compare",
    "",
    "| Clinic / Surgeon",
    "| Standard",
    "| Procedure",
    "",
    "| Alpha Clinic <https://x.test/a>Bangkok, Thailand",
    "| $64",
    "",
    "Modified date Sep 16, 2026",
    "",
    "| Physio, Massage",
    "",
    "## Next section",
    "",
  ].join("\n");
  const r = cleanPage(page(body));
  assert.ok(
    r.text.includes("- Alpha Clinic Bangkok, Thailand: Standard: $64 (modified date Sep 16, 2026); Procedure: Physio, Massage."),
    r.text,
  );
  assert.ok(r.text.includes("## Next section"));
});

// ===== PART 9: R5 keeps the cells as plain lines and warns when a table does not fit its c... =====
test("R5 keeps the cells as plain lines and warns when a table does not fit its columns", () => {
  const body = ["# T", "", "| A", "| B", "", "| one", "| two", "", "| three", "", "tail", ""].join("\n");
  const r = cleanPage(page(body));
  assert.equal(r.report.warnings.length, 1);
  for (const w of ["one", "two", "three"]) assert.ok(r.text.includes(w));
});

// ===== PART 10: R6 turns each video block into one Video line and keeps the list tight =====
test("R6 turns each video block into one Video line and keeps the list tight", () => {
  const body = [
    "# Videos",
    "",
    "## About",
    "",
    "### Title One <https://x.test/video/1/1/a>",
    "",
    "Cancer Treatment",
    "",
    "#### Clinic X",
    "",
    "Tijuana, Mexico",
    "",
    "### Title Two <https://x.test/video/2/1/b>",
    "",
    "Cancer Treatment",
    "",
    "## Recent Reviews",
    "",
    "Great place.",
    "",
  ].join("\n");
  const r = cleanPage(page(body, 5));
  assert.ok(r.text.includes("- Video: Title One\n- Video: Title Two\n"), r.text);
  assert.ok(!r.text.includes("Cancer Treatment"));
  assert.ok(!r.text.includes("/video/"));
  assert.ok(r.text.includes("## Recent Reviews"));
});

// ===== PART 11: R7 drops the table of contents but keeps the disclaimer above it =====
test("R7 drops the table of contents but keeps the disclaimer above it", () => {
  const body = [
    "# Compare",
    "",
    "Important Disclaimer",
    "",
    "PlacidWay.com provides medical travel information, not healthcare services.",
    "",
    "## Table of Contents",
    "",
    "- Quick Facts <https://x.test/q>",
    "",
    "- Costs <https://x.test/c>",
    "",
    "## Next",
    "",
    "Body.",
    "",
  ].join("\n");
  const r = cleanPage(page(body, 7));
  assert.ok(r.text.includes("Important Disclaimer"));
  assert.ok(r.text.includes("PlacidWay.com provides medical travel information"));
  assert.ok(!r.text.includes("Table of Contents"));
  assert.ok(!r.text.includes("Quick Facts"));
  assert.ok(r.text.includes("## Next"));
});

// ===== PART 12: X1 drops Related card lists (they change on every visit) =====
test("X1 drops Related card lists (they change on every visit)", () => {
  const body = ["# T", "", "Text.", "", "### Related Experiences:", "Dental implants <https://x.test/e>", "", "00", "", "### About Package", "", "- Location: Tijuana", ""].join("\n");
  const r = cleanPage(page(body));
  assert.ok(!r.text.includes("Dental implants"));
  assert.ok(r.text.includes("### About Package"));
  assert.ok(r.text.includes("- Location: Tijuana"));
});

// ===== PART 13: R9 the hash is the sha256 of the cleaned text, stable across runs, and chan... =====
test("R9 the hash is the sha256 of the cleaned text, stable across runs, and changes with the text", () => {
  const p = page("# T\n\nSame text.\n");
  const a = cleanPage(p);
  const b = cleanPage(p);
  assert.equal(a.hash, b.hash);
  assert.equal(a.text, b.text);
  assert.equal(a.hash, sha256(a.text));
  assert.notEqual(cleanPage(page("# T\n\nOther text.\n")).hash, a.hash);
});

// ===== PART 14: R9 the hash ignores things R1 removes (cookie banner and footer change, has... =====
test("R9 the hash ignores things R1 removes (cookie banner and footer change, hash stays)", () => {
  const a = cleanPage(page("banner v1\n\n# T\n\nBody $10.\n\n## Request your Free Quote\nfooter v1\n"));
  const b = cleanPage(page("banner v2 totally different\n\n# T\n\nBody $10.\n\n## Request your Free Quote\nfooter v2\n"));
  assert.equal(a.hash, b.hash);
});

// ===== PART 15: R10 amount check: lost and invented amounts are detected, dropped amounts a... =====
test("R10 amount check: lost and invented amounts are detected, dropped amounts are accounted for", () => {
  assert.equal(checkAmounts(["$1", "$2"], ["$1", "$2"], []).ok, true);
  assert.equal(checkAmounts(["$1", "$2"], ["$1"], ["$2"]).ok, true);
  const lost = checkAmounts(["$1", "$2"], ["$1"], []);
  assert.equal(lost.ok, false);
  assert.deepEqual(lost.lost, ["$2"]);
  const invented = checkAmounts(["$1"], ["$1", "$7"], []);
  assert.equal(invented.ok, false);
  assert.deepEqual(invented.invented, ["$7"]);
  const dup = checkAmounts(["$1", "$1"], ["$1"], []);
  assert.equal(dup.ok, false, "a repeated amount counts as many times as it appears");
});

// ===== PART 16: R10 amounts are read exactly as written =====
test("R10 amounts are read exactly as written", () => {
  assert.deepEqual(extractAmounts("From $18,995 or $18995; extras $3,950 to $4,250; $ 35 - $30000"), ["$18,995", "$18995", "$3,950", "$4,250", "$35", "$30000"]);
});

// ===== PART 17: R10 end to end: an amount removed on purpose is listed, the check still passes =====
test("R10 end to end: an amount removed on purpose is listed, the check still passes", () => {
  const body = ["# T", "", "## Book a consultation with X", "", "Slot price $5 today.", "", "## Real", "", "Price $10.", ""].join("\n");
  const r = cleanPage(page(body));
  assert.equal(r.report.amounts.ok, true);
  assert.deepEqual(r.report.amounts.dropped, ["$5"]);
  assert.deepEqual(r.report.amounts.cleaned, ["$10"]);
  assert.ok(r.report.dropped.some((d) => d.amounts.includes("$5")));
});

// ===== PART 18: X3 drops a Medical Center Videos item that only repeats the video titles, k... =====
test("X3 drops a Medical Center Videos item that only repeats the video titles, keeps one that adds text", () => {
  const dup = [
    "# Videos", "", "## About", "",
    "### Alpha, the first <https://x.test/video/1/1/a>", "", "Cancer", "",
    "### Beta <https://x.test/video/2/1/b>", "", "Cancer", "",
    "## Details", "",
    "- Medical Center Videos:Alpha, the first <https://x.test/video/1/1/a>, Beta <https://x.test/video/2/1/b>", "",
    "- Location: Tijuana", "",
  ].join("\n");
  const r = cleanPage(page(dup, 5));
  assert.ok(!r.text.includes("Medical Center Videos"));
  assert.ok(r.text.includes("- Video: Alpha, the first\n- Video: Beta"));
  assert.ok(r.text.includes("- Location: Tijuana"));
  assert.ok(r.report.dropped.some((d) => d.rule === "X3-video-list-duplicate"));

  const extra = dup.replace("Beta <https://x.test/video/2/1/b>", "Beta <https://x.test/video/2/1/b>, Gamma extra title");
  const k = cleanPage(page(extra, 5));
  assert.ok(k.text.includes("Gamma extra title"), "a line with text that is not a Video line is never dropped");
});
