/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/clean/run.ts
 * TUJUAN  : Menjalankan pembersihan untuk semua berkas mentah di sebuah
 *           folder: memeriksa jumlah halaman (7), membersihkan satu per satu,
 *           menulis hasil dan laporan.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Membersihkan semua halaman mentah dan menulis hasil serta laporan
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah folder masukan atau keluaran: lihat arg(...) di cli.ts BAGIAN
 *      5
 * ============================================================================ */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { EXPECTED_PAGE_COUNT, PAGE_TYPES } from "../pages.js";
import { cleanPage } from "./clean.js";
import { renderReportMd } from "./report.js";
import type { CleanResult } from "./types.js";
import { parseRawFile } from "./util.js";

// ===== BAGIAN 1: Membersihkan semua halaman mentah dan menulis hasil serta laporan =====
/** Read every raw page in rawDir, clean it, and write the stage files into outDir. */
export function cleanDirectory(rawDir: string, outDir: string): CleanResult[] {
  const files = readdirSync(rawDir)
    .filter((f) => /^\d{2}_.+\.txt$/.test(f))
    .sort();
  if (files.length !== EXPECTED_PAGE_COUNT) {
    throw new Error(`expected ${EXPECTED_PAGE_COUNT} raw files in ${rawDir}, found ${files.length}`);
  }
  const results = files.map((f) => {
    const pageNo = Number(f.slice(0, 2));
    if (!PAGE_TYPES[pageNo]) throw new Error(`unknown page number in file name ${f}`);
    return { file: f, result: cleanPage(parseRawFile(pageNo, readFileSync(join(rawDir, f), "utf8"))) };
  });

  mkdirSync(outDir, { recursive: true });
  const manifest = results.map(({ file, result }) => {
    const name = basename(file, ".txt") + ".md";
    writeFileSync(join(outDir, name), result.text, "utf8");
    return {
      pageNo: result.pageNo,
      file: name,
      sourceUrl: result.sourceUrl,
      pageType: PAGE_TYPES[result.pageNo],
      hash: result.hash,
      chars: result.text.length,
      meta: result.meta,
    };
  });
  const all = results.map((r) => r.result);
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  writeFileSync(join(outDir, "cleaning-report.json"), JSON.stringify(all.map((r) => r.report), null, 2) + "\n", "utf8");
  writeFileSync(join(outDir, "cleaning-report.md"), renderReportMd(all), "utf8");
  return all;
}
