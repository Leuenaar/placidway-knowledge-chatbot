/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/chunk/chunk.ts
 * TUJUAN  : Pemotong satu halaman bersih. Mengimplementasikan aturan C1
 *           sampai C9 dan R8. Tiga langkah: bagi per judul '## ' (C1), ubah
 *           tiap bagian jadi potongan (satu per pertanyaan FAQ, ulasan, kisah
 *           pasien, kelompok ~15 video, atau berdasar ukuran), gabungkan
 *           potongan di bawah 200 karakter ke tetangga (C3), lalu beri nomor
 *           (C8). Fungsi murni: halaman sama selalu menghasilkan chunk, id
 *           dan hash sama.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: peran potongan (fixed, unit, text, tail) dan bentuk Piece
 *    2. Konstanta: nama bagian header, bulan, dan pembantu awalan
 *    3. Pengumpul peringatan
 *    4. Pemecahan berdasar ukuran (C2)
 *    5. FAQ: satu potongan per pertanyaan beserta jawabannya (C5)
 *    6. Jenis bagian: FAQ, ulasan, kisah pasien, video, umum
 *    7. Ulasan: satu potongan per ulasan (teks sebelum nama dan tanggal)
 *    8. Kisah pasien: satu potongan per kisah (C5)
 *    9. Video: sekitar 15 judul per chunk (C7)
 *    10. Bagian umum: berdasar ukuran, Included/Not included selalu dipisah
 *    11. Menggabungkan potongan kecil ke tetangga (C3)
 *    12. Fungsi publik: chunkPage dan toIsoDate
 *    13. chunkPage: dari satu halaman ke daftar chunk (C1, C8)
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah cara FAQ dipotong (BAGIAN 6)
 *    - Mengubah ukuran gabung chunk kecil (200 karakter) (BAGIAN 11)
 *    - Mengubah format id chunk (contoh P2-faq-3) (BAGIAN 13)
 *    - Mengubah jumlah video per chunk (BAGIAN 9)
 * ============================================================================ */

import { sha256 } from "../clean/util.js";
import { type Atom, headingText, parseAtoms, renderAtoms, splitLongParagraph } from "./atoms.js";
import { kindForHeading } from "./kinds.js";
import { type Chunk, type ChunkResult, type Kind, LIMITS, type PageInput } from "./types.js";

// ===== BAGIAN 1: Tipe: peran potongan (fixed, unit, text, tail) dan bentuk Piece =====
/**
 * Chunker for one cleaned page. Implements C1 to C9 and R8 (kind tags).
 *
 * The page is cut in three steps:
 *   1. Split into sections at "## " headings (C1). The text before the first one is the page header.
 *   2. Turn each section into pieces: one per FAQ question, per review, per patient story, per group of
 *      about 15 videos, or by size at ### / #### headings and paragraph boundaries (C2, C5, C7).
 *   3. Merge pieces shorter than 200 characters into a neighbour (C3), then number the chunks (C8).
 *
 * The function is pure: the same page always gives the same chunks, ids and hashes.
 */
type Role =
  /** Never merged: page header, price header, videos, disclaimer, continuation of a split paragraph. */
  | "fixed"
  /** One FAQ question, review or patient story. Never merged with another unit, but may absorb a small text piece. */
  | "unit"
  /** Ordinary text. Merged into a neighbour when shorter than 200 characters. */
  | "text"
  /** Text after the last review of a section. Prefers to merge backwards. */
  | "tail";

interface Piece {
  kind: Kind;
  /** The ## heading of the section. */
  section: string;
  /** The ### heading or question this piece starts with, if any. */
  sub?: string;
  atoms: Atom[];
  role: Role;
  prefer?: "prev" | "next";
}

// ===== BAGIAN 2: Konstanta: nama bagian header, bulan, dan pembantu awalan =====
const HEADER_SECTION = "Page details";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const label = (p: Piece) => (p.sub ? `${p.section} > ${p.sub}` : p.section);
const bodyOf = (p: Piece) => renderAtoms(p.atoms);
const prefixOf = (h1: string, kind: Kind, section: string) => `[Page: ${h1} / Type: ${kind} / Section: ${section}]`;

