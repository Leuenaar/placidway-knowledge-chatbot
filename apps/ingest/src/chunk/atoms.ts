/* ============================================================================
 * FILE MAP
 * FILE    : apps/ingest/src/chunk/atoms.ts
 * PURPOSE : Split a clean page into 'atoms', the smallest pieces the chunker
 *           may move: one heading line, one list item, or one paragraph. Rule
 *           C2: a table row, list item or FAQ question must not be split, so
 *           chunks are built from whole atoms.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type: one atom
 *    2. Split the page text into atoms
 *    3. Get the heading text from an atom
 *    4. Join the atoms back into text
 *    5. Split a paragraph that is too long at a sentence boundary
 * IF ASKED TO CHANGE:
 *    - Change how the text is split into atoms (PART 2)
 *    - Change how a long paragraph is split (PART 5)
 * ============================================================================ */

// ===== PART 1: Type: one atom =====
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

// ===== PART 2: Split the page text into atoms =====
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

// ===== PART 3: Get the heading text from an atom =====
/** Heading text without the #'s. */
export function headingText(a: Atom): string {
  return a.text.replace(/^#+\s+/, "").trim();
}

// ===== PART 4: Join the atoms back into text =====
/** Put atoms back into text. List items stay tight, everything else is separated by a blank line. */
export function renderAtoms(atoms: Atom[]): string {
  let out = "";
  atoms.forEach((a, i) => {
    if (i > 0) out += atoms[i - 1]!.type === "item" && a.type === "item" ? "\n" : "\n\n";
    out += a.text;
  });
  return out;
}

// ===== PART 5: Split a paragraph that is too long at a sentence boundary =====
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
