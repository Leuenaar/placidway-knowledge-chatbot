/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/retrieval/retriever.ts
 * PURPOSE : Retrieval: a question goes in, the nearest pieces come out. The
 *           question is embedded with the same model as the pieces, its vector
 *           is sent to the database function match_chunks, and the result is
 *           checked. Nothing writes to the database. It also reads full pages
 *           and looks for pieces that contain a given amount.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Limit on the number of results and the database timeout
 *    2. Shape of one result piece
 *    3. Check of a row from the database
 *    4. Retriever contract
 *    5. Retriever builder (embed, call the database, check)
 *    6. containing: find the pieces that contain a dollar amount
 *    7. pages: read all the pieces of certain pages
 *    8. search: embed the question, then call match_chunks
 * IF ASKED TO CHANGE:
 *    - Database timeout (8 seconds) (PART 1)
 *    - Default number of results (5) and maximum (20) (PART 1)
 * ============================================================================ */

/**
 * Retrieval: question in, the closest chunks out.
 *
 * Steps: embed the question with the same model that embedded the chunks, send the vector to the database
 * function match_chunks (migration 003), and check what comes back. Nothing here writes to the database.
 * The database function ranks by cosine similarity; hybrid search and query translation are separate, later steps.
 */
import { z } from "zod";
import { DB_VECTOR_DIMS, toPgVector, type Embedder } from "@pwbot/embed";
import { mentionsDollarAmount, writtenForms } from "./amounts";
import { RetrievalError, type DbConfig } from "./config";

// ===== PART 1: Limit on the number of results and the database timeout =====
/** Same limits as the SQL function, checked here too so a bad caller gets a clear error instead of a clamp. */
export const MIN_RESULTS = 1;
export const MAX_RESULTS = 20;
export const DEFAULT_RESULTS = 5;
const REQUEST_TIMEOUT_MS = 8000;

// ===== PART 2: Shape of one result piece =====
export interface RetrievedChunk {
  id: string;
  pageNo: number;
  sourceUrl: string;
  h1: string;
  section: string | null;
  kind: string;
  text: string;
  pageModified: string | null;
  /** Cosine similarity, 1 = same meaning. */
  similarity: number;
}

// ===== PART 3: Check of a row from the database =====
/** Shape of one row from match_chunks. Anything else means the function or the migration is not what we expect. */
const rowSchema = z.object({
  id: z.string().regex(/^P[1-7]-[A-Za-z0-9_-]+$/),
  page_no: z.number().int().min(1).max(7),
  source_url: z.string().url(),
  h1: z.string(),
  section: z.string().nullable(),
  kind: z.string(),
  text: z.string().min(1),
  page_modified: z.string().nullable(),
  similarity: z.number().min(-1.0001).max(1.0001),
});
const rowsSchema = z.array(rowSchema);
/** Rows read straight from the chunks table (no similarity column). */
const pageRowsSchema = z.array(rowSchema.omit({ similarity: true }));
const PAGE_COLUMNS = "id,page_no,source_url,h1,section,kind,text,page_modified";

/** "P2-faq-10" after "P2-faq-9": numbers inside ids compare as numbers. */
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, "en", { numeric: true });

// ===== PART 4: Retriever contract =====
export interface Retriever {
  search(question: string, k?: number): Promise<RetrievedChunk[]>;
  /** Every chunk of the given pages (1 to 7), in a stable order. Their similarity is 0: they were not ranked, they were added for context. */
  pages(pageNos: number[]): Promise<RetrievedChunk[]>;
  /** The chunks whose text contains one of the dollar amounts (digits only, "50"), written with a dollar sign. At most 6 chunks. Similarity is 0. */
  containing(amounts: string[]): Promise<RetrievedChunk[]>;
}

export interface RetrieverOptions {
  db: DbConfig;
  embedder: Embedder;
  /** Replaceable in tests. */
  fetchFn?: typeof fetch;
}

