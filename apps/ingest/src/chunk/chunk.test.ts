/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/chunk/chunk.test.ts
 * PURPOSE : Unit test of the text chunker (chunk): kind rules, atoms,
 *           splitting a long paragraph, stable ids, whole FAQ, reviews one by
 *           one, videos grouped.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. kindForHeading: the order of the rules decides (R8)
 *    2. parseAtoms: headings, list items and paragraphs are separate atoms
 *    3. splitLongParagraph: parts stay under the limit and each repeats one
 *       sentence
 *    4. chunkPage: kinds, prefix, ids and date of a small package page
 *    5. chunkPage: the price header is its own chunk and keeps the amount
 *       verbatim...
 *    6. chunkPage: every FAQ chunk holds its question and its answer together
 *       (C5)
 *    7. chunkPage: a page without a full date gets page_modified null
 *    8. chunkPage: a long section is split at list items and never inside one
 *       (C2)
 *    9. chunkPage: a very long paragraph is split at sentences with one
 *       sentence of...
 *    10. chunkPage: small sections are merged into a neighbour instead of
 *        standing a...
 *    11. chunkPage: reviews are one chunk each, text before the name and date
 *        (layou...
 *    12. chunkPage: videos are grouped about 15 per chunk (C7)
 *    13. chunkPage: deterministic, same input gives byte-identical chunks and
 *        hashes
 *    14. chunkPage: a change inside one section only changes that chunk's hash
 *        (stab...
 *    15. verifyPage catches a lost sentence, a lost amount and an oversized
 *        chunk
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAtoms, splitLongParagraph } from "./atoms.js";
import { chunkPage, toIsoDate } from "./chunk.js";
import { kindForHeading } from "./kinds.js";
import { LIMITS, type PageInput } from "./types.js";
import { bodyWithoutPrefix, verifyPage } from "./verify.js";

const sentence = (n: number) => `Sentence number ${n} says something useful about the program for patients.`;
const para = (count: number, from = 1) => Array.from({ length: count }, (_, i) => sentence(from + i)).join(" ");

function page(text: string, extra: Partial<PageInput> = {}): PageInput {
  return { pageNo: 2, sourceUrl: "https://example.test/p", pageType: "package", text, h1: "Test Clinic Package", ...extra };
}

const SAMPLE = [
  "# Test Clinic Package",
  "",
  "Publish date: Oct 12, 2026",
  "",
  "## Package Price",
  "",
  "$1,000 Price starting from",
  "",
  "## Included in the Program ($1,000 USD)",
  "",
  `- Hotel: three nights in a double room. ${sentence(1)}`,
  `- Meals: all meals are included in the program. ${sentence(2)}`,
  "",
  "## Not Included",
  "",
  `- Flights: not included in the price, around $400 return. ${sentence(3)}`,
  `- Insurance: not included in the program either way. ${sentence(4)}`,
  "",
  "## Frequently Asked Questions",
  "",
  "Find answers to common questions about this program.",
  "",
  "### 1. What is it?",
  "",
  "It is a program that does useful things for patients abroad all day long.",
  "",
  "### 2. How much?",
  "",
  "It costs $1,000 for everything that is described on this page, nothing else.",
  "",
].join("\n");

// ===== PART 1: kindForHeading: the order of the rules decides (R8) =====
test("kindForHeading: the order of the rules decides (R8)", () => {
  assert.equal(kindForHeading("Included in the Out-Patient Program ($18,995 USD)"), "included");
  assert.equal(kindForHeading("Excluded Services and Contingency Costs"), "excluded");
  assert.equal(kindForHeading("Optional Specialized Procedures (Additional Cost)"), "optional");
  assert.equal(kindForHeading("Cost of Adenocarcinoma Cancer Treatment"), "price");
  assert.equal(kindForHeading("Package Price"), "price");
  assert.equal(kindForHeading("FAQs: Alternative Cancer Treatment"), "faq");
  assert.equal(kindForHeading("What Do Real Families Say About It?"), "review");
  assert.equal(kindForHeading("3-Week Typical Itinerary at ITC Tijuana"), "itinerary");
  assert.equal(kindForHeading("Risks and Important Medical Considerations"), "risks");
  assert.equal(kindForHeading("Testimonials"), "patient_story");
  assert.equal(kindForHeading("Important Disclaimer"), "disclaimer");
  assert.equal(kindForHeading("What Is Usually Included and Not Included in a Package"), undefined);
  assert.equal(kindForHeading("Something Unrelated"), undefined);
});

// ===== PART 2: parseAtoms: headings, list items and paragraphs are separate atoms =====
test("parseAtoms: headings, list items and paragraphs are separate atoms", () => {
  const atoms = parseAtoms("## Head\n\nFirst line\nsecond line\n\n- item one\n- item two\n");
  assert.deepEqual(
    atoms.map((a) => [a.type, a.text]),
    [
      ["heading", "## Head"],
      ["para", "First line\nsecond line"],
      ["item", "- item one"],
      ["item", "- item two"],
    ],
  );
});

// ===== PART 3: splitLongParagraph: parts stay under the limit and each repeats one sentence =====
test("splitLongParagraph: parts stay under the limit and each repeats one sentence", () => {
  const text = para(30);
  const parts = splitLongParagraph(text, 600);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.text.length <= 700, `part is ${p.text.length}`);
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1]!.text;
    const lastSentence = prev.slice(prev.lastIndexOf("Sentence number"));
    assert.ok(parts[i]!.text.startsWith(lastSentence), "overlap is the last sentence of the part before");
    assert.equal(parts[i]!.overlap, lastSentence.length + 1);
  }
});

