/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/components/RichText.tsx
 * TUJUAN  : Menampilkan teks balasan. Hanya dua hal dipahami: **tebal** dan
 *           butir daftar '- '. Tanpa pustaka Markdown karena teks datang dari
 *           model dan tidak boleh bisa menyuntik HTML, tautan atau gambar.
 *           Penampil ini hanya membangun elemen React (tanpa innerHTML); apa
 *           pun yang tidak dikenal tampil sebagai teks biasa.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Memecah teks menjadi paragraf dan daftar
 *    3. Mengubah **tebal** menjadi <strong>
 *    4. Komponen penampil
 * KALAU DIMINTA MENGUBAH:
 *    - Mengizinkan format baru (misalnya miring): ubah inline (BAGIAN 3)
 *      dengan hati-hati karena aturan keamanan
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/**
 * Renders reply text. Only two things are understood: **bold** and "- " list items.
 *
 * Why not a full Markdown library: the text comes from a model, so it must never be able to
 * inject HTML, links or images. This renderer builds React elements only (no innerHTML), and
 * anything it does not recognise is shown as plain text.
 */
import { Fragment, type ReactNode } from "react";

type Block = { kind: "paragraph"; lines: string[] } | { kind: "list"; items: string[] };

// ===== BAGIAN 2: Memecah teks menjadi paragraf dan daftar =====
/** Splits text into paragraphs and bullet lists. Blank lines separate blocks. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    let current: Block | null = null;
    for (const line of chunk.split("\n")) {
      const bullet = /^\s*-\s+(.*)$/.exec(line);
      if (bullet) {
        if (current?.kind !== "list") {
          current = { kind: "list", items: [] };
          blocks.push(current);
        }
        current.items.push(bullet[1] ?? "");
      } else if (line.trim() !== "") {
        if (current?.kind !== "paragraph") {
          current = { kind: "paragraph", lines: [] };
          blocks.push(current);
        }
        current.lines.push(line);
      }
    }
  }
  return blocks;
}

// ===== BAGIAN 3: Mengubah **tebal** menjadi <strong> =====
/** Turns **bold** into <strong>. An unmatched ** stays as literal text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

// ===== BAGIAN 4: Komponen penampil =====
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseBlocks(text).map((block, index) =>
        block.kind === "list" ? (
          // dir="auto" per block, so a right-to-left reply that quotes English still lays out correctly.
          <ul key={index} dir="auto">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={index} dir="auto">
            {block.lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </>
  );
}