// ===== PART 5: Retriever builder (embed, call the database, check) =====
export function createRetriever({ db, embedder, fetchFn = fetch }: RetrieverOptions): Retriever {
  const toChunk = (r: z.infer<typeof pageRowsSchema>[number], similarity: number): RetrievedChunk => ({
    id: r.id,
    pageNo: r.page_no,
    sourceUrl: r.source_url,
    h1: r.h1,
    section: r.section,
    kind: r.kind,
    text: r.text,
    pageModified: r.page_modified,
    similarity,
  });

  /** Reads rows from the chunks table with one filter. Shared by pages() and containing(). */
  async function readTable(query: string, what: string): Promise<RetrievedChunk[]> {
    let res: Response;
    try {
      res = await fetchFn(`${db.url}/rest/v1/chunks?select=${PAGE_COLUMNS}&${query}&order=id.asc`, { headers: { apikey: db.key }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError" || name === "AbortError") throw new RetrievalError(`The database did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`);
      throw new RetrievalError(`Could not reach the database (${e instanceof Error ? e.message : String(e)})`);
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      throw new RetrievalError(`${what} failed: HTTP ${res.status} ${body}`);
    }
    const parsed = pageRowsSchema.safeParse(await res.json().catch(() => undefined));
    if (!parsed.success) throw new RetrievalError("The chunks table returned rows in an unexpected shape");
    return parsed.data.map((r) => toChunk(r, 0)).sort(byId);
  }

  return {

    // ===== PART 6: containing: find the pieces that contain a dollar amount =====
    async containing(amounts) {
      const wanted = [...new Set(amounts.filter((a) => /^\d+(\.\d+)?$/.test(a)))].slice(0, 3);
      if (wanted.length === 0) return [];
      const found = new Map<string, RetrievedChunk>();
      for (const amount of wanted) {
        for (const form of writtenForms(amount)) {
          const rows = await readTable(`text=ilike.${encodeURIComponent(`*$${form}*`)}&limit=20`, "Looking up amounts");
          for (const row of rows) if (mentionsDollarAmount(row.text, amount)) found.set(row.id, row);
        }
      }
      return [...found.values()].sort(byId).slice(0, 6);
    },

    // ===== PART 7: pages: read all the pieces of certain pages =====
    async pages(pageNos) {
      const wanted = [...new Set(pageNos)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).sort((a, b) => a - b);
      if (wanted.length === 0) return [];
      return readTable(`page_no=in.(${wanted.join(",")})`, "Reading the pages");
    },

    // ===== PART 8: search: embed the question, then call match_chunks =====
    async search(question, k = DEFAULT_RESULTS) {
      const q = question.trim();
      if (!q) throw new RetrievalError("The question is empty");
      const count = Math.min(MAX_RESULTS, Math.max(MIN_RESULTS, Math.trunc(k)));

      let vector: number[];
      try {
        vector = await embedder.embedQuery(q);
      } catch (e) {
        throw new RetrievalError(`Could not embed the question (${e instanceof Error ? e.message : String(e)})`);
      }
      if (vector.length !== DB_VECTOR_DIMS) {
        throw new RetrievalError(`The embedder returned ${vector.length} numbers, the database expects ${DB_VECTOR_DIMS}`);
      }

      let res: Response;
      try {
        res = await fetchFn(`${db.url}/rest/v1/rpc/match_chunks`, {
          method: "POST",
          headers: { apikey: db.key, "Content-Type": "application/json" },
          body: JSON.stringify({ query_embedding: toPgVector(vector), match_count: count }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name === "TimeoutError" || name === "AbortError") throw new RetrievalError(`The database did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`);
        throw new RetrievalError(`Could not reach the database (${e instanceof Error ? e.message : String(e)})`);
      }
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 300);
        throw new RetrievalError(`match_chunks failed: HTTP ${res.status} ${body}`);
      }

      const parsed = rowsSchema.safeParse(await res.json().catch(() => undefined));
      if (!parsed.success) throw new RetrievalError("match_chunks returned rows in an unexpected shape (is migration 003 applied?)");
      return parsed.data.map((r) => toChunk(r, r.similarity));
    },
  };
}
