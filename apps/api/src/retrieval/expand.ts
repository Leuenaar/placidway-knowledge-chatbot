/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/retrieval/expand.ts
 * TUJUAN  : Pencarian 'kecil ke besar'. Pencarian vektor pintar menemukan
 *           HALAMAN yang tepat tetapi bisa menaruh potongan pendek yang
 *           penting (misal harga) di bawah batas. Jadi setelah mencari,
 *           server juga mengirim semua potongan dari halaman terbaik, plus
 *           potongan yang memuat nominal dolar yang disebut pengunjung.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Halaman yang judulnya disebut di pertanyaan (titlePages)
 *    2. Menggabungkan dua daftar hasil (fuseHits)
 *    3. Memilih halaman yang dibaca penuh (pickPages)
 *    4. Menyatukan hasil pencarian dan halaman penuh
 *    5. Opsi pengumpulan
 *    6. Pengumpul utama: cari dua kali, nominal persis, halaman penuh
 * KALAU DIMINTA MENGUBAH:
 *    - Kata judul yang dianggap umum (GENERIC_TITLE_WORDS) (BAGIAN 1)
 *    - Seberapa kuat hasil kata asli pengunjung vs hasil rewrite (RRF_K)
 *      (BAGIAN 2)
 *    - Berapa halaman penuh ditambahkan (lihat EXPAND_PAGES di config)
 *      (BAGIAN 6)
 * ============================================================================ */

/**
 * Small-to-big retrieval. The vector search is good at finding the right PAGE but can rank a short, important chunk
 * (for example the one with the in-patient and out-patient prices) just below the cut. So after the search we take the
 * pages that the best hits come from and send the model every chunk of those pages, hits first.
 *
 * The model still cites chunk ids and the server still builds the source links from them, so nothing about grounding changes.
 */
import { SOURCE_PAGES } from "@pwbot/shared";
import { dollarAmounts } from "./amounts";
import type { RetrievedChunk, Retriever } from "./retriever";

// ===== BAGIAN 1: Halaman yang judulnya disebut di pertanyaan (titlePages) =====
/** Words that are in a page title but that nearly every question about money contains, so they say nothing about WHICH page. */
const GENERIC_TITLE_WORDS = new Set(["cost", "costs", "price", "prices", "list", "compare", "alternative", "treatment", "cancer", "center", "itc"]);

const wordsOf = (text: string): string[] => text.toLowerCase().match(/[a-z]{4,}/g) ?? [];

/**
 * Pages whose TITLE holds a word that no other title has (adenocarcinoma, adrenal, videos, abroad ...) and that the question uses.
 * A question that names the subject of a page is about that page, even when the vector search ranks other pages' chunks higher.
 * Best match first; at most `count`.
 */