// ===== BAGIAN 3: Pengumpul peringatan =====
class Warnings {
  list: string[] = [];
  add(m: string) {
    this.list.push(m);
  }
}

// ===== BAGIAN 4: Pemecahan berdasar ukuran (C2) =====
// ---------------------------------------------------------------------------------------------
// Size based splitting (C2)
// ---------------------------------------------------------------------------------------------

interface Group {
  atoms: Atom[];
  sub?: string;
}

/**
 * Cut `atoms` into groups of at most `budget` characters. Split at headings of `level` first, then
 * deeper headings, then at paragraph or list item boundaries, and only as a last resort inside a paragraph.
 */
function packAtoms(atoms: Atom[], budget: number, level: number, sub: string | undefined, warn: Warnings, where: string): Group[] {
  if (atoms.length === 0) return [];
  if (renderAtoms(atoms).length <= budget) return [{ atoms, sub }];

  if (level <= 6) {
    const cuts = atoms.flatMap((a, i) => (a.type === "heading" && a.level === level && i > 0 ? [i] : []));
    const starts = atoms[0]!.type === "heading" && atoms[0]!.level === level ? [0, ...cuts] : cuts.length ? [0, ...cuts] : [];
    if (starts.length > 0) {
      const groups: Group[] = [];
      starts.forEach((s, k) => {
        const seg = atoms.slice(s, starts[k + 1] ?? atoms.length);
        const head = seg[0]!;
        const segSub = head.type === "heading" && head.level === level ? headingText(head) : sub;
        groups.push(...packAtoms(seg, budget, level + 1, segSub, warn, where));
      });
      return groups;
    }
    return packAtoms(atoms, budget, level + 1, sub, warn, where);
  }

  // No headings left: fill groups paragraph by paragraph or item by item.
  const groups: Group[] = [];
  let cur: Atom[] = [];
  const close = () => {
    if (cur.length) groups.push({ atoms: cur, sub });
    cur = [];
  };
  for (const a of atoms) {
    if (a.type === "para" && a.text.length > budget) {
      close();
      warn.add(`${where}: a paragraph of ${a.text.length} characters was split at sentence ends (C8 overlap used)`);
      for (const part of splitLongParagraph(a.text, budget)) groups.push({ atoms: [part], sub });
      continue;
    }
    if (cur.length && renderAtoms([...cur, a]).length > budget) close();
    cur.push(a);
  }
  close();
  return groups;
}

function piecesFromGroups(groups: Group[], section: string, kind: Kind, role: Role): Piece[] {
  return groups.map((g, i) => {
    const first = g.atoms[0]!;
    const continuation = first.type === "para" && (first.overlap ?? 0) > 0;
    const sub = g.sub;
    return {
      kind: sub ? (kindForHeading(sub) ?? kind) : kind,
      section,
      ...(sub ? { sub } : {}),
      atoms: g.atoms,
      role: continuation ? "fixed" : role,
      prefer: i === 0 ? "next" : undefined,
    } as Piece;
  });
}

// ===== BAGIAN 5: FAQ: satu potongan per pertanyaan beserta jawabannya (C5) =====

// ===== BAGIAN 6: Jenis bagian: FAQ, ulasan, kisah pasien, video, umum =====
// ---------------------------------------------------------------------------------------------
// Section types
// ---------------------------------------------------------------------------------------------
/** FAQ: one piece per question with its answer (C5). Questions are ### headings, or plain paragraphs ending in "?". */
function faqPieces(h2: string, atoms: Atom[], warn: Warnings): Piece[] {
  const rest = atoms.slice(1);
  const headStarts = rest.flatMap((a, i) => (a.type === "heading" && a.level === 3 ? [i] : []));
  const plainStarts = rest.flatMap((a, i) => (a.type === "para" && /\?$/.test(a.text) && a.text.length <= 250 ? [i] : []));
  const starts = headStarts.length > 0 ? headStarts : plainStarts;
  if (starts.length === 0) return piecesFromGroups(packAtoms(atoms, LIMITS.softBody, 3, undefined, warn, h2), h2, "faq", "text");

  // The heading and any intro text go in front of the first question, so every FAQ chunk holds a question and its answer.
  const out: Piece[] = [];
  const intro = [atoms[0]!, ...rest.slice(0, starts[0])];
  starts.forEach((s, k) => {
    const seg = rest.slice(s, starts[k + 1] ?? rest.length);
    const q = seg[0]!;
    const sub = q.type === "heading" ? headingText(q) : q.text;
    const withIntro = k === 0 ? [...intro, ...seg] : seg;
    const groups = packAtoms(withIntro, LIMITS.softBody, 4, sub, warn, `${h2} > ${sub}`);
    groups.forEach((g, gi) => out.push({ kind: "faq", section: h2, sub, atoms: g.atoms, role: gi === 0 ? "unit" : "fixed" }));
  });
  return out;
}