// ===== PART 4: chunkPage: kinds, prefix, ids and date of a small package page =====
test("chunkPage: kinds, prefix, ids and date of a small package page", () => {
  const res = chunkPage(page(SAMPLE, { modifiedDate: "Oct 12, 2026" }));
  assert.deepEqual(res.warnings, []);
  const kinds = res.chunks.map((c) => c.kind);
  assert.ok(kinds.includes("price"));
  assert.ok(kinds.includes("included"));
  assert.ok(kinds.includes("excluded"));
  assert.ok(kinds.includes("faq"));
  for (const c of res.chunks) {
    assert.ok(c.text.startsWith(`[Page: Test Clinic Package / Type: ${c.kind} / Section: ${c.section}]\n`));
    assert.match(c.id, /^P2-[a-z_]+-\d+$/);
    assert.equal(c.page_modified, "2026-10-12");
    assert.equal(c.page_no, 2);
  }
  assert.equal(new Set(res.chunks.map((c) => c.id)).size, res.chunks.length);
  assert.deepEqual(verifyPage(page(SAMPLE), res.chunks), []);
});

// ===== PART 5: chunkPage: the price header is its own chunk and keeps the amount verbatim... =====
test("chunkPage: the price header is its own chunk and keeps the amount verbatim (C6)", () => {
  const res = chunkPage(page(SAMPLE));
  const price = res.chunks.find((c) => c.kind === "price");
  assert.ok(price);
  assert.ok(bodyWithoutPrefix(price).includes("$1,000 Price starting from"));
});

// ===== PART 6: chunkPage: every FAQ chunk holds its question and its answer together (C5) =====
test("chunkPage: every FAQ chunk holds its question and its answer together (C5)", () => {
  const res = chunkPage(page(SAMPLE));
  const faqs = res.chunks.filter((c) => c.kind === "faq");
  assert.equal(faqs.length, 2);
  assert.ok(faqs[0]!.text.includes("What is it?") && faqs[0]!.text.includes("useful things for patients"));
  assert.ok(faqs[1]!.text.includes("How much?") && faqs[1]!.text.includes("$1,000 for everything"));
  assert.ok(!faqs[1]!.text.includes("What is it?"), "the second chunk does not carry the first question");
});

