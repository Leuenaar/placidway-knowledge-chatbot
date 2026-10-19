/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/chunk/chunk.gates.test.ts
 * TUJUAN  : Uji gerbang pemotong pada 7 halaman asli: ukuran, jumlah, setiap
 *           jumlah $ ada tepat di satu chunk, FAQ, video, ulasan, tanggal,
 *           hasil identik dua kali jalan.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. gate 6.3: every page passes verifyPage (sizes, kinds, ids, prefix, FAQ, rec...
 *    2. gate: no warnings on the real pages (every review and FAQ layout was recogn...
 *    3. gate: no chunk is longer than 1800 or shorter than 40 characters, bodies st...
 *    4. gate: the number of chunks is in the expected range and ids are unique acro...
 *    5. gate: every $ amount of the cleaned pages is in exactly one chunk, nothing...
 *    6. gate: each package page has the price header chunk and both programme price...
 *    7. gate: FAQ counts and every FAQ chunk has a question and an answer in the sa...
 *    8. gate: all 123 video titles are present, none twice, about 15 per chunk
 *    9. gate: reviews and patient stories are one unit per chunk with the reviewer...
 *    10. gate: page_modified is a real date only where the page has one
 *    11. gate: chunking twice gives byte-identical output (stable ids and hashes)
 *    12. gate: ids are stable when text inside one section changes
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { cleanPage } from "../clean/clean.js";
import { extractAmounts, parseRawFile } from "../clean/util.js";
import { PAGE_TYPES } from "../pages.js";
import { chunkPage } from "./chunk.js";
import { type Chunk, LIMITS, type PageInput } from "./types.js";
import { bodyWithoutPrefix, verifyPage } from "./verify.js";

/**
 * Gates for P1 (handoff 6.3) on the seven real pages: raw -> clean -> chunk, all in memory.
 * data/raw is not committed, so without it the tests are skipped and a fresh clone still passes `npm test`.
 */
const rawDir = resolve(fileURLToPath(new URL("../../../../data/raw", import.meta.url)));
const skip = !existsSync(rawDir) || readdirSync(rawDir).filter((f) => /^\d{2}_.+\.txt$/.test(f)).length !== 7;
const opts = { skip: skip ? "data/raw is not present" : false };

interface Built {
  page: PageInput;
  chunks: Chunk[];
  warnings: string[];
}

function build(): Built[] {
  const out: Built[] = [];
  for (const f of readdirSync(rawDir).filter((x) => /^\d{2}_.+\.txt$/.test(x)).sort()) {
    const pageNo = Number(f.slice(0, 2));
    const cleaned = cleanPage(parseRawFile(pageNo, readFileSync(join(rawDir, f), "utf8")));
    const page: PageInput = {
      pageNo,
      sourceUrl: cleaned.sourceUrl,
      pageType: PAGE_TYPES[pageNo]!,
      text: cleaned.text,
      h1: cleaned.meta.h1,
      ...(cleaned.meta.modifiedDate ? { modifiedDate: cleaned.meta.modifiedDate } : {}),
    };
    const res = chunkPage(page);
    out.push({ page, chunks: res.chunks, warnings: res.warnings });
  }
  return out;
}

const built = skip ? [] : build();
const get = (n: number): Built => {
  const b = built.find((x) => x.page.pageNo === n);
  assert.ok(b, `page ${n} missing`);
  return b;
};
const all = built.flatMap((b) => b.chunks);

// ===== BAGIAN 1: gate 6.3: every page passes verifyPage (sizes, kinds, ids, prefix, FAQ, rec... =====
test("gate 6.3: every page passes verifyPage (sizes, kinds, ids, prefix, FAQ, reconstruction, $ amounts)", opts, () => {
  assert.equal(built.length, 7);
  for (const b of built) assert.deepEqual(verifyPage(b.page, b.chunks), [], `page ${b.page.pageNo}`);
});

// ===== BAGIAN 2: gate: no warnings on the real pages (every review and FAQ layout was recogn... =====
test("gate: no warnings on the real pages (every review and FAQ layout was recognised)", opts, () => {
  for (const b of built) assert.deepEqual(b.warnings, [], `page ${b.page.pageNo}`);
});

// ===== BAGIAN 3: gate: no chunk is longer than 1800 or shorter than 40 characters, bodies st... =====
test("gate: no chunk is longer than 1800 or shorter than 40 characters, bodies stay within 1500", opts, () => {
  for (const c of all) {
    assert.ok(c.text.length >= LIMITS.minTotal && c.text.length <= LIMITS.maxTotal, `${c.id}: ${c.text.length}`);
    assert.ok(bodyWithoutPrefix(c).length <= 1500, `${c.id}: body ${bodyWithoutPrefix(c).length}`);
  }
});

// ===== BAGIAN 4: gate: the number of chunks is in the expected range and ids are unique acro... =====
test("gate: the number of chunks is in the expected range and ids are unique across pages", opts, () => {
  assert.ok(all.length >= 120 && all.length <= 200, `got ${all.length}`);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length);
  assert.equal(new Set(all.map((c) => c.text_hash)).size > all.length * 0.95, true, "almost all texts are different");
});

// ===== BAGIAN 5: gate: every $ amount of the cleaned pages is in exactly one chunk, nothing... =====
test("gate: every $ amount of the cleaned pages is in exactly one chunk, nothing added", opts, () => {
  for (const b of built) {
    const want = extractAmounts(b.page.text).sort();
    const have = b.chunks.flatMap((c) => extractAmounts(bodyWithoutPrefix(c))).sort();
    assert.deepEqual(have, want, `page ${b.page.pageNo}`);
  }
});

// ===== BAGIAN 6: gate: each package page has the price header chunk and both programme price... =====
test("gate: each package page has the price header chunk and both programme prices in the right kinds", opts, () => {
  for (const n of [2, 3, 4]) {
    const { chunks } = get(n);
    const header = chunks.find((c) => c.section === "Package Price");
    assert.ok(header && header.kind === "price" && header.text.includes("$18,995"), `page ${n} price header`);
    assert.ok(chunks.some((c) => c.kind === "included" && c.text.includes("$18,995")), `page ${n} out-patient included`);
    assert.ok(chunks.some((c) => c.kind === "included" && c.text.includes("$30,000")), `page ${n} in-patient included`);
    assert.ok(chunks.some((c) => c.kind === "excluded"), `page ${n} excluded`);
    assert.ok(chunks.some((c) => c.kind === "optional"), `page ${n} optional`);
    assert.ok(chunks.some((c) => c.kind === "itinerary"), `page ${n} itinerary`);
  }
});

// ===== BAGIAN 7: gate: FAQ counts and every FAQ chunk has a question and an answer in the sa... =====
test("gate: FAQ counts and every FAQ chunk has a question and an answer in the same chunk", opts, () => {
  const expected: Record<number, number> = { 1: 7, 2: 8, 3: 8, 4: 8, 7: 12 };
  for (const [n, count] of Object.entries(expected)) {
    assert.equal(get(Number(n)).chunks.filter((c) => c.kind === "faq").length, count, `page ${n}`);
  }
  for (const c of all.filter((x) => x.kind === "faq")) {
    const lines = bodyWithoutPrefix(c).split("\n").filter((l) => l.trim());
    const q = lines.findIndex((l) => l.trim().endsWith("?"));
    assert.ok(q >= 0, `${c.id} has a question`);
    assert.ok(lines.slice(q + 1).join(" ").length >= 20, `${c.id} has an answer`);
  }
});

// ===== BAGIAN 8: gate: all 123 video titles are present, none twice, about 15 per chunk =====
test("gate: all 123 video titles are present, none twice, about 15 per chunk", opts, () => {
  const vids = get(5).chunks.filter((c) => c.kind === "video_list");
  const titles = vids.flatMap((c) => bodyWithoutPrefix(c).split("\n").filter((l) => l.startsWith("- Video:")));
  assert.equal(titles.length, 123);
  assert.equal(new Set(titles).size, 123);
  for (const c of vids) assert.ok((bodyWithoutPrefix(c).match(/- Video:/g) ?? []).length <= 15, c.id);
});

// ===== BAGIAN 9: gate: reviews and patient stories are one unit per chunk with the reviewer... =====
test("gate: reviews and patient stories are one unit per chunk with the reviewer in the section", opts, () => {
  for (const n of [1, 5, 6]) {
    const reviews = get(n).chunks.filter((c) => c.kind === "review");
    assert.equal(reviews.length, 3, `page ${n}`);
    for (const r of reviews) assert.match(r.section, / > [A-Z][a-z]+ [A-Z]$/, `${r.id}: ${r.section}`);
  }
  assert.equal(get(7).chunks.filter((c) => c.kind === "review").length, 3);
  assert.equal(get(1).chunks.filter((c) => c.kind === "patient_story").length, 5);
});

// ===== BAGIAN 10: gate: page_modified is a real date only where the page has one =====
test("gate: page_modified is a real date only where the page has one", opts, () => {
  for (const c of get(1).chunks) assert.equal(c.page_modified, "2026-10-12");
  for (const c of all) assert.ok(c.page_modified === null || /^\d{4}-\d{2}-\d{2}$/.test(c.page_modified), c.id);
});

// ===== BAGIAN 11: gate: chunking twice gives byte-identical output (stable ids and hashes) =====
test("gate: chunking twice gives byte-identical output (stable ids and hashes)", opts, () => {
  const again = build().flatMap((b) => b.chunks);
  assert.equal(JSON.stringify(again), JSON.stringify(all));
});

// ===== BAGIAN 12: gate: ids are stable when text inside one section changes =====
test("gate: ids are stable when text inside one section changes", opts, () => {
  const b = get(2);
  const edited = chunkPage({ ...b.page, text: b.page.text.replace("Out-patient", "Outpatient") });
  assert.deepEqual(
    edited.chunks.map((c) => c.id),
    b.chunks.map((c) => c.id),
  );
});
