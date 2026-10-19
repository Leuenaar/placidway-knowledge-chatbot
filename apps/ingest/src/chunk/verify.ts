/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/chunk/verify.ts
 * TUJUAN  : Pemeriksa hasil pemotongan: tidak ada kalimat hilang, tidak ada
 *           jumlah $ hilang atau bertambah, ukuran dan jenis sesuai, dan
 *           seluruh teks bisa disusun ulang dari chunk.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Pembantu: hapus spasi untuk membandingkan teks
 *    2. Isi chunk tanpa baris awalan dan tanpa kalimat ulangan
 *    3. Pemeriksaan utama satu halaman (daftar masalah, kosong bila baik)
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah pemeriksaan hasil pemotongan: tambah di verifyPage (BAGIAN 3)
 * ============================================================================ */

import { extractAmounts } from "../clean/util.js";
import { type Chunk, KINDS, LIMITS, type PageInput } from "./types.js";

// ===== BAGIAN 1: Pembantu: hapus spasi untuk membandingkan teks =====
const squash = (s: string) => s.replace(/\s+/g, "");

// ===== BAGIAN 2: Isi chunk tanpa baris awalan dan tanpa kalimat ulangan =====
/** The text of a chunk without its prefix line and without the sentence it repeats from the chunk before (C8). */
export function bodyWithoutPrefix(c: Chunk): string {
  const nl = c.text.indexOf("\n");
  const body = nl < 0 ? "" : c.text.slice(nl + 1);
  return body.slice(c.overlap_chars ?? 0);
}

// ===== BAGIAN 3: Pemeriksaan utama satu halaman (daftar masalah, kosong bila baik) =====
/**
 * The gates for P1 (handoff 6.3) that apply to chunks. Returns a list of problems, empty when all pass.
 * Reconstruction: the bodies joined in order must equal the cleaned page, ignoring whitespace, which
 * proves no text fell between chunks and nothing was added.
 */
export function verifyPage(page: PageInput, chunks: Chunk[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const kindSet = new Set<string>(KINDS);

  for (const c of chunks) {
    if (c.text.length < LIMITS.minTotal || c.text.length > LIMITS.maxTotal) problems.push(`${c.id}: ${c.text.length} characters, allowed ${LIMITS.minTotal} to ${LIMITS.maxTotal}`);
    if (!kindSet.has(c.kind)) problems.push(`${c.id}: unknown kind ${c.kind}`);
    if (ids.has(c.id)) problems.push(`${c.id}: duplicate id`);
    ids.add(c.id);
    if (!new RegExp(`^P${page.pageNo}-[a-z_]+-\\d+$`).test(c.id)) problems.push(`${c.id}: id does not match P${page.pageNo}-<kind>-<n>`);
    if (c.page_no !== page.pageNo) problems.push(`${c.id}: wrong page_no ${c.page_no}`);
    const prefix = `[Page: ${c.h1} / Type: ${c.kind} / Section: ${c.section}]\n`;
    if (!c.text.startsWith(prefix)) problems.push(`${c.id}: text does not start with the C4 prefix`);
    if (bodyWithoutPrefix(c).trim() === "") problems.push(`${c.id}: empty body`);
    if (c.kind === "faq") {
      // C5: the question and its answer are in the same chunk.
      const lines = bodyWithoutPrefix(c).split("\n").filter((l) => l.trim() !== "");
      const q = lines.findIndex((l) => /\?\s*$/.test(l));
      if (q < 0) problems.push(`${c.id}: FAQ chunk has no question`);
      else if (lines.slice(q + 1).join(" ").trim().length < 20) problems.push(`${c.id}: FAQ question has no answer after it`);
    }
  }

  const rebuilt = chunks.map(bodyWithoutPrefix).join("\n\n");
  if (squash(rebuilt) !== squash(page.text)) {
    const a = squash(rebuilt);
    const b = squash(page.text);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    problems.push(`reconstruction differs from the cleaned page at character ${i}: chunks "${a.slice(i, i + 40)}" vs page "${b.slice(i, i + 40)}"`);
  }

  const want = extractAmounts(page.text).sort();
  const have = chunks.flatMap((c) => extractAmounts(bodyWithoutPrefix(c))).sort();
  if (want.join("|") !== have.join("|")) problems.push(`$ amounts differ: page has ${want.length}, chunks have ${have.length}`);
  return problems;
}