// ===== PART 7: chunkPage: a page without a full date gets page_modified null =====
test("chunkPage: a page without a full date gets page_modified null", () => {
  assert.equal(chunkPage(page(SAMPLE)).chunks[0]!.page_modified, null);
  assert.equal(toIsoDate("Oct 12, 2026"), "2026-10-12");
  assert.equal(toIsoDate("Jan 5 2024"), "2024-01-05");
  assert.equal(toIsoDate(undefined), null);
  assert.equal(toIsoDate("Oct 2026"), null);
});

// ===== PART 8: chunkPage: a long section is split at list items and never inside one (C2) =====
test("chunkPage: a long section is split at list items and never inside one (C2)", () => {
  const items = Array.from({ length: 40 }, (_, i) => `- Item ${i + 1}: ${sentence(i + 1)}`);
  const text = `# Test Clinic Package\n\n## Included in the Program\n\n${items.join("\n")}\n`;
  const res = chunkPage(page(text));
  assert.ok(res.chunks.length > 1);
  const seen: string[] = [];
  for (const c of res.chunks) {
    assert.ok(c.text.length <= LIMITS.maxTotal);
    for (const line of bodyWithoutPrefix(c).split("\n")) if (line.startsWith("- Item")) seen.push(line);
  }
  assert.deepEqual(seen, items, "every item appears exactly once, whole and in order");
  assert.deepEqual(verifyPage(page(text), res.chunks), []);
});

// ===== PART 9: chunkPage: a very long paragraph is split at sentences with one sentence of... =====
test("chunkPage: a very long paragraph is split at sentences with one sentence of overlap (C8)", () => {
  const text = `# Test Clinic Package\n\n## About the Clinic\n\n${para(45)}\n`;
  const res = chunkPage(page(text));
  assert.ok(res.chunks.length >= 2);
  const withOverlap = res.chunks.filter((c) => (c.overlap_chars ?? 0) > 0);
  assert.ok(withOverlap.length >= 1, "a later chunk records the overlap");
  const first = res.chunks.find((c) => c.text.includes("Sentence number 1 "))!;
  assert.equal(first.overlap_chars, undefined, "the first part has no overlap");
  const second = withOverlap[0]!;
  const idx = res.chunks.indexOf(second);
  const prevBody = bodyWithoutPrefix({ ...res.chunks[idx - 1]!, overlap_chars: 0 });
  const carried = second.text.slice(second.text.indexOf("\n") + 1).slice(0, second.overlap_chars! - 1);
  assert.ok(prevBody.endsWith(carried), "the carried sentence is the end of the chunk before");
  for (const c of res.chunks) assert.ok(c.text.length <= LIMITS.maxTotal);
  assert.deepEqual(verifyPage(page(text), res.chunks), []);
});

// ===== PART 10: chunkPage: small sections are merged into a neighbour instead of standing a... =====
test("chunkPage: small sections are merged into a neighbour instead of standing alone (C3)", () => {
  const text = `# Test Clinic Package\n\n## About the Clinic\n\n${para(5)}\n\n## Short Note\n\nTiny note.\n\n## More About Us\n\n${para(5, 10)}\n`;
  const res = chunkPage(page(text));
  assert.ok(!res.chunks.some((c) => bodyWithoutPrefix(c).trim() === "Tiny note."), "the tiny note is not a chunk by itself");
  assert.ok(res.chunks.some((c) => c.text.includes("Tiny note.")));
  assert.deepEqual(verifyPage(page(text), res.chunks), []);
});

