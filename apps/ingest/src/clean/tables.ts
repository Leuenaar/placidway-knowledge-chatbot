/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/clean/tables.ts
 * TUJUAN  : Mengubah tabel markdown di halaman mentah menjadi kalimat (aturan
 *           R5): tiap baris tabel jadi satu kalimat, kolom 'Actions' dan
 *           kolom kosong dibuang, kolom pertama jadi nama baris kecuali
 *           isinya uang (tabel harga halaman 1).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: sel tabel
 *    2. Tipe: info barang yang dibuang
 *    3. Tipe: hasil konversi satu tabel
 *    4. Apakah baris ini awal tabel
 *    5. Membaca sel-sel tabel
 *    6. Nilai satu sel
 *    7. Pola uang dan kolom noise
 *    8. Pembantu: akhiri kalimat dengan tanda baca
 *    9. Konversi satu tabel menjadi kalimat
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah cara tabel ditulis jadi kalimat (BAGIAN 9)
 * ============================================================================ */

import type { Line } from "./types.js";
import { extractAmounts, stripUrls } from "./util.js";

// ===== BAGIAN 1: Tipe: sel tabel =====
/**
 * R5: turn the crawler's table layout into one sentence per row.
 *
 * The crawler writes a table as a run of lines that start with "|". One line = one cell, and a cell
 * may continue on the lines below it (a bulleted list, or a note such as "Modified date ...") with
 * blank lines in between. A row is simply the next N cells, where N is the number of cells in the
 * header, which are the leading "|" lines with no blank line between them.
 */
interface Cell {
  n: number;
  text: string[];
  items: string[];
}

// ===== BAGIAN 2: Tipe: info barang yang dibuang =====
export interface DropInfo {
  rule: string;
  line: number;
  preview: string;
  amounts: string[];
}

// ===== BAGIAN 3: Tipe: hasil konversi satu tabel =====
export interface TableConversion {
  /** Index in the input array of the first line after the table. */
  next: number;
  rows: Line[];
  drops: DropInfo[];
  urlsRemoved: number;
  warnings: string[];
}

// ===== BAGIAN 4: Apakah baris ini awal tabel =====
export function isTableStart(lines: Line[], i: number): boolean {
  const cur = lines[i];
  if (!cur || !cur.t.startsWith("|")) return false;
  return i === 0 || (lines[i - 1]?.t.trim() ?? "") === "";
}

