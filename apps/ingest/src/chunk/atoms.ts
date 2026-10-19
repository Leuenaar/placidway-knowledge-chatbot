/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/chunk/atoms.ts
 * TUJUAN  : Memecah halaman bersih menjadi 'atom', potongan terkecil yang
 *           boleh dipindah pemotong: satu baris judul, satu butir daftar,
 *           atau satu paragraf. Aturan C2: baris tabel, butir daftar atau
 *           pertanyaan FAQ tidak boleh terbelah, jadi chunk dibangun dari
 *           atom utuh.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: satu atom
 *    2. Memecah teks halaman menjadi atom
 *    3. Mengambil teks judul dari atom
 *    4. Menyatukan atom kembali menjadi teks
 *    5. Memecah paragraf yang terlalu panjang di batas kalimat
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah cara teks dipecah jadi atom (BAGIAN 2)
 *    - Mengubah cara paragraf panjang dipecah (BAGIAN 5)
 * ============================================================================ */

// ===== BAGIAN 1: Tipe: satu atom =====
/**
 * The cleaned page is cut into "atoms", the smallest pieces the chunker is allowed to move:
 * a heading line, one list item, or one paragraph. Rule C2 says a table row (a list item after
 * cleaning), a list item, or a FAQ question must never be split, so chunks are built from whole atoms.
 */
export interface Atom {
  type: "heading" | "item" | "para";
  /** 1 to 6 for headings, 0 otherwise. */
  level: number;
  /** The text as it appears on the page. A heading keeps its leading #'s. */
  text: string;
  /** Only for the second and later parts of one long paragraph that was split (C8). */
  overlap?: number;
}

// ===== BAGIAN 2: Memecah teks halaman menjadi atom =====
export function parseAtoms(text: string): Atom[] {
  const atoms: Atom[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) atoms.push({ type: "para", level: 0, text: para.join("\n") });
    para = [];
  };
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+\S/.exec(line);
    if (h) {
      flush();
      atoms.push({ type: "heading", level: h[1]!.length, text: line.trim() });
    } else if (line.startsWith("- ")) {
      flush();
      atoms.push({ type: "item", level: 0, text: line.trimEnd() });
    } else {
      para.push(line.trimEnd());
    }
  }
  flush();
  return atoms;
}

// ===== BAGIAN 3: Mengambil teks judul dari atom =====
/** Heading text without the #'s. */
export function headingText(a: Atom): string {
  return a.text.replace(/^#+\s+/, "").trim();
}

// ===== BAGIAN 4: Menyatukan atom kembali menjadi teks =====
/** Put atoms back into text. List items stay tight, everything else is separated by a blank line. */
export function renderAtoms(atoms: Atom[]): string {
  let out = "";
  atoms.forEach((a, i) => {
    if (i > 0) out += atoms[i - 1]!.type === "item" && a.type === "item" ? "\n" : "\n\n";
    out += a.text;
  });
  return out;
}

// ===== BAGIAN 5: Memecah paragraf yang terlalu panjang di batas kalimat =====
/** Split a paragraph that is longer than `max` at sentence ends. Each part after the first starts with the last sentence of the part before it (C8). */
export function splitLongParagraph(text: string, max: number): Atom[] {
  const sentences = (text.match(/[^.!?]+(?:[.!?]+["')\]]*)?\s*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
  const parts: Atom[] = [];
  let cur: string[] = [];
  let carry = 0;
  const len = (s: string[]) => s.join(" ").length;
  const push = () => {
    if (cur.length === 0) return;
    parts.push({ type: "para", level: 0, text: cur.join(" "), ...(carry ? { overlap: carry } : {}) });
  };
  for (const s of sentences) {
    if (cur.length > 0 && len([...cur, s]) > max) {
      push();
      const last = cur[cur.length - 1]!;
      cur = [last];
      carry = last.length + 1;
    }
    cur.push(s);
  }
  push();
  return parts;
}