export function titlePages(query: string, count: number): number[] {
  if (count <= 0) return [];
  const titleWords = SOURCE_PAGES.map((p) => new Set(wordsOf(p.title)));
  const inQuery = new Set(wordsOf(query));
  const scored = SOURCE_PAGES.map((p, i) => {
    const unique = [...titleWords[i]!].filter((w) => !GENERIC_TITLE_WORDS.has(w) && titleWords.every((set, j) => j === i || !set.has(w)));
    return { page: p.n, score: unique.filter((w) => inQuery.has(w)).length };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.page - b.page).slice(0, count).map((x) => x.page);
}

// ===== BAGIAN 2: Menggabungkan dua daftar hasil (fuseHits) =====
const RRF_K = 60;

/**
 * Two ranked lists (hits for the rewritten English question and hits for the visitor's own words) merged into one by reciprocal rank
 * fusion: a chunk that is high on EITHER list stays high, one that is on both goes to the top. The rewrite step is a model and can
 * drift from what the visitor asked; the visitor's own words cannot. Ties go to the rewritten list. Keeps the better similarity.
 */
export function fuseHits(lists: RetrievedChunk[][], count: number): RetrievedChunk[] {
  const scored = new Map<string, { chunk: RetrievedChunk; score: number; first: number }>();
  lists.forEach((list, li) =>
    list.forEach((chunk, rank) => {
      const add = 1 / (RRF_K + rank + 1);
      const cur = scored.get(chunk.id);
      if (cur) {
        cur.score += add;
        if (chunk.similarity > cur.chunk.similarity) cur.chunk = chunk;
      } else scored.set(chunk.id, { chunk, score: add, first: li * 1000 + rank });
    }),
  );
  return [...scored.values()].sort((a, b) => b.score - a.score || a.first - b.first).slice(0, count).map((x) => x.chunk);
}

// ===== BAGIAN 3: Memilih halaman yang dibaca penuh (pickPages) =====
/**
 * The pages to read in full, best first: first the pages the question names in their title (see titlePages), then the pages most of the
 * hits come from. Ties go to the page whose hit ranked higher.
 */
export function pickPages(hits: RetrievedChunk[], count: number, query = ""): number[] {
  if (count <= 0) return [];
  const named = titlePages(query, count);
  const stats = new Map<number, { hits: number; firstAt: number }>();
  hits.forEach((h, i) => {
    const s = stats.get(h.pageNo);
    if (s) s.hits++;
    else stats.set(h.pageNo, { hits: 1, firstAt: i });
  });
  const byHits = [...stats.entries()].sort((a, b) => b[1].hits - a[1].hits || a[1].firstAt - b[1].firstAt).map(([page]) => page);
  return [...new Set([...named, ...byHits])].slice(0, count);
}

// ===== BAGIAN 4: Menyatukan hasil pencarian dan halaman penuh =====
/** The hits in their ranked order, then the other chunks of the chosen pages. No chunk appears twice. */
export function mergeHitsAndPages(hits: RetrievedChunk[], pageChunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set(hits.map((h) => h.id));
  return [...hits, ...pageChunks.filter((c) => !seen.has(c.id))];
}

// ===== BAGIAN 5: Opsi pengumpulan =====
export interface GatherOptions {
  /** How many chunks the vector search returns. */
  resultCount: number;
  /** How many pages to add in full. 0 turns the expansion off. */
  expandPages: number;
  /** The visitor's own words. Any dollar amount in them is looked up exactly, so the model can see where that number appears. */
  visitorMessage?: string;
  log?: (message: string) => void;
}

// ===== BAGIAN 6: Pengumpul utama: cari dua kali, nominal persis, halaman penuh =====
/**
 * Search, then add (1) the chunks that contain a dollar amount the visitor mentioned and (2) the full best pages.
 * The search runs twice when the visitor's own words differ from the rewritten question, and the two result lists are fused
 * (see fuseHits), so one bad rewrite cannot hide the right page. If the second search fails, the first is used and the problem is logged.
 * Why (1): when someone says "I heard it costs $50", the model must see where $50 really appears (a general consultation range
 * on the comparison page) instead of guessing, or claiming that the number appears nowhere. If a lookup fails, the plain search
 * result is used and the problem is logged.
 */
export async function gatherChunks(retriever: Retriever, query: string, { resultCount, expandPages, visitorMessage = "", log = () => {} }: GatherOptions): Promise<RetrievedChunk[]> {
  const own = visitorMessage.trim();
  let ownFailure: unknown;
  const first = retriever.search(query, resultCount);
  const second = own && own.toLowerCase() !== query.trim().toLowerCase()
    ? retriever.search(own, resultCount).catch((e: unknown) => { ownFailure = e; return [] as RetrievedChunk[]; })
    : Promise.resolve([] as RetrievedChunk[]);
  const [rewrittenHits, ownHits] = await Promise.all([first, second]);
  if (ownFailure !== undefined) log(`[chat] could not search with the visitor's own words, using the rewritten question only (${ownFailure instanceof Error ? ownFailure.message : String(ownFailure)})`);
  const hits = ownHits.length > 0 ? fuseHits([rewrittenHits, ownHits], resultCount) : rewrittenHits;
  let chunks = hits;
  const amounts = dollarAmounts(visitorMessage);
  if (amounts.length > 0) {
    try {
      chunks = mergeHitsAndPages(chunks, await retriever.containing(amounts));
    } catch (e) {
      log(`[chat] could not look up the amounts in the message, continuing without (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  const pages = pickPages(hits, expandPages, `${query} ${own}`);
  if (pages.length === 0) return chunks;
  try {
    return mergeHitsAndPages(chunks, await retriever.pages(pages));
  } catch (e) {
    log(`[chat] could not add the full pages, using the search hits only (${e instanceof Error ? e.message : String(e)})`);
    return chunks;
  }
}