// ===== PART 11: chunkPage: reviews are one chunk each, text before the name and date (layou... =====
test("chunkPage: reviews are one chunk each, text before the name and date (layout A)", () => {
  const text = [
    "# Test Clinic Package",
    "",
    "## Reviews",
    "",
    `Great place. ${para(6)}`,
    "",
    "### Anna K",
    "",
    "Test ClinicJul 05 2023",
    "",
    `Very kind staff. ${para(6, 20)}`,
    "",
    "### Bob L",
    "",
    "Test ClinicAug 11 2024",
    "",
  ].join("\n");
  const res = chunkPage(page(text));
  assert.deepEqual(res.warnings, []);
  const reviews = res.chunks.filter((c) => c.kind === "review");
  assert.equal(reviews.length, 2);
  assert.ok(reviews[0]!.text.includes("Great place.") && reviews[0]!.text.includes("Anna K") && !reviews[0]!.text.includes("Very kind"));
  assert.ok(reviews[1]!.text.includes("Very kind") && reviews[1]!.text.includes("Bob L"));
  assert.ok(reviews[1]!.section.endsWith("> Bob L"));
  assert.deepEqual(verifyPage(page(text), res.chunks), []);
});

// ===== PART 12: chunkPage: videos are grouped about 15 per chunk (C7) =====
test("chunkPage: videos are grouped about 15 per chunk (C7)", () => {
  const videos = Array.from({ length: 40 }, (_, i) => `- Video: Title number ${i + 1}`);
  const text = `# Test Clinic Package\n\n## Videos\n\n${videos.join("\n")}\n`;
  const res = chunkPage(page(text));
  const vids = res.chunks.filter((c) => c.kind === "video_list");
  assert.equal(vids.length, 3);
  const counts = vids.map((c) => (c.text.match(/- Video:/g) ?? []).length);
  assert.equal(counts.reduce((a, b) => a + b, 0), 40);
  for (const n of counts) assert.ok(n <= LIMITS.videosPerChunk);
});

// ===== PART 13: chunkPage: deterministic, same input gives byte-identical chunks and hashes =====
test("chunkPage: deterministic, same input gives byte-identical chunks and hashes", () => {
  const a = JSON.stringify(chunkPage(page(SAMPLE)));
  const b = JSON.stringify(chunkPage(page(SAMPLE)));
  assert.equal(a, b);
});

// ===== PART 14: chunkPage: a change inside one section only changes that chunk's hash (stab... =====
test("chunkPage: a change inside one section only changes that chunk's hash (stable ids)", () => {
  const before = chunkPage(page(SAMPLE)).chunks;
  const after = chunkPage(page(SAMPLE.replace("three nights", "four nights"))).chunks;
  assert.deepEqual(
    before.map((c) => c.id),
    after.map((c) => c.id),
  );
  const changed = before.filter((c, i) => c.text_hash !== after[i]!.text_hash).map((c) => c.id);
  assert.equal(changed.length, 1);
  assert.match(changed[0]!, /included/);
});

// ===== PART 15: verifyPage catches a lost sentence, a lost amount and an oversized chunk =====
test("verifyPage catches a lost sentence, a lost amount and an oversized chunk", () => {
  const p = page(SAMPLE);
  const good = chunkPage(p).chunks;
  const lost = good.map((c) => ({ ...c }));
  const price = lost.find((c) => c.kind === "price")!;
  price.text = price.text.replace("$1,000 Price starting from", "Price starting from");
  const problems = verifyPage(p, lost);
  assert.ok(problems.some((x) => x.includes("reconstruction")));
  assert.ok(problems.some((x) => x.includes("$ amounts")));

  const big = good.map((c) => ({ ...c }));
  big[0]!.text += "x".repeat(2000);
  assert.ok(verifyPage(p, big).some((x) => x.includes("allowed 40 to 1800")));

  const noAnswer = good.map((c) => ({ ...c }));
  const faq = noAnswer.find((c) => c.kind === "faq")!;
  faq.text = faq.text.slice(0, faq.text.indexOf("It is a program")).trimEnd();
  assert.ok(verifyPage(p, noAnswer).some((x) => x.includes("FAQ")));
});
