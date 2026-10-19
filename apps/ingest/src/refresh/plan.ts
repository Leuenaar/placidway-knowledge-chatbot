/* ============================================================================
 * PETA FILE
 * FILE    : apps/ingest/src/refresh/plan.ts
 * TUJUAN  : Rencana refresh: membandingkan halaman baru dengan isi database
 *           untuk memutuskan halaman mana yang new, changed, unchanged, atau
 *           blocked-older (salinan lebih lama dari yang ada di database).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: isi database dan hasil rencana
 *    2. Beda chunk: tambah, ubah, hapus, nomor ulang
 *    3. Beda kosong
 *    4. Membuat rencana per halaman
 *    5. Laporan refresh yang mudah dibaca
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah aturan kapan halaman dianggap berubah (BAGIAN 4)
 * ============================================================================ */

import { toIsoDate } from "../chunk/chunk.js";
import type { ManifestEntry } from "../chunk/run.js";
import type { Chunk } from "../chunk/types.js";

// ===== BAGIAN 1: Tipe: isi database dan hasil rencana =====
/** What the database holds for one page. */
export interface DbPage {
  page_no: number;
  cleaned_hash: string;
  page_modified: string | null;
}
export interface DbChunkRef {
  id: string;
  text_hash: string;
}

export type PageStatus = "new" | "changed" | "unchanged" | "blocked-older";

export interface ChunkDiff {
  added: string[];
  changed: string[];
  removed: string[];
  /** Ids whose new text equals the old text of another id: the content is the same, the number moved. */
  renumbered: string[];
}

export interface PagePlan {
  pageNo: number;
  status: PageStatus;
  reason: string;
  diff: ChunkDiff;
  localModified: string | null;
  dbModified: string | null;
}

// ===== BAGIAN 2: Beda chunk: tambah, ubah, hapus, nomor ulang =====
export function diffChunks(oldRefs: DbChunkRef[], next: Chunk[]): ChunkDiff {
  const oldById = new Map(oldRefs.map((c) => [c.id, c.text_hash]));
  const newIds = new Set(next.map((c) => c.id));
  const added = next.filter((c) => !oldById.has(c.id)).map((c) => c.id);
  const changed = next.filter((c) => oldById.has(c.id) && oldById.get(c.id) !== c.text_hash).map((c) => c.id);
  const removed = oldRefs.filter((c) => !newIds.has(c.id)).map((c) => c.id);
  const oldHashesOfOtherIds = new Set(oldRefs.filter((c) => removed.includes(c.id) || changed.includes(c.id)).map((c) => c.text_hash));
  const renumbered = next.filter((c) => (added.includes(c.id) || changed.includes(c.id)) && oldHashesOfOtherIds.has(c.text_hash)).map((c) => c.id);
  return { added, changed, removed, renumbered };
}

// ===== BAGIAN 3: Beda kosong =====
const none: ChunkDiff = { added: [], changed: [], removed: [], renumbered: [] };

// ===== BAGIAN 4: Membuat rencana per halaman =====
/**
 * Decide per page what Refresh should do.
 * - new: the database has no row for the page.
 * - blocked-older: the new file says it was modified before the date already stored. The site's CDN sometimes serves an
 *   older copy (seen on pages 5 and 6), so loading it would silently roll the knowledge back.
 * - unchanged: same cleaned hash and the same (id, text_hash) chunks in the database.
 * - changed: anything else (new hash, or the chunker now produces other chunks).
 */
export function planRefresh(manifest: ManifestEntry[], chunks: Chunk[], dbPages: DbPage[], dbChunks: Map<number, DbChunkRef[]>): PagePlan[] {
  return manifest.map((m) => {
    const local = chunks.filter((c) => c.page_no === m.pageNo);
    const localModified = toIsoDate(m.meta.modifiedDate);
    const db = dbPages.find((p) => p.page_no === m.pageNo);
    if (!db) return { pageNo: m.pageNo, status: "new", reason: "not in the database yet", diff: diffChunks([], local), localModified, dbModified: null };
    const diff = diffChunks(dbChunks.get(m.pageNo) ?? [], local);
    const base = { pageNo: m.pageNo, diff, localModified, dbModified: db.page_modified };
    if (localModified && db.page_modified && localModified < db.page_modified) {
      return { ...base, status: "blocked-older", reason: `the file says Modified ${localModified} but the database already has ${db.page_modified}; this looks like an older copy of the page` };
    }
    const sameChunks = diff.added.length + diff.changed.length + diff.removed.length === 0;
    if (db.cleaned_hash === m.hash && sameChunks) return { ...base, status: "unchanged", reason: "same hash and same chunks" };
    if (db.cleaned_hash === m.hash) return { ...base, status: "changed", reason: "the text is the same but the chunker now produces different chunks" };
    return { ...base, status: "changed", reason: localModified && db.page_modified && localModified === db.page_modified ? "the text changed although the Modified date did not" : "the text changed" };
  });
}

// ===== BAGIAN 5: Laporan refresh yang mudah dibaca =====
export function renderRefreshReport(plans: PagePlan[], mode: "plan" | "applied", warnings: string[]): string {
  const out = ["# Refresh report", "", mode === "plan" ? "Plan only. Nothing was written to the database." : "Applied to the database.", ""];
  out.push("| Page | Status | Added | Changed | Removed | Renumbered | Reason |", "| ---: | --- | ---: | ---: | ---: | ---: | --- |");
  for (const p of plans) out.push(`| ${p.pageNo} | ${p.status} | ${p.diff.added.length} | ${p.diff.changed.length} | ${p.diff.removed.length} | ${p.diff.renumbered.length} | ${p.reason} |`);
  out.push("", "## Warnings", "");
  const lines = [...warnings];
  for (const p of plans) {
    if (p.status === "blocked-older") lines.push(`page ${p.pageNo}: BLOCKED, ${p.reason}. Fetch the page again, or use --force if you are sure.`);
    if (p.diff.renumbered.length) lines.push(`page ${p.pageNo}: ${p.diff.renumbered.length} chunk(s) kept their text but got another id (${p.diff.renumbered.slice(0, 5).join(", ")}${p.diff.renumbered.length > 5 ? ", ..." : ""}). Anything that stored the old ids will no longer match.`);
  }
  if (lines.length === 0) out.push("- none");
  for (const l of lines) out.push(`- ${l}`);
  for (const p of plans.filter((x) => x.status !== "unchanged")) {
    const d = p.diff;
    if (d.added.length + d.changed.length + d.removed.length === 0) continue;
    out.push("", `## Page ${p.pageNo}: chunk changes`, "");
    for (const [label, ids] of [["added", d.added], ["changed", d.changed], ["removed", d.removed]] as const) if (ids.length) out.push(`- ${label}: ${ids.join(", ")}`);
  }
  out.push("");
  return out.join("\n");
}