// ===== BAGIAN 7: Ulasan: satu potongan per ulasan (teks sebelum nama dan tanggal) =====
// No \b before the month: the crawler glues the clinic name to the date ("Immunity Therapy CenterJul 05 2023").
const REVIEW_DATE = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2},? \d{4}$/;

/**
 * Reviews: one piece per review (C5, C7). Two layouts exist on the pages:
 *   A (pages 1, 5, 6): review text, then "### Name", then a line ending in a date. The name comes AFTER the text.
 *   B (page 7):        a quote, then an attribution item such as "- luka (Verified by PlacidWay)".
 */
function reviewPieces(h2: string, atoms: Atom[], warn: Warnings): Piece[] {
  const rest = atoms.slice(1);
  const out: Piece[] = [];
  let buf: Atom[] = [atoms[0]!];
  let first = true;
  const unit = (sub: string | undefined, a: Atom[]) => {
    out.push({ kind: "review", section: h2, ...(sub ? { sub } : {}), atoms: a, role: "unit", ...(first ? { prefer: "next" as const } : {}) });
    first = false;
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    const nxt = rest[i + 1];
    if (a.type === "heading" && a.level === 3 && nxt && nxt.type === "para" && REVIEW_DATE.test(nxt.text)) {
      unit(headingText(a), [...buf, a, nxt]);
      buf = [];
      i++;
    } else if (a.type === "item" && /\(Verified by /.test(a.text)) {
      unit(undefined, [...buf, a]);
      buf = [];
    } else {
      buf.push(a);
    }
  }
  if (out.length === 0) {
    warn.add(`${h2}: no review layout recognised, split by size`);
    return piecesFromGroups(packAtoms(atoms, LIMITS.softBody, 3, undefined, warn, h2), h2, "review", "text");
  }
  if (buf.length > 0) out.push({ kind: "overview", section: h2, sub: "Medical center details", atoms: buf, role: "tail", prefer: "prev" });
  return out;
}

// ===== BAGIAN 8: Kisah pasien: satu potongan per kisah (C5) =====
/** Patient stories: one piece per story, which starts at a #### heading that has text under it (C5). */
function storyPieces(h2: string, atoms: Atom[], warn: Warnings): Piece[] {
  const rest = atoms.slice(1);
  const starts = rest.flatMap((a, i) => {
    const nxt = rest[i + 1];
    return a.type === "heading" && a.level === 4 && nxt && nxt.type !== "heading" ? [i] : [];
  });
  if (starts.length === 0) {
    warn.add(`${h2}: no story headings recognised, split by size`);
    return piecesFromGroups(packAtoms(atoms, LIMITS.softBody, 3, undefined, warn, h2), h2, "patient_story", "text");
  }
  const out: Piece[] = [];
  const intro = [atoms[0]!, ...rest.slice(0, starts[0])];
  piecesFromGroups(packAtoms(intro, LIMITS.softBody, 3, undefined, warn, h2), h2, "patient_story", "text").forEach((p) => out.push(p));
  starts.forEach((s, k) => {
    const seg = rest.slice(s, starts[k + 1] ?? rest.length);
    const sub = headingText(seg[0]!);
    packAtoms(seg, LIMITS.softBody, 5, sub, warn, `${h2} > ${sub}`).forEach((g, gi) =>
      out.push({ kind: "patient_story", section: h2, sub, atoms: g.atoms, role: gi === 0 ? "unit" : "fixed" }),
    );
  });
  return out;
}

// ===== BAGIAN 9: Video: sekitar 15 judul per chunk (C7) =====
/** Videos: about 15 titles per chunk, spread evenly (C7). */
function videoPieces(h2: string, atoms: Atom[]): Piece[] {
  const items = atoms.slice(1);
  const chars = renderAtoms(items).length;
  const n = Math.max(Math.ceil(items.length / LIMITS.videosPerChunk), Math.ceil(chars / (LIMITS.softBody - 100)));
  const out: Piece[] = [];
  for (let g = 0; g < n; g++) {
    const from = Math.floor((g * items.length) / n);
    const to = Math.floor(((g + 1) * items.length) / n);
    out.push({
      kind: "video_list",
      section: h2,
      sub: `Videos ${from + 1} to ${to}`,
      atoms: g === 0 ? [atoms[0]!, ...items.slice(from, to)] : items.slice(from, to),
      role: "fixed",
    });
  }
  return out;
}

// ===== BAGIAN 10: Bagian umum: berdasar ukuran, Included/Not included selalu dipisah =====
/** Everything else: by size, but a section whose ### parts have different kinds (Included / Not included) is always split there. */
function genericPieces(h2: string, atoms: Atom[], kind: Kind, warn: Warnings): Piece[] {
  const disc = atoms.findIndex((a) => a.type === "para" && /^important disclaimer$/i.test(a.text.trim()));
  if (disc > 0) {
    const before = genericPieces(h2, atoms.slice(0, disc), kind, warn);
    const rest: Piece = { kind: "disclaimer", section: h2, sub: "Important Disclaimer", atoms: atoms.slice(disc), role: "fixed" };
    return [...before, rest];
  }
  const childKinds = new Set(atoms.filter((a) => a.type === "heading" && a.level === 3).map((a) => kindForHeading(headingText(a))).filter(Boolean));
  const budget = kind === "price" ? LIMITS.priceBody : LIMITS.softBody;
  const forceSplit = childKinds.size >= 2;
  let groups: Group[];
  if (forceSplit) {
    const cuts = atoms.flatMap((a, i) => (a.type === "heading" && a.level === 3 ? [i] : []));
    const starts = cuts[0] === 0 ? cuts : [0, ...cuts];
    groups = starts.flatMap((s, k) => {
      const seg = atoms.slice(s, starts[k + 1] ?? atoms.length);
      const head = seg[0]!;
      const sub = head.type === "heading" && head.level === 3 ? headingText(head) : undefined;
      return packAtoms(seg, budget, 4, sub, warn, h2);
    });
  } else {
    groups = packAtoms(atoms, budget, 3, undefined, warn, h2);
  }
  return piecesFromGroups(groups, h2, kind, "text");
}

function sectionPieces(h2: string, atoms: Atom[], warn: Warnings): Piece[] {
  const rest = atoms.slice(1);
  if (/^package price$/i.test(h2)) return [{ kind: "price", section: h2, atoms, role: "fixed" }];
  if (rest.length > 0 && rest.every((a) => a.type === "item" && a.text.startsWith("- Video: "))) return videoPieces(h2, atoms);
  const kind = kindForHeading(h2);
  if (kind === "faq") return faqPieces(h2, atoms, warn);
  if (kind === "review") return reviewPieces(h2, atoms, warn);
  if (kind === "patient_story") return storyPieces(h2, atoms, warn);
  return genericPieces(h2, atoms, kind ?? "overview", warn);
}

// ===== BAGIAN 11: Menggabungkan potongan kecil ke tetangga (C3) =====
// ---------------------------------------------------------------------------------------------
// Merging small pieces (C3)
// ---------------------------------------------------------------------------------------------

function canTake(p: Piece | undefined): p is Piece {
  return p !== undefined && p.role !== "fixed";
}

function merged(a: Piece, b: Piece, h1: string): Piece | undefined {
  const atoms = [...a.atoms, ...b.atoms];
  const body = renderAtoms(atoms).length;
  // The bigger part decides kind and label; a unit always wins over plain text.
  const big = b.role === "unit" || (a.role !== "unit" && bodyOf(b).length > bodyOf(a).length) ? b : a;
  const total = prefixOf(h1, big.kind, label(big)).length + 1 + body;
  const limit = big.kind === "price" ? LIMITS.priceBody : LIMITS.softBody;
  if (body > limit || total > LIMITS.maxTotal) return undefined;
  return { ...big, atoms, role: big.role === "unit" || a.role === "unit" || b.role === "unit" ? "unit" : "text", prefer: a.prefer ?? b.prefer };
}

function mergeSmall(pieces: Piece[], h1: string): Piece[] {
  const out: Piece[] = [];
  const queue = [...pieces];
  while (queue.length > 0) {
    const p = queue.shift()!;
    const small = (p.role === "text" || p.role === "tail") && bodyOf(p).length < LIMITS.minBody;
    if (!small) {
      out.push(p);
      continue;
    }
    const next = queue[0];
    const prev = out[out.length - 1];
    const order = p.prefer === "prev" ? ["prev", "next"] : ["next", "prev"];
    let done = false;
    for (const side of order) {
      if (side === "next" && canTake(next)) {
        const m = merged(p, next, h1);
        if (m) {
          queue[0] = m;
          done = true;
          break;
        }
      }
      if (side === "prev" && canTake(prev)) {
        const m = merged(prev, p, h1);
        if (m) {
          out[out.length - 1] = m;
          done = true;
          break;
        }
      }
    }
    if (!done) out.push(p);
  }
  return out;
}

// ===== BAGIAN 12: Fungsi publik: chunkPage dan toIsoDate =====
// ---------------------------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------------------------

function toIsoDate(s: string | undefined): string | null {
  const m = s ? /^([A-Z][a-z]{2}) (\d{1,2}),? (\d{4})$/.exec(s) : null;
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1]!);
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

