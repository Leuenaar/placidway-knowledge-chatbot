/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/retrieval/retriever.test.ts
 * PURPOSE : Test of the search. The database is replaced by a stand-in that
 *           records requests and answers like PostgREST, and the embedder is
 *           the fake version, so no network or model download is needed.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. retriever
 *    2. loadDbConfig
 *    3. loadRetrieveCount
 *    4. loadExpandPages
 *    5. retriever.pages
 *    6. page expansion
 *    7. amount lookup
 *    8. title pages, fusion and the double search
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

/**
 * Retrieval tests. The database is a stub that records the request and answers like PostgREST would,
 * and the embedder is the fake one, so nothing here needs a network or a model download.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeEmbedder, type Embedder } from "@pwbot/embed";
import { DEFAULT_EXPAND_PAGES, DEFAULT_RETRIEVE_COUNT, loadDbConfig, loadExpandPages, loadRetrieveCount, RetrievalError } from "./config";
import { fuseHits, gatherChunks, mergeHitsAndPages, pickPages, titlePages } from "./expand";
import { createRetriever, type RetrievedChunk, type Retriever } from "./retriever";

const URL = "https://abc.supabase.co";
const KEY = "sb_secret_TESTKEY123456";

const ROW = {
  id: "P2-price-1",
  page_no: 2,
  source_url: "https://www.placidway.com/package/7903/x",
  h1: "Alternative Adenocarcinoma Cancer Treatment",
  section: "Price",
  kind: "price",
  text: "The package price is $14,995 and includes the full program.",
  page_modified: "2026-01-12",
  similarity: 0.91,
};

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: { query_embedding: string; match_count: number };
}

function stubDb(respond: (seen: Seen) => Response | Promise<Response>) {
  const calls: Seen[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    const seen: Seen = { url, method: String(init.method), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    calls.push(seen);
    return respond(seen);
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// ===== PART 1: retriever =====
describe("retriever", () => {
  it("sends the question vector to match_chunks with the key in the apikey header only", async () => {
    const db = stubDb(() => json([ROW]));
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: db.fetchFn });
    await r.search("How much does it cost?", 5);
    const c = db.calls[0]!;
    assert.equal(c.url, `${URL}/rest/v1/rpc/match_chunks`);
    assert.equal(c.method, "POST");
    assert.equal(c.headers.apikey, KEY);
    assert.deepEqual(Object.keys(c.headers).sort(), ["Content-Type", "apikey"]);
    assert.equal(c.body.match_count, 5);
    assert.match(c.body.query_embedding, /^\[[-0-9.e,]+\]$/);
    assert.equal(c.body.query_embedding.split(",").length, 384);
  });

  it("maps rows to the camelCase shape", async () => {
    const db = stubDb(() => json([ROW]));
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: db.fetchFn });
    const [hit] = await r.search("price", 5);
    assert.deepEqual(hit, {
      id: "P2-price-1",
      pageNo: 2,
      sourceUrl: ROW.source_url,
      h1: ROW.h1,
      section: "Price",
      kind: "price",
      text: ROW.text,
      pageModified: "2026-01-12",
      similarity: 0.91,
    });
  });

  it("accepts an empty result and null section and date", async () => {
    const db = stubDb(() => json([]));
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: db.fetchFn });
    assert.deepEqual(await r.search("anything", 5), []);
    const db2 = stubDb(() => json([{ ...ROW, section: null, page_modified: null }]));
    const r2 = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: db2.fetchFn });
    const [hit] = await r2.search("anything", 5);
    assert.equal(hit!.section, null);
    assert.equal(hit!.pageModified, null);
  });

  it("clamps the number of results to 1..20 and defaults to 5", async () => {
    const db = stubDb(() => json([]));
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: db.fetchFn });
    await r.search("q", 500);
    await r.search("q", 0);
    await r.search("q");
    assert.deepEqual(db.calls.map((c) => c.body.match_count), [20, 1, 5]);
  });

  it("rejects an empty question without calling the embedder or the database", async () => {
    let embedded = 0;
    const embedder: Embedder = { ...createFakeEmbedder(), embedQuery: async () => { embedded++; return new Array(384).fill(0); } };
    const db = stubDb(() => json([]));
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder, fetchFn: db.fetchFn });
    await assert.rejects(r.search("   "), RetrievalError);
    assert.equal(embedded, 0);
    assert.equal(db.calls.length, 0);
  });

  it("refuses a vector of the wrong length before calling the database", async () => {
    const embedder: Embedder = { ...createFakeEmbedder(), embedQuery: async () => [0.1, 0.2] };
    const db = stubDb(() => json([]));
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder, fetchFn: db.fetchFn });
    await assert.rejects(r.search("q"), /expects 384/);
    assert.equal(db.calls.length, 0);
  });

  it("turns an embedder failure into a RetrievalError", async () => {
    const embedder: Embedder = { ...createFakeEmbedder(), embedQuery: async () => { throw new Error("model missing"); } };
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder, fetchFn: stubDb(() => json([])).fetchFn });
    await assert.rejects(r.search("q"), /Could not embed the question \(model missing\)/);
  });

  it("reports an HTTP error with its status and never shows the key", async () => {
    const db = stubDb(() => new Response(JSON.stringify({ message: "function not found" }), { status: 404 }));
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: db.fetchFn });
    await assert.rejects(r.search("q"), (e: Error) => {
      assert.ok(e instanceof RetrievalError);
      assert.match(e.message, /HTTP 404/);
      assert.ok(!e.message.includes(KEY));
      return true;
    });
  });

  it("reports a network failure without the key", async () => {
    const fetchFn = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn });
    await assert.rejects(r.search("q"), (e: Error) => /Could not reach the database/.test(e.message) && !e.message.includes(KEY));
  });

  it("reports a timeout in plain words", async () => {
    const fetchFn = (async () => { throw new DOMException("timed out", "TimeoutError"); }) as unknown as typeof fetch;
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn });
    await assert.rejects(r.search("q"), /did not answer within 8 seconds/);
  });

  it("rejects rows in an unexpected shape", async () => {
    for (const bad of [{ not: "an array" }, [{ ...ROW, id: "weird id" }], [{ ...ROW, similarity: "high" }], [{ ...ROW, text: undefined }], [{ ...ROW, source_url: "not a url" }]]) {
      const db = stubDb(() => json(bad));
      const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: db.fetchFn });
      await assert.rejects(r.search("q"), /unexpected shape/);
    }
  });
});

// ===== PART 2: loadDbConfig =====
describe("loadDbConfig", () => {
  const anonJwt = `x.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.y`;
  const serviceJwt = `eyJ.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.y`;

  it("accepts a secret key and a legacy service_role key", () => {
    assert.deepEqual(loadDbConfig({ SUPABASE_URL: `${URL}/`, SUPABASE_API_KEY: KEY }), { url: URL, key: KEY });
    assert.equal(loadDbConfig({ SUPABASE_URL: URL, SUPABASE_API_KEY: serviceJwt }).key, serviceJwt);
  });

  it("accepts plain http only for localhost", () => {
    assert.doesNotThrow(() => loadDbConfig({ SUPABASE_URL: "http://localhost:54321", SUPABASE_API_KEY: KEY }));
    assert.throws(() => loadDbConfig({ SUPABASE_URL: "http://abc.supabase.co", SUPABASE_API_KEY: KEY }), /https/);
  });

  it("refuses missing values, a bad URL, the publishable key and the anon key", () => {
    assert.throws(() => loadDbConfig({}), /must both be set/);
    assert.throws(() => loadDbConfig({ SUPABASE_URL: URL }), /must both be set/);
    assert.throws(() => loadDbConfig({ SUPABASE_URL: "nope", SUPABASE_API_KEY: KEY }), /not a valid URL/);
    assert.throws(() => loadDbConfig({ SUPABASE_URL: URL, SUPABASE_API_KEY: "sb_publishable_abc" }), /publishable/);
    assert.throws(() => loadDbConfig({ SUPABASE_URL: URL, SUPABASE_API_KEY: `eyJ${anonJwt}` }), /role "anon"/);
  });

  it("never puts the key in an error message", () => {
    for (const env of [{ SUPABASE_URL: "nope", SUPABASE_API_KEY: "sb_publishable_SECRETVALUE" }, { SUPABASE_URL: URL, SUPABASE_API_KEY: "sb_publishable_SECRETVALUE" }]) {
      assert.throws(() => loadDbConfig(env), (e: Error) => !e.message.includes("SECRETVALUE"));
    }
  });
});

// ===== PART 3: loadRetrieveCount =====
describe("loadRetrieveCount", () => {
  it("defaults to 8, accepts 1 to 20, and refuses anything else with a clear message", () => {
    assert.equal(DEFAULT_RETRIEVE_COUNT, 8);
    assert.equal(loadRetrieveCount({}), 8);
    assert.equal(loadRetrieveCount({ RETRIEVE_COUNT: " " }), 8);
    assert.equal(loadRetrieveCount({ RETRIEVE_COUNT: "5" }), 5);
    assert.equal(loadRetrieveCount({ RETRIEVE_COUNT: "20" }), 20);
    for (const bad of ["0", "21", "2.5", "abc", "-1"]) {
      assert.throws(() => loadRetrieveCount({ RETRIEVE_COUNT: bad }), (e: Error) => e instanceof RetrievalError && e.message.includes("RETRIEVE_COUNT"));
    }
  });
});

// ===== PART 4: loadExpandPages =====
describe("loadExpandPages", () => {
  it("defaults to 2, accepts 0 to 7 and refuses anything else", () => {
    assert.equal(DEFAULT_EXPAND_PAGES, 2);
    assert.equal(loadExpandPages({}), 2);
    assert.equal(loadExpandPages({ EXPAND_PAGES: "0" }), 0);
    assert.equal(loadExpandPages({ EXPAND_PAGES: "7" }), 7);
    for (const bad of ["8", "-1", "1.5", "two"]) assert.throws(() => loadExpandPages({ EXPAND_PAGES: bad }), (e: Error) => e instanceof RetrievalError && e.message.includes("EXPAND_PAGES"));
  });
});

// ===== PART 5: retriever.pages =====
describe("retriever.pages", () => {
  const PAGE_ROW = { ...ROW, similarity: undefined };
  delete (PAGE_ROW as { similarity?: number }).similarity;

  it("reads the chunks of the given pages from the table, with the key in the apikey header only", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    const fetchFn = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenHeaders = init.headers as Record<string, string>;
      return json([{ ...PAGE_ROW, id: "P6-price-1", page_no: 6 }, { ...PAGE_ROW, id: "P2-faq-10" }, { ...PAGE_ROW, id: "P2-faq-9" }]);
    }) as unknown as typeof fetch;
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn });
    const out = await r.pages([6, 2, 2]);
    assert.match(seenUrl, /\/rest\/v1\/chunks\?select=id,page_no,source_url,h1,section,kind,text,page_modified&page_no=in\.\(2,6\)&order=id\.asc$/);
    assert.deepEqual(seenHeaders, { apikey: KEY });
    assert.deepEqual(out.map((c) => c.id), ["P2-faq-9", "P2-faq-10", "P6-price-1"], "numbers inside ids sort as numbers");
    assert.ok(out.every((c) => c.similarity === 0));
  });

  it("makes no request for an empty or invalid page list", async () => {
    const db = stubDb(() => json([]));
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: db.fetchFn });
    assert.deepEqual(await r.pages([]), []);
    assert.deepEqual(await r.pages([0, 8, 2.5]), []);
    assert.equal(db.calls.length, 0);
  });

  it("explains HTTP errors and bad rows without the key", async () => {
    const bad = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch });
    await assert.rejects(bad.pages([2]), (e: Error) => e instanceof RetrievalError && /HTTP 401/.test(e.message) && !e.message.includes(KEY));
    const odd = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: (async () => json([{ ...PAGE_ROW, id: "weird id" }])) as unknown as typeof fetch });
    await assert.rejects(odd.pages([2]), /unexpected shape/);
  });
});

// ===== PART 6: page expansion =====
describe("page expansion", () => {
  const hit = (id: string, pageNo: number, similarity: number): RetrievedChunk => ({ id, pageNo, sourceUrl: "https://x.example/", h1: "h", section: null, kind: "price", text: "t".repeat(50), pageModified: null, similarity });

  it("picks the pages most hits come from; ties go to the better ranked hit", () => {
    const hits = [hit("P6-a", 6, 0.9), hit("P1-a", 1, 0.89), hit("P2-a", 2, 0.88), hit("P2-b", 2, 0.87), hit("P1-b", 1, 0.86)];
    assert.deepEqual(pickPages(hits, 2), [1, 2], "pages 1 and 2 have two hits each; page 1 ranked first");
    assert.deepEqual(pickPages(hits, 1), [1]);
    assert.deepEqual(pickPages(hits, 0), []);
    assert.deepEqual(pickPages([], 2), []);
  });

  it("keeps the hits first and never repeats a chunk", () => {
    const merged = mergeHitsAndPages([hit("P2-b", 2, 0.9), hit("P6-a", 6, 0.8)], [hit("P2-a", 2, 0), hit("P2-b", 2, 0), hit("P2-c", 2, 0)]);
    assert.deepEqual(merged.map((c) => c.id), ["P2-b", "P6-a", "P2-a", "P2-c"]);
    assert.equal(merged[0]!.similarity, 0.9, "the ranked copy is kept");
  });

  it("gatherChunks: searches, adds pages, and falls back to the hits when the page read fails", async () => {
    const hits = [hit("P2-b", 2, 0.9)];
    let pagesAsked: number[] = [];
    const good: Retriever = { search: async () => hits, pages: async (n) => { pagesAsked = n; return [hit("P2-a", 2, 0)]; }, containing: async () => [] };
    assert.deepEqual((await gatherChunks(good, "q", { resultCount: 8, expandPages: 2 })).map((c) => c.id), ["P2-b", "P2-a"]);
    assert.deepEqual(pagesAsked, [2]);
    const logs: string[] = [];
    const broken: Retriever = { search: async () => hits, pages: async () => { throw new RetrievalError("db down"); }, containing: async () => [] };
    assert.deepEqual((await gatherChunks(broken, "q", { resultCount: 8, expandPages: 2, log: (m) => logs.push(m) })).map((c) => c.id), ["P2-b"]);
    assert.equal(logs.length, 1);
    const off: Retriever = { search: async () => hits, pages: async () => { throw new Error("must not be called"); }, containing: async () => [] };
    assert.deepEqual((await gatherChunks(off, "q", { resultCount: 8, expandPages: 0 })).map((c) => c.id), ["P2-b"]);
  });
});

// ===== PART 7: amount lookup =====
describe("amount lookup", () => {
  const P7 = { ...ROW, id: "P7-price-3", page_no: 7, text: "- Initial Holistic Consultation: Low (USD): $50; High (USD): $250; Notes: Complexity." };
  delete (P7 as { similarity?: number }).similarity;
  const TRAP = { ...P7, id: "P7-price-9", text: "- Something else: $500 or $50,000 or $150." };
  const FOUND = { ...P7, id: "P2-price-2", page_no: 2, text: "Out-Patient $18,995. In-Patient $30,000." };

  it("finds chunks that contain the amount as a whole dollar figure and ignores near misses", async () => {
    const seen: string[] = [];
    const fetchFn = (async (url: string) => { seen.push(url); return json(url.includes("ilike.*%2450*") ? [P7, TRAP] : []); }) as unknown as typeof fetch;
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn });
    const out = await r.containing(["50"]);
    assert.deepEqual(out.map((c) => c.id), ["P7-price-3"], "$500, $50,000 and $150 are not $50");
    assert.match(seen[0]!, /\/rest\/v1\/chunks\?select=.*&text=ilike\.\*%2450\*&limit=20&order=id\.asc$/);
  });

  it("also looks for the comma form of a big amount, merges, sorts and caps the result", async () => {
    const seen: string[] = [];
    const fetchFn = (async (url: string) => { seen.push(decodeURIComponent(url)); return json(url.includes("18%2C995") ? [FOUND] : []); }) as unknown as typeof fetch;
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn });
    const out = await r.containing(["18995"]);
    assert.deepEqual(out.map((c) => c.id), ["P2-price-2"]);
    assert.equal(seen.length, 2, "one request per written form");
    assert.ok(seen.some((u) => u.includes("*$18995*")) && seen.some((u) => u.includes("*$18,995*")));
  });

  it("makes no request for nothing usable and refuses odd input", async () => {
    const db = stubDb(() => json([]));
    const r = createRetriever({ db: { url: URL, key: KEY }, embedder: createFakeEmbedder(), fetchFn: db.fetchFn });
    assert.deepEqual(await r.containing([]), []);
    assert.deepEqual(await r.containing(["abc", "5; drop table", "-3"]), []);
    assert.equal(db.calls.length, 0);
  });

  it("gatherChunks puts the amount chunks after the hits and before the page chunks, and survives a failed lookup", async () => {
    const mk = (id: string, pageNo: number, similarity = 0): RetrievedChunk => ({ id, pageNo, sourceUrl: "https://x.example/", h1: "h", section: null, kind: "price", text: "t".repeat(50), pageModified: null, similarity });
    const ret: Retriever = { search: async () => [mk("P1-faq-3", 1, 0.9)], pages: async () => [mk("P1-a", 1), mk("P1-faq-3", 1)], containing: async (a) => (a.includes("50") ? [mk("P7-price-3", 7)] : []) };
    const ids = async (msg: string) => (await gatherChunks(ret, "q", { resultCount: 8, expandPages: 1, visitorMessage: msg })).map((c) => c.id);
    assert.deepEqual(await ids("I heard it costs $50."), ["P1-faq-3", "P7-price-3", "P1-a"]);
    assert.deepEqual(await ids("How much is it?"), ["P1-faq-3", "P1-a"], "no amount, no lookup");
    const logs: string[] = [];
    const broken: Retriever = { ...ret, containing: async () => { throw new RetrievalError("db down"); } };
    const out = await gatherChunks(broken, "q", { resultCount: 8, expandPages: 1, visitorMessage: "only $50?", log: (m) => logs.push(m) });
    assert.deepEqual(out.map((c) => c.id), ["P1-faq-3", "P1-a"]);
    assert.ok(logs.some((l) => l.includes("could not look up the amounts") && l.includes("db down")));
  });
});

// ===== PART 8: title pages, fusion and the double search =====
describe("title pages, fusion and the double search", () => {
  const mk = (id: string, pageNo: number, similarity = 0.9): RetrievedChunk => ({ id, pageNo, sourceUrl: "https://x.example/", h1: "h", section: null, kind: "price", text: "t".repeat(50), pageModified: null, similarity });

  it("titlePages finds the page whose title holds a word no other title has", () => {
    assert.deepEqual(titlePages("How much does the adenocarcinoma treatment package cost in Tijuana?", 2), [2]);
    assert.deepEqual(titlePages("Is anal cancer treatment offered?", 2), [4]);
    assert.deepEqual(titlePages("compare prices abroad for medicine", 2), [7]);
    assert.deepEqual(titlePages("How much does the treatment cost?", 2), [], "cost, price, treatment, cancer are in too many titles to say anything");
    assert.deepEqual(titlePages("adenocarcinoma and adrenal", 1), [2], "at most `count`, best first");
    assert.deepEqual(titlePages("adenocarcinoma", 0), []);
  });

  it("pickPages reads the page the question names first, then the pages with most hits", () => {
    const hits = [mk("P1-a", 1), mk("P1-b", 1), mk("P1-c", 1), mk("P7-a", 7), mk("P7-b", 7), mk("P2-a", 2)];
    assert.deepEqual(pickPages(hits, 2), [1, 7], "without a query nothing changes");
    assert.deepEqual(pickPages(hits, 2, "adenocarcinoma cost"), [2, 1], "page 2 loses on hit count but is named in the question");
    assert.deepEqual(pickPages(hits, 1, "adenocarcinoma cost"), [2]);
  });

  it("fuseHits puts chunks that are on both lists first, keeps chunks that are on one list, and respects the count", () => {
    const a = [mk("A", 1, 0.9), mk("B", 1, 0.8), mk("C", 1, 0.7)];
    const b = [mk("D", 7, 0.95), mk("B", 1, 0.85), mk("E", 7, 0.5)];
    const fused = fuseHits([a, b], 4).map((c) => c.id);
    assert.equal(fused[0], "B", "on both lists");
    assert.deepEqual(fused.slice(1), ["A", "D", "C"], "ties: the first list, then by rank");
    assert.equal(fuseHits([a, b], 4).find((c) => c.id === "B")!.similarity, 0.85, "keeps the better similarity");
    assert.deepEqual(fuseHits([[], []], 3), []);
  });

  it("gatherChunks searches twice, finds the page a bad rewrite missed, and does not search twice when both texts are the same", async () => {
    const calls: string[] = [];
    const ret: Retriever = {
      search: async (q) => { calls.push(q); return q === "own words" ? [mk("P7-price-4", 7, 0.9)] : [mk("P1-faq-3", 1, 0.9)]; },
      pages: async () => [], containing: async () => [],
    };
    const out = await gatherChunks(ret, "rewritten", { resultCount: 4, expandPages: 0, visitorMessage: "own words" });
    assert.deepEqual(calls.sort(), ["own words", "rewritten"]);
    assert.deepEqual(out.map((c) => c.id).sort(), ["P1-faq-3", "P7-price-4"], "the chunk only the visitor's words found is there");
    calls.length = 0;
    await gatherChunks(ret, "Same Text", { resultCount: 4, expandPages: 0, visitorMessage: " same text " });
    assert.equal(calls.length, 1);
    calls.length = 0;
    await gatherChunks(ret, "q", { resultCount: 4, expandPages: 0 });
    assert.equal(calls.length, 1, "no visitor message, one search");
  });

  it("gatherChunks reads the named page in full even when the hits point elsewhere", async () => {
    const asked: number[][] = [];
    const ret: Retriever = {
      search: async () => [mk("P1-a", 1), mk("P1-b", 1), mk("P7-a", 7), mk("P7-b", 7), mk("P2-price-1", 2)],
      pages: async (p) => { asked.push(p); return [mk("P2-price-2", 2, 0)]; },
      containing: async () => [],
    };
    const out = await gatherChunks(ret, "adenocarcinoma package cost", { resultCount: 8, expandPages: 2 });
    assert.deepEqual(asked, [[2, 1]]);
    assert.ok(out.some((c) => c.id === "P2-price-2"));
  });

  it("a failed second search only costs the second list, and is logged once; a failed first search still fails the whole call", async () => {
    const logs: string[] = [];
    const ret: Retriever = {
      search: async (q) => { if (q === "own words") throw new RetrievalError("db slow"); return [mk("P1-a", 1)]; },
      pages: async () => [], containing: async () => [],
    };
    const out = await gatherChunks(ret, "rewritten", { resultCount: 4, expandPages: 0, visitorMessage: "own words", log: (m) => logs.push(m) });
    assert.deepEqual(out.map((c) => c.id), ["P1-a"]);
    assert.equal(logs.length, 1);
    assert.match(logs[0]!, /own words.*db slow|visitor's own words.*db slow/);
    const dead: Retriever = { search: async () => { throw new RetrievalError("down"); }, pages: async () => [], containing: async () => [] };
    const more: string[] = [];
    await assert.rejects(gatherChunks(dead, "a", { resultCount: 4, expandPages: 0, visitorMessage: "b", log: (m) => more.push(m) }), /down/);
  });
});