// ===== BAGIAN 5: Membaca sel-sel tabel =====
function parseCells(lines: Line[], start: number): { cells: Cell[]; ncols: number; next: number } {
  let ncols = 0;
  for (let k = start; k < lines.length && lines[k]!.t.startsWith("|"); k++) ncols++;

  const cells: Cell[] = [];
  let cur: Cell | null = null;
  let lastUsed = start;
  let j = start;
  while (j < lines.length) {
    const raw = lines[j]!;
    const t = raw.t;
    if (t.startsWith("|")) {
      cur = { n: raw.n, text: [], items: [] };
      const rest = t.slice(1).trim();
      if (rest) cur.text.push(rest);
      cells.push(cur);
      lastUsed = j;
      j++;
      continue;
    }
    if (t.trim() === "") {
      j++;
      continue;
    }
    if (!cur) break;
    if (/^#/.test(t)) break;
    if (t.trim() === "-") {
      const nxt = lines[j + 1];
      if (nxt && nxt.t.trim() !== "" && !/^(\||#|-\s*$)/.test(nxt.t.trim())) {
        cur.items.push(nxt.t.trim());
        lastUsed = j + 1;
        j += 2;
      } else {
        lastUsed = j;
        j++;
      }
      continue;
    }
    // Plain text: part of the current cell only if more cells follow it ("Modified date ..." notes).
    let m = j;
    while (m + 1 < lines.length && lines[m + 1]!.t.trim() !== "" && !/^(\||#)/.test(lines[m + 1]!.t)) m++;
    let k = m + 1;
    while (k < lines.length && lines[k]!.t.trim() === "") k++;
    if (k < lines.length && lines[k]!.t.startsWith("|")) {
      for (let q = j; q <= m; q++) cur.text.push(lines[q]!.t.trim());
      lastUsed = m;
      j = m + 1;
      continue;
    }
    break;
  }
  return { cells, ncols, next: lastUsed + 1 };
}

// ===== BAGIAN 6: Nilai satu sel =====
function cellValue(c: Cell): { value: string; urls: number } {
  const parts = [...c.text];
  if (c.items.length) parts.push(c.items.join(", "));
  const joined = parts.join(" ");
  const s = stripUrls(joined);
  const value = s.text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*Modified date\s+([A-Z][a-z]{2} \d{1,2}, \d{4})$/, " (modified date $1)");
  return { value, urls: s.removed };
}

// ===== BAGIAN 7: Pola uang dan kolom noise =====
const MONEY = /^(\$\s?\d|\d[\d,.]*\s*(USD|\$))/i;
const NOISE_COLUMNS = /^(actions?)$/i;

// ===== BAGIAN 8: Pembantu: akhiri kalimat dengan tanda baca =====
function sentenceEnd(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

// ===== BAGIAN 9: Konversi satu tabel menjadi kalimat =====
export function convertTable(lines: Line[], start: number): TableConversion {
  const { cells, ncols, next } = parseCells(lines, start);
  const out: TableConversion = { next, rows: [], drops: [], urlsRemoved: 0, warnings: [] };
  const firstN = lines[start]!.n;

  if (ncols < 2 || cells.length < ncols * 2 || cells.length % ncols !== 0) {
    // Unknown shape: keep every cell as plain text so nothing is lost, and say so.
    out.warnings.push(`table at line ${firstN}: ${cells.length} cells do not fit ${ncols} columns, kept as plain lines`);
    for (const c of cells) {
      const v = cellValue(c);
      out.urlsRemoved += v.urls;
      if (v.value) out.rows.push({ n: c.n, t: `- ${v.value}` });
    }
    return out;
  }

  const values = cells.map((c) => {
    const v = cellValue(c);
    out.urlsRemoved += v.urls;
    return v.value;
  });
  const headers = values.slice(0, ncols);
  const body: string[][] = [];
  const rowStart: number[] = [];
  for (let r = ncols; r < values.length; r += ncols) {
    body.push(values.slice(r, r + ncols));
    rowStart.push(cells[r]!.n);
  }

  // A column is noise when it is an "Actions" column or empty in every row.
  const noise = headers.map((h, c) => NOISE_COLUMNS.test(h) || body.every((row) => (row[c] ?? "") === ""));
  // The first column names the row unless its values are money (the page 1 price table).
  const firstValues = body.map((row) => row[0] ?? "").filter((v) => v !== "");
  const hasLabel = firstValues.length > 0 && !firstValues.every((v) => MONEY.test(v));

  body.forEach((row, ri) => {
    const label = hasLabel ? (row[0] ?? "") : "";
    const line = rowStart[ri]!;
    const noiseValues = row.filter((v, c) => noise[c] && v !== "");
    if (noiseValues.length) {
      out.drops.push({
        rule: "R5-noise-column",
        line,
        preview: noiseValues.join(" | ").slice(0, 100),
        amounts: extractAmounts(noiseValues.join(" ")),
      });
    }
    if (hasLabel && label === "") {
      const rest = row.filter((v, c) => c !== 0 && !noise[c] && v !== "");
      out.drops.push({
        rule: "R5-unnamed-row",
        line,
        preview: `row with no name: ${rest.join(" | ")}`.slice(0, 100),
        amounts: extractAmounts(rest.join(" ")),
      });
      return;
    }
    const parts: { h: string; v: string }[] = [];
    row.forEach((v, c) => {
      if (noise[c] || v === "") return;
      if (hasLabel && c === 0) return;
      if (hasLabel && v === label) return; // "Details" repeating the row name adds nothing
      parts.push({ h: headers[c] ?? "", v });
    });
    if (parts.length === 0) return;
    let sentence: string;
    if (hasLabel && parts.length === 1) {
      const p = parts[0]!;
      sentence = `${label}: ${p.v} (${p.h})`;
    } else {
      const body = parts.map((p) => `${p.h}: ${p.v}`).join("; ");
      sentence = hasLabel ? `${label}: ${body}` : body;
    }
    out.rows.push({ n: line, t: `- ${sentenceEnd(sentence)}` });
  });
  return out;
}