// ===== BAGIAN 13: chunkPage: dari satu halaman ke daftar chunk (C1, C8) =====
export function chunkPage(page: PageInput): ChunkResult {
  const warn = new Warnings();
  const atoms = parseAtoms(page.text);
  const firstH2 = atoms.findIndex((a) => a.type === "heading" && a.level === 2);
  const headAtoms = firstH2 < 0 ? atoms : atoms.slice(0, firstH2);

  // C1: sections.
  const pieces: Piece[] = [];
  if (headAtoms.length) pieces.push({ kind: "overview", section: HEADER_SECTION, atoms: headAtoms, role: "fixed" });
  if (firstH2 >= 0) {
    const body = atoms.slice(firstH2);
    const starts = body.flatMap((a, i) => (a.type === "heading" && a.level === 2 ? [i] : []));
    starts.forEach((s, k) => {
      const seg = body.slice(s, starts[k + 1] ?? body.length);
      pieces.push(...sectionPieces(headingText(seg[0]!), seg, warn));
    });
  }

  const finalPieces = mergeSmall(pieces, page.h1);

  // C8: ids count per kind in page order, e.g. P2-faq-3.
  const counters = new Map<Kind, number>();
  const modified = toIsoDate(page.modifiedDate);
  const chunks: Chunk[] = finalPieces.map((p) => {
    const n = (counters.get(p.kind) ?? 0) + 1;
    counters.set(p.kind, n);
    const sectionLabel = label(p).replace(/\s+/g, " ");
    const body = bodyOf(p);
    const text = `${prefixOf(page.h1, p.kind, sectionLabel)}\n${body}`;
    const lead = p.atoms[0];
    const overlap = lead && lead.type === "para" ? (lead.overlap ?? 0) : 0;
    if (text.length > LIMITS.maxTotal || text.length < LIMITS.minTotal) {
      throw new Error(`page ${page.pageNo}: chunk P${page.pageNo}-${p.kind}-${n} has ${text.length} characters (allowed ${LIMITS.minTotal} to ${LIMITS.maxTotal})`);
    }
    return {
      id: `P${page.pageNo}-${p.kind}-${n}`,
      page_no: page.pageNo,
      source_url: page.sourceUrl,
      page_type: page.pageType,
      h1: page.h1,
      section: sectionLabel,
      kind: p.kind,
      text,
      text_hash: sha256(text),
      page_modified: modified,
      ...(overlap > 0 ? { overlap_chars: overlap } : {}),
    };
  });
  return { chunks, warnings: warn.list };
}

export { toIsoDate };
