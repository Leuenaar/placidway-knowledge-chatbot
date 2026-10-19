/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/live/bot.test.ts
 * TUJUAN  : Uji bot live: pencari dan penjawab diganti tiruan sehingga yang
 *           diuji adalah keputusan bot sendiri (balasan mana yang tampil,
 *           link dan saran apa yang ikut, kegagalan tidak membocorkan
 *           detail). Blok terakhir mengirim HTTP sungguhan ke aplikasi dengan
 *           bot live.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. live bot
 *    2. live bot: rewrite and history
 *    3. app with the live bot (real HTTP)
 *    4. live bot: whole pages next to the hits
 *    5. live bot: branches (crisis, small talk, medical, out of scope, disclaimer,...
 *    6. shared contract: disclaimer_text
 *    7. live bot: disclaimer trigger
 *    8. live bot: unanswered-question log
 *    9. live bot: lead card offer (N4)
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

/**
 * Live bot tests. Retriever and answerer are stubs, so these tests check only the bot's own decisions:
 * which reply is shown, which links and suggestions go with it, and that a failure never leaks details.
 * The last block sends real HTTP requests to the real app with the live bot plugged in.
 */
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { MAX_FOLLOW_UPS, QUOTE_URL, SOURCE_PAGES, isChatResponse, type ChatResponse } from "@pwbot/shared";
import { createApp } from "../app";
import { AnswerError, type AnswerResult, type Answerer } from "../answer";
import { createHistoryStore } from "../history";
import type { Rewrite, Rewriter } from "../rewrite";
import { RetrievalError, type RetrievedChunk, type Retriever } from "../retrieval";
import { EN } from "../i18n";
import { CRISIS_REPLY, ERROR_REPLY, NOT_FOUND_REPLY, REFUSED_REPLY, UNGROUNDED_REPLY, createLiveBot } from "./bot";

const SESSION = "11111111-1111-4111-8111-111111111111";

function chunk(id: string, pageNo: number, kind: string): RetrievedChunk {
  const p = SOURCE_PAGES.find((x) => x.n === pageNo)!;
  return { id, pageNo, sourceUrl: p.url, h1: p.title, section: null, kind, text: `text of ${id} long enough`, pageModified: null, similarity: 0.9 };
}

const base = { usedChunks: [], sources: [], ungrounded: false, inputTokens: 1, outputTokens: 1, thinkingTokens: 0 };

const rewritten: Rewrite = { language: "English", query: "ITC Immunity Therapy Center treatment price", category: "in_scope", fallback: false };
const stubRewriter = (r: Rewrite = rewritten): Rewriter => ({ rewrite: async () => r });

function bot(result: AnswerResult | Error, opts: { retrievalError?: Error; chunks?: RetrievedChunk[]; rewriter?: Rewriter } = {}) {
  const logs: string[] = [];
  const asked: Array<{ q: string; k: number | undefined }> = [];
  const retriever: Retriever = {
    search: async (q, k) => {
      asked.push({ q, k });
      if (opts.retrievalError) throw opts.retrievalError;
      return opts.chunks ?? [chunk("P2-price-1", 2, "price")];
    },
    pages: async () => [], containing: async () => [],
  };
  const answerer: Answerer = {
    answer: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { bot: createLiveBot({ retriever, answerer, rewriter: opts.rewriter ?? stubRewriter(), log: (m) => logs.push(m) }), logs, asked };
}

// ===== BAGIAN 1: live bot =====
describe("live bot", () => {
  it("returns a grounded answer with sources and topic-based follow-ups", async () => {
    const used = [chunk("P6-price-1", 6, "price")];
    const { bot: b, asked } = bot({ ...base, kind: "answer", answer: "It costs $18,995.", usedChunks: used, sources: [{ url: SOURCE_PAGES[5]!.url, title: SOURCE_PAGES[5]!.title }] });
    const r = await b.reply(SESSION, "How much?");
    assert.equal(r.status, 200);
    assert.equal(r.body.kind, "answer");
    assert.equal(r.body.answer, "It costs $18,995.");
    assert.equal(r.body.sources.length, 1);
    assert.equal(r.body.quote_url, null);
    assert.equal(r.body.show_disclaimer, false);
    assert.ok(r.body.follow_ups.length > 0 && r.body.follow_ups.length <= MAX_FOLLOW_UPS);
    assert.ok(!r.body.follow_ups.includes("How much does the treatment cost?"), "does not suggest the topic just answered");
    assert.deepEqual(asked, [{ q: rewritten.query, k: 5 }, { q: "How much?", k: 5 }], "the search runs for the rewritten question AND for the visitor's own words");
    assert.ok(isChatResponse(r.body));
  });

  it("keeps the model's own 'not covered' text (it is in the visitor's language) and adds the quote link", async () => {
    const { bot: b } = bot({ ...base, kind: "not_in_content", answer: "Mi dispiace, non è nelle pagine." });
    const r = await b.reply(SESSION, "Che tempo fa?");
    assert.equal(r.body.kind, "not_in_content");
    assert.equal(r.body.answer, "Mi dispiace, non è nelle pagine.");
    assert.equal(r.body.quote_url, QUOTE_URL);
    assert.deepEqual(r.body.sources, []);
    assert.ok(isChatResponse(r.body));
  });

  it("uses a fixed text when nothing was retrieved at all", async () => {
    const { bot: b } = bot({ ...base, kind: "not_in_content", answer: "" }, { chunks: [] });
    const r = await b.reply(SESSION, "anything");
    assert.equal(r.body.answer, NOT_FOUND_REPLY);
  });

  it("never shows an answer that cites no real chunk", async () => {
    const { bot: b, logs } = bot({ ...base, kind: "answer", answer: "An invented price of $5.", ungrounded: true });
    const r = await b.reply(SESSION, "q");
    assert.equal(r.body.kind, "not_in_content");
    assert.equal(r.body.answer, UNGROUNDED_REPLY);
    assert.ok(!r.body.answer.includes("$5"));
    assert.deepEqual(r.body.sources, []);
    assert.equal(logs.length, 1);
  });

  it("answers a model refusal with a fixed, safe text", async () => {
    const { bot: b } = bot({ ...base, kind: "refused", answer: "" });
    const r = await b.reply(SESSION, "q");
    assert.equal(r.body.answer, REFUSED_REPLY);
    assert.equal(r.body.quote_url, QUOTE_URL);
  });

  it("turns any failure into a plain error reply and logs the real reason without the question", async () => {
    for (const failure of [
      { result: new AnswerError("Model API error: HTTP 529 overloaded") },
      { result: new Error("x"), retrievalError: new RetrievalError("The database did not answer within 8 seconds") },
    ]) {
      const { bot: b, logs } = bot(failure.result, failure.retrievalError ? { retrievalError: failure.retrievalError } : {});
      const r = await b.reply(SESSION, "my secret health detail");
      assert.equal(r.status, 500);
      assert.equal(r.body.kind, "error");
      assert.equal(r.body.answer, ERROR_REPLY);
      assert.equal(logs.length, 1);
      assert.ok(!logs[0]!.includes("secret health detail"));
      assert.ok(isChatResponse(r.body));
    }
  });
});

// ===== BAGIAN 2: live bot: rewrite and history =====
describe("live bot: rewrite and history", () => {
  const ok: AnswerResult = { ...base, kind: "answer", answer: "It starts at $18,995.", usedChunks: [chunk("P6-price-1", 6, "price")], sources: [{ url: SOURCE_PAGES[5]!.url, title: SOURCE_PAGES[5]!.title }] };

  /** A bot whose retriever and answerer record what they were given, so the hand-over between the steps can be checked. */
  function recording(rewriter: Rewriter, answerResult: AnswerResult | Error = ok) {
    const searches: string[] = [];
    const answers: Array<{ question: string; ctx: unknown }> = [];
    const retriever: Retriever = { search: async (q) => { searches.push(q); return [chunk("P6-price-1", 6, "price")]; }, pages: async () => [], containing: async () => [] };
    const answerer: Answerer = {
      answer: async (question, _chunks, ctx) => {
        answers.push({ question, ctx });
        if (answerResult instanceof Error) throw answerResult;
        return answerResult;
      },
    };
    const history = createHistoryStore();
    const logs: string[] = [];
    return { bot: createLiveBot({ retriever, answerer, rewriter, history, log: (m) => logs.push(m) }), searches, answers, history, logs };
  }

  it("answers the visitor's own message, in the language the rewrite step found", async () => {
    const t = recording(stubRewriter({ ...rewritten, language: "Turkish" }));
    await t.bot.reply(SESSION, "50 dolar olduğunu duydum. Bunu doğrula.");
    assert.deepEqual(t.searches, [rewritten.query, "50 dolar olduğunu duydum. Bunu doğrula."], "both searches ran; the answer step still gets the visitor's own words");
    assert.equal(t.answers[0]!.question, "50 dolar olduğunu duydum. Bunu doğrula.");
    assert.deepEqual(t.answers[0]!.ctx, { language: "Turkish", history: [], care: false });
  });

  it("remembers the exchange and hands it to the next turn (follow-up questions)", async () => {
    const seen: Array<unknown> = [];
    const rewriter: Rewriter = { rewrite: async (_m, history) => { seen.push(history); return rewritten; } };
    const t = recording(rewriter);
    await t.bot.reply(SESSION, "How much is it?");
    await t.bot.reply(SESSION, "And what about recovery time?");
    assert.deepEqual(seen[0], []);
    assert.deepEqual(seen[1], [{ role: "visitor", text: "How much is it?" }, { role: "assistant", text: "It starts at $18,995." }]);
    assert.deepEqual((t.answers[1]!.ctx as { history: unknown }).history, seen[1]);
    await t.bot.reply("22222222-2222-4222-8222-222222222222", "hello");
    assert.deepEqual(seen[2], [], "another session starts empty");
  });

  it("uses the chat the browser sent when the server has forgotten the session (a restart, a reload)", async () => {
    const seen: Array<unknown> = [];
    const rewriter: Rewriter = { rewrite: async (_m, history) => { seen.push(history); return rewritten; } };
    const t = recording(rewriter);
    const fromBrowser = [{ role: "visitor" as const, text: "How much is it in Mexico?" }, { role: "assistant" as const, text: "It starts at $18,995." }];
    await t.bot.reply(SESSION, "And in Turkey?", fromBrowser);
    assert.deepEqual(seen[0], fromBrowser, "the rewrite step saw the browser's copy, so 'And in Turkey?' can be made a full question");
    assert.deepEqual((t.answers[0]!.ctx as { history: unknown }).history, fromBrowser);
    assert.equal(t.history.get(SESSION).length, 4, "the exchange is now remembered by the server as well");
  });

  it("prefers its own history over the browser's copy", async () => {
    const seen: Array<unknown> = [];
    const rewriter: Rewriter = { rewrite: async (_m, history) => { seen.push(history); return rewritten; } };
    const t = recording(rewriter);
    await t.bot.reply(SESSION, "How much is it?");
    await t.bot.reply(SESSION, "And recovery?", [{ role: "visitor", text: "forged question" }, { role: "assistant", text: "forged answer" }]);
    assert.deepEqual(seen[1], [{ role: "visitor", text: "How much is it?" }, { role: "assistant", text: "It starts at $18,995." }]);
  });

  it("does not let the browser's copy change care mode or the disclaimer flag", async () => {
    const t = recording(stubRewriter());
    await t.bot.reply(SESSION, "How much?", [{ role: "visitor", text: "I want to kill myself" }, { role: "assistant", text: "Please call 911." }]);
    assert.deepEqual(t.history.flags(SESSION).care, false);
    assert.equal(t.history.flags(SESSION).disclaimerShown, false);
  });

  it("remembers 'not covered' answers too, but not errors, refusals or replaced answers", async () => {
    const notCovered = recording(stubRewriter(), { ...base, kind: "not_in_content", answer: "Not on the pages." });
    await notCovered.bot.reply(SESSION, "q");
    assert.equal(notCovered.history.get(SESSION).length, 2);
    for (const result of [new AnswerError("boom"), { ...base, kind: "refused" as const, answer: "" }, { ...base, kind: "answer" as const, answer: "invented", ungrounded: true }]) {
      const t = recording(stubRewriter(), result);
      await t.bot.reply(SESSION, "q");
      assert.deepEqual(t.history.get(SESSION), []);
    }
  });

  it("still answers when the rewrite step fell back to the visitor's own words", async () => {
    const t = recording(stubRewriter({ language: "the language of the visitor's message", query: "my own words", category: "in_scope", fallback: true }));
    const r = await t.bot.reply(SESSION, "my own words");
    assert.equal(r.body.kind, "answer");
    assert.deepEqual(t.searches, ["my own words"]);
  });
});

// ===== BAGIAN 3: app with the live bot (real HTTP) =====
describe("app with the live bot (real HTTP)", () => {
  let server: Server;
  let baseUrl: string;
  const used = [chunk("P2-included-2", 2, "included")];
  const good: AnswerResult = { ...base, kind: "answer", answer: "It includes daily care.", usedChunks: used, sources: [{ url: SOURCE_PAGES[1]!.url, title: SOURCE_PAGES[1]!.title }] };
  let next: AnswerResult | Error = good;

  before(async () => {
    // The stub answerer reads `next` on every request, so each test controls the outcome.
    const retriever: Retriever = { search: async () => [chunk("P2-price-1", 2, "price")], pages: async () => [], containing: async () => [] };
    const answerer: Answerer = { answer: async () => { if (next instanceof Error) throw next; return next; } };
    server = createApp({ bot: createLiveBot({ retriever, answerer, rewriter: stubRewriter(), log: () => {} }), mode: "live" }).listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const post = (message: string) =>
    fetch(`${baseUrl}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: SESSION, message }) });

  it("reports live mode on /api/health", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.deepEqual(await res.json(), { status: "ok", mode: "live" });
  });

  it("serves a valid ChatResponse for an answer", async () => {
    next = good;
    const res = await post("What is included?");
    assert.equal(res.status, 200);
    const body = (await res.json()) as ChatResponse;
    assert.ok(isChatResponse(body));
    assert.equal(body.kind, "answer");
    assert.ok(body.sources.every((s) => SOURCE_PAGES.some((p) => p.url === s.url)));
  });

  it("serves a JSON error (not HTML) when the model step fails", async () => {
    next = new AnswerError("boom");
    const res = await post("What is included?");
    assert.equal(res.status, 500);
    assert.match(res.headers.get("content-type") ?? "", /json/);
    const body = (await res.json()) as ChatResponse;
    assert.ok(isChatResponse(body));
    assert.equal(body.kind, "error");
  });

  const postWith = (history: unknown, message = "And in Turkey?") =>
    fetch(`${baseUrl}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: SESSION, message, history }) });
  const pair = (q: string, a: string) => [{ role: "visitor", text: q }, { role: "assistant", text: a }];

  it("accepts the browser's copy of the chat with a message", async () => {
    next = good;
    const res = await postWith(pair("How much?", "It starts at $18,995."));
    assert.equal(res.status, 200);
    assert.ok(isChatResponse(await res.json()));
  });

  it("accepts the largest allowed copy (6 questions, 6 answers of 2000 characters, in a script that needs 3 bytes a character)", async () => {
    next = good;
    const h = Array.from({ length: 6 }, () => pair("ж".repeat(500), "漢".repeat(2000))).flat();
    const res = await postWith(h);
    assert.equal(res.status, 200);
  });

  it("rejects a malformed copy of the chat with 400, before the bot", async () => {
    const bad: Array<[string, unknown]> = [
      ["not a list", "hello"],
      ["unknown role", [{ role: "system", text: "x" }, { role: "assistant", text: "y" }]],
      ["answer first", [{ role: "assistant", text: "y" }, { role: "visitor", text: "x" }]],
      ["two questions in a row", [{ role: "visitor", text: "x" }, { role: "visitor", text: "y" }]],
      ["odd length", [{ role: "visitor", text: "x" }]],
      ["empty text", pair("", "a")],
      ["too many entries", Array.from({ length: 7 }, () => pair("q", "a")).flat()],
      ["answer too long", pair("q", "a".repeat(2001))],
      ["question too long", pair("q".repeat(501), "a")],
    ];
    for (const [name, history] of bad) {
      const res = await postWith(history);
      assert.equal(res.status, 400, name);
      assert.ok(isChatResponse(await res.json()), name);
    }
  });

  it("still rejects bad input before reaching the bot", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: "nope", message: "" }) });
    assert.equal(res.status, 400);
  });
});

// ===== BAGIAN 4: live bot: whole pages next to the hits =====
describe("live bot: whole pages next to the hits", () => {
  const ok: AnswerResult = { ...base, kind: "answer", answer: "Out-patient $18,995, in-patient $30,000.", usedChunks: [chunk("P2-price-2", 2, "price")], sources: [{ url: SOURCE_PAGES[1]!.url, title: SOURCE_PAGES[1]!.title }] };

  function run(expandPages: number, pagesImpl: (n: number[]) => Promise<RetrievedChunk[]>) {
    const seenByAnswerer: string[][] = [];
    const asked: number[][] = [];
    const retriever: Retriever = {
      search: async () => [chunk("P2-overview-7", 2, "overview"), chunk("P6-price-1", 6, "price"), chunk("P2-price-1", 2, "price")],
      pages: async (n) => { asked.push(n); return pagesImpl(n); },
      containing: async () => [],
    };
    const answerer: Answerer = { answer: async (_q, chunks) => { seenByAnswerer.push(chunks.map((c) => c.id)); return ok; } };
    const logs: string[] = [];
    return { bot: createLiveBot({ retriever, answerer, rewriter: stubRewriter(), expandPages, log: (m) => logs.push(m) }), seenByAnswerer, asked, logs };
  }

  it("sends the hits first and then the other chunks of the best pages, without repeats", async () => {
    const t = run(1, async () => [chunk("P2-overview-7", 2, "overview"), chunk("P2-price-1", 2, "price"), chunk("P2-price-2", 2, "price")]);
    const r = await t.bot.reply(SESSION, "How much is the adenocarcinoma package?");
    assert.equal(r.status, 200);
    assert.deepEqual(t.asked, [[2]], "page 2 has two of the three hits");
    assert.deepEqual(t.seenByAnswerer[0], ["P2-overview-7", "P6-price-1", "P2-price-1", "P2-price-2"]);
  });

  it("does not read pages when the setting is 0", async () => {
    const t = run(0, async () => { throw new Error("should not be called"); });
    await t.bot.reply(SESSION, "How much?");
    assert.deepEqual(t.asked, []);
    assert.deepEqual(t.seenByAnswerer[0], ["P2-overview-7", "P6-price-1", "P2-price-1"]);
  });

  it("still answers from the search hits when reading the pages fails, and logs why", async () => {
    const t = run(2, async () => { throw new Error("db down"); });
    const r = await t.bot.reply(SESSION, "How much?");
    assert.equal(r.status, 200);
    assert.deepEqual(t.seenByAnswerer[0], ["P2-overview-7", "P6-price-1", "P2-price-1"]);
    assert.ok(t.logs.some((l) => l.includes("could not add the full pages") && l.includes("db down")));
  });
});

// ===== BAGIAN 5: live bot: branches (crisis, small talk, medical, out of scope, disclaimer,... =====
describe("live bot: branches (crisis, small talk, medical, out of scope, disclaimer, care mode, languages)", () => {
  const ok: AnswerResult = { ...base, kind: "answer", answer: "It starts at $18,995.", usedChunks: [chunk("P6-price-1", 6, "price")], sources: [{ url: SOURCE_PAGES[5]!.url, title: SOURCE_PAGES[5]!.title }] };
  const review: AnswerResult = { ...ok, answer: "Patients describe it as hard.", usedChunks: [chunk("P1-review-1", 1, "review")] };

  const rw = (over: Partial<Rewrite>): Rewriter => stubRewriter({ ...rewritten, code: "en", ...over });

  function setup(opts: { rewriter: Rewriter | ((m: string) => Rewrite); result?: AnswerResult | Error; smallTalk?: string | Error }) {
    let searches = 0;
    const asks: Array<{ ctx: unknown }> = [];
    const retriever: Retriever = { search: async () => { searches++; return [chunk("P6-price-1", 6, "price")]; }, pages: async () => [], containing: async () => [] };
    const answerer: Answerer = {
      answer: async (_q, _c, ctx) => {
        asks.push({ ctx });
        const r = opts.result ?? ok;
        if (r instanceof Error) throw r;
        return r;
      },
    };
    const rewriter: Rewriter = typeof opts.rewriter === "function" ? { rewrite: async (m) => (opts.rewriter as (m: string) => Rewrite)(m) } : opts.rewriter;
    let talked = 0;
    const smallTalker = { reply: async () => { talked++; if (opts.smallTalk instanceof Error) throw opts.smallTalk; return opts.smallTalk ?? "Hello, I am an AI assistant."; } };
    const history = createHistoryStore();
    const logs: string[] = [];
    const bot = createLiveBot({ retriever, answerer, rewriter, smallTalker, history, log: (m) => logs.push(m) });
    return { bot, history, logs, asks, searches: () => searches, talked: () => talked };
  }

  it("crisis: fixed text, no search, no model answer, no quote, no sources, no suggestions, no disclaimer; care mode starts", async () => {
    const t = setup({ rewriter: rw({ category: "crisis" }) });
    const r = await t.bot.reply(SESSION, "I want to end my life");
    assert.equal(r.status, 200);
    assert.equal(r.body.kind, "crisis");
    assert.equal(r.body.answer, CRISIS_REPLY);
    assert.deepEqual([r.body.sources, r.body.quote_url, r.body.follow_ups, r.body.show_disclaimer], [[], null, [], false]);
    assert.equal(t.searches(), 0);
    assert.equal(t.asks.length, 0);
    assert.equal(t.history.flags(SESSION).care, true);
    assert.ok(isChatResponse(r.body));
  });

  it("crisis: the keyword net works even when the rewrite step says in_scope or failed", async () => {
    for (const rewriter of [rw({ category: "in_scope" }), stubRewriter({ language: "x", query: "q", category: "in_scope", fallback: true })]) {
      const t = setup({ rewriter });
      const r = await t.bot.reply(SESSION, "I want to kill myself");
      assert.equal(r.body.kind, "crisis");
      assert.equal(t.asks.length, 0);
    }
  });

  it("crisis: the text is in the visitor's language (id, tr, es, ar)", async () => {
    const { CURATED } = await import("../i18n");
    const { createLocalizer } = await import("../i18n");
    for (const [code, message] of [["id", "Saya ingin bunuh diri"], ["tr", "intihar etmek istiyorum"], ["es", "quiero morir"], ["ar", "أريد أن أموت"]] as const) {
      const bot = createLiveBot({
        retriever: { search: async () => [], pages: async () => [], containing: async () => [] },
        answerer: { answer: async () => { throw new Error("must not be called"); } },
        rewriter: rw({ category: "crisis", code, language: code }),
        localizer: createLocalizer({ log: () => {} }),
        log: () => {},
      });
      const r = await bot.reply(SESSION, message);
      assert.equal(r.body.answer, CURATED[code]!.crisis);
      assert.ok(r.body.answer.includes("findahelpline.com"));
    }
  });

  it("crisis: never an error text when the message is unclear; a long worried question about cancer is not a crisis", async () => {
    const t = setup({ rewriter: rw({ category: "in_scope" }) });
    const r = await t.bot.reply(SESSION, "I'm scared of dying from this cancer. What does the program include?");
    assert.equal(r.body.kind, "answer");
    assert.equal(t.history.flags(SESSION).care, false);
  });

  it("care mode: later replies are normal but sell nothing (no quote, no suggestions) and the answer step is told", async () => {
    const t = setup({ rewriter: (m) => ({ ...rewritten, code: "en", category: m.includes("kill") ? "crisis" : "in_scope" }) });
    await t.bot.reply(SESSION, "I want to kill myself");
    const r = await t.bot.reply(SESSION, "How much does it cost?");
    assert.equal(r.body.kind, "answer");
    assert.deepEqual([r.body.quote_url, r.body.follow_ups], [null, []]);
    assert.deepEqual((t.asks[0]!.ctx as { care: boolean }).care, true);
    const again = await t.bot.reply(SESSION, "I want to die");
    assert.equal(again.body.kind, "crisis", "a repeated crisis message gets the crisis text again");
  });

  it("care mode: a not-covered answer has no quote link either", async () => {
    const t = setup({ rewriter: (m) => ({ ...rewritten, code: "en", category: m.includes("kill") ? "crisis" : "in_scope" }), result: { ...base, kind: "not_in_content", answer: "I don't have that." } });
    await t.bot.reply(SESSION, "I want to kill myself");
    const r = await t.bot.reply(SESSION, "Where is the beach?");
    assert.equal(r.body.kind, "not_in_content");
    assert.equal(r.body.quote_url, null);
  });

  it("small talk: answered without searching; keeps the general suggestions; falls through when the small talker fails", async () => {
    const t = setup({ rewriter: rw({ category: "small_talk" }) });
    const r = await t.bot.reply(SESSION, "are you a bot?");
    assert.equal(r.body.kind, "small_talk");
    assert.equal(r.body.answer, "Hello, I am an AI assistant.");
    assert.equal(t.searches(), 0);
    assert.ok(r.body.follow_ups.length > 0);
    assert.deepEqual(r.body.sources, []);
    const failing = setup({ rewriter: rw({ category: "small_talk" }), smallTalk: new Error("down") });
    const f = await failing.bot.reply(SESSION, "hi");
    assert.equal(f.body.kind, "answer", "the normal path answered");
    assert.equal(failing.logs.length, 1);
  });

  it("medical: kind medical_declined, sources kept, no quote button, disclaimer on the first medical reply only", async () => {
    const t = setup({ rewriter: rw({ category: "medical" }), result: { ...ok, answer: "I can't say. Ask your doctor." } });
    const a = await t.bot.reply(SESSION, "Is it safe for my diabetes?");
    assert.equal(a.body.kind, "medical_declined");
    assert.equal(a.body.quote_url, null);
    assert.equal(a.body.show_disclaimer, true);
    assert.equal(a.body.disclaimer_text, EN.disclaimer);
    assert.ok(a.body.sources.length > 0);
    const b = await t.bot.reply(SESSION, "And will it cure me?");
    assert.equal(b.body.show_disclaimer, false, "once per session");
    assert.equal(b.body.disclaimer_text, null);
    const other = await t.bot.reply("22222222-2222-4222-8222-222222222222", "Is it safe?");
    assert.equal(other.body.show_disclaimer, true, "another session shows it again");
  });

  it("medical: an ungrounded or empty model reply becomes the fixed medical text, never an invented one", async () => {
    for (const result of [{ ...base, kind: "answer" as const, answer: "Yes it is safe.", ungrounded: true }, { ...base, kind: "not_in_content" as const, answer: "" }]) {
      const t = setup({ rewriter: rw({ category: "medical" }), result });
      const r = await t.bot.reply(SESSION, "Is it safe for me?");
      assert.equal(r.body.kind, "medical_declined");
      assert.equal(r.body.answer, EN.medical_fallback);
      assert.equal(r.body.quote_url, null);
      assert.equal(r.body.show_disclaimer, true);
    }
  });

  it("out of scope: kind out_of_scope, quote link and general suggestions kept, no disclaimer", async () => {
    const t = setup({ rewriter: rw({ category: "out_of_scope" }), result: { ...base, kind: "not_in_content", answer: "I can't help with weather." } });
    const r = await t.bot.reply(SESSION, "weather in Tijuana?");
    assert.equal(r.body.kind, "out_of_scope");
    assert.equal(r.body.quote_url, QUOTE_URL);
    assert.ok(r.body.follow_ups.length > 0);
    assert.equal(r.body.show_disclaimer, false);
  });

  it("out of scope but answered from the pages (a booking request): kind out_of_scope, quote link and sources kept", async () => {
    const t = setup({ rewriter: rw({ category: "out_of_scope" }), result: { ...ok, answer: "I cannot book. Use the consultation link." } });
    const r = await t.bot.reply(SESSION, "Can you book me an appointment for tomorrow?");
    assert.equal(r.body.kind, "out_of_scope");
    assert.equal(r.body.quote_url, QUOTE_URL);
    assert.equal(r.body.sources.length, 1);
    assert.equal(r.body.answer, "I cannot book. Use the consultation link.");
    assert.ok(r.body.follow_ups.length > 0);
    // An in-scope question with the same grounded answer stays an ordinary answer without the quote button.
    const plain = setup({ rewriter: rw({ category: "in_scope" }) });
    const p = await plain.bot.reply(SESSION, "How much?");
    assert.equal(p.body.kind, "answer");
    assert.equal(p.body.quote_url, null);
  });

  it("out of scope but answered, in care mode: label changes, but still no quote button and no suggestions", async () => {
    const t = setup({ rewriter: (m: string) => ({ ...rewritten, code: "en", category: m.includes("kill") ? "crisis" : "out_of_scope" }) });
    await t.bot.reply(SESSION, "I want to kill myself");
    const r = await t.bot.reply(SESSION, "Can you book me an appointment?");
    assert.equal(r.body.kind, "out_of_scope");
    assert.equal(r.body.quote_url, null);
    assert.deepEqual(r.body.follow_ups, []);
  });

  it("medical: the answer step never sees patient stories or reviews, other chunks stay; non-medical questions still see them", async () => {
    const seen: string[][] = [];
    const mixed = [chunk("P1-faq-2", 1, "faq"), chunk("P1-patient_story-5", 1, "patient_story"), chunk("P1-review-1", 1, "review"), chunk("P1-risks-1", 1, "risks")];
    const make = (category: Rewrite["category"]) =>
      createLiveBot({
        retriever: { search: async () => mixed, pages: async () => [], containing: async () => [] },
        answerer: { answer: async (_q, c) => { seen.push(c.map((x) => x.id)); return { ...base, kind: "answer" as const, answer: "Please ask your doctor.", usedChunks: [c[0]!], sources: [{ url: SOURCE_PAGES[0]!.url, title: SOURCE_PAGES[0]!.title }] }; } },
        rewriter: stubRewriter({ ...rewritten, code: "en", category }),
        log: () => {},
      });
    await make("medical").reply(SESSION, "Will it cure my cancer?");
    assert.deepEqual(seen[0], ["P1-faq-2", "P1-risks-1"]);
    await make("in_scope").reply(SESSION, "What do patients say?");
    assert.deepEqual(seen[1], ["P1-faq-2", "P1-patient_story-5", "P1-review-1", "P1-risks-1"]);
  });

  it("disclaimer: shown once when the answer rests on reviews or risks, not on prices", async () => {
    const t = setup({ rewriter: rw({}), result: review });
    const a = await t.bot.reply(SESSION, "What do patients say?");
    assert.equal(a.body.kind, "answer");
    assert.equal(a.body.show_disclaimer, true);
    const b = await t.bot.reply(SESSION, "More reviews?");
    assert.equal(b.body.show_disclaimer, false);
    const price = setup({ rewriter: rw({}) });
    assert.equal((await price.bot.reply(SESSION, "price?")).body.show_disclaimer, false);
  });

  it("fixed texts and suggestions come in the visitor's language", async () => {
    const { createLocalizer, CURATED } = await import("../i18n");
    const bot = createLiveBot({
      retriever: { search: async () => [chunk("P6-price-1", 6, "price")], pages: async () => [], containing: async () => [] },
      answerer: { answer: async () => ({ ...base, kind: "answer" as const, answer: "Mulai dari $18,995.", ungrounded: true }) },
      rewriter: rw({ code: "id", language: "Indonesian" }),
      localizer: createLocalizer({ log: () => {} }),
      log: () => {},
    });
    const r = await bot.reply(SESSION, "berapa biayanya?");
    assert.equal(r.body.answer, CURATED.id!.ungrounded);
    assert.deepEqual(r.body.follow_ups, [CURATED.id!.ask_cost, CURATED.id!.ask_included, CURATED.id!.ask_about]);
  });

  it("error reply uses the language last seen in the session", async () => {
    const { createLocalizer, CURATED } = await import("../i18n");
    let fail = false;
    const bot = createLiveBot({
      retriever: { search: async () => { if (fail) throw new RetrievalError("db"); return [chunk("P6-price-1", 6, "price")]; }, pages: async () => [], containing: async () => [] },
      answerer: { answer: async () => ok },
      rewriter: rw({ code: "tr", language: "Turkish" }),
      localizer: createLocalizer({ log: () => {} }),
      log: () => {},
    });
    await bot.reply(SESSION, "fiyat?");
    fail = true;
    const r = await bot.reply(SESSION, "fiyat?");
    assert.equal(r.status, 500);
    assert.equal(r.body.answer, CURATED.tr!.error);
  });
});

// ===== BAGIAN 6: shared contract: disclaimer_text =====
describe("shared contract: disclaimer_text", () => {
  const base2: ChatResponse = { answer: "a", kind: "crisis", sources: [], show_disclaimer: false, quote_url: null, offer_lead: false, follow_ups: [] };
  it("accepts a missing, null or string disclaimer_text and rejects anything else; accepts the new kinds", () => {
    assert.ok(isChatResponse(base2));
    assert.ok(isChatResponse({ ...base2, disclaimer_text: null }));
    assert.ok(isChatResponse({ ...base2, kind: "small_talk", disclaimer_text: "text" }));
    assert.ok(!isChatResponse({ ...base2, disclaimer_text: 5 }));
  });
});

// ===== BAGIAN 7: live bot: disclaimer trigger =====
describe("live bot: disclaimer trigger", () => {
  it("a price answer that cites page 7's price-estimate note does not use up the medical disclaimer", async () => {
    const note: AnswerResult = { ...base, kind: "answer", answer: "It is $18,995.", usedChunks: [chunk("P7-disclaimer-1", 7, "disclaimer")], sources: [{ url: SOURCE_PAGES[6]!.url, title: SOURCE_PAGES[6]!.title }] };
    const b = createLiveBot({
      retriever: { search: async () => [chunk("P7-disclaimer-1", 7, "disclaimer")], pages: async () => [], containing: async () => [] },
      answerer: { answer: async () => note },
      rewriter: stubRewriter(),
      log: () => {},
    });
    const r = await b.reply(SESSION, "price?");
    assert.equal(r.body.show_disclaimer, false);
  });
});

// ===== BAGIAN 8: live bot: unanswered-question log =====
describe("live bot: unanswered-question log", () => {
  const ok: AnswerResult = { ...base, kind: "answer", answer: "It is $18,995.", usedChunks: [chunk("P6-price-1", 6, "price")], sources: [{ url: SOURCE_PAGES[5]!.url, title: SOURCE_PAGES[5]!.title }] };

  function run(opts: { rewrite?: Partial<Rewrite>; result?: AnswerResult | Error; logBroken?: boolean; rewriter?: Rewriter }) {
    const rows: Array<{ question: string; reason: string; sessionId: string }> = [];
    const unanswered = { record: async (e: { question: string; reason: "not_in_content" | "price_not_listed" | "out_of_scope" | "medical_declined"; sessionId: string }) => { if (opts.logBroken) throw new Error("must not reach the visitor"); rows.push(e); } };
    const r = opts.result ?? ok;
    const bot = createLiveBot({
      retriever: { search: async () => [chunk("P6-price-1", 6, "price")], pages: async () => [], containing: async () => [] },
      answerer: { answer: async () => { if (r instanceof Error) throw r; return r; } },
      rewriter: opts.rewriter ?? stubRewriter({ ...rewritten, code: "en", ...opts.rewrite }),
      unanswered,
      log: () => {},
    });
    return { bot, rows };
  }
  const nothing: AnswerResult = { ...base, kind: "not_in_content", answer: "I don't have that." };

  it("notes a grounded answer to an out-of-scope request (booking) as out_of_scope", async () => {
    const t = run({ rewrite: { category: "out_of_scope" } });
    await t.bot.reply(SESSION, "Book me for tomorrow");
    assert.equal(t.rows.length, 1);
    assert.equal(t.rows[0]!.reason, "out_of_scope");
  });

  it("does not note a grounded answer", async () => {
    const t = run({});
    await t.bot.reply(SESSION, "How much?");
    assert.deepEqual(t.rows, []);
  });

  it("notes a not-covered question with its reason; money questions get price_not_listed (decided on the English query)", async () => {
    const a = run({ result: nothing, rewrite: { query: "ITC clinic parking information" } });
    await a.bot.reply(SESSION, "Is there parking?");
    assert.deepEqual(a.rows, [{ question: "Is there parking?", reason: "not_in_content", sessionId: SESSION }]);
    const b = run({ result: nothing, rewrite: { query: "How much does a dental implant cost in Mexico?", language: "Indonesian", code: "id" } });
    await b.bot.reply(SESSION, "Berapa harga implan gigi di Meksiko?");
    assert.equal(b.rows[0]!.reason, "price_not_listed");
  });

  it("notes out-of-scope, medical and replaced (ungrounded) replies", async () => {
    const oos = run({ result: nothing, rewrite: { category: "out_of_scope" } });
    await oos.bot.reply(SESSION, "weather?");
    assert.equal(oos.rows[0]!.reason, "out_of_scope");
    const med = run({ rewrite: { category: "medical" } });
    await med.bot.reply(SESSION, "Is it safe for my diabetes?");
    assert.equal(med.rows[0]!.reason, "medical_declined");
    const ungrounded = run({ result: { ...base, kind: "answer", answer: "invented", ungrounded: true }, rewrite: { query: "parking" } });
    await ungrounded.bot.reply(SESSION, "parking?");
    assert.equal(ungrounded.rows[0]!.reason, "not_in_content");
    const refused = run({ result: { ...base, kind: "refused", answer: "" }, rewrite: { query: "parking" } });
    await refused.bot.reply(SESSION, "parking?");
    assert.equal(refused.rows.length, 1);
  });

  it("never notes a crisis message, a small-talk message, an error, or anything in a care-mode session", async () => {
    const crisis = run({ rewrite: { category: "crisis" } });
    await crisis.bot.reply(SESSION, "I want to kill myself");
    assert.deepEqual(crisis.rows, []);
    const keyword = run({ result: nothing });
    await keyword.bot.reply(SESSION, "I want to kill myself");
    assert.deepEqual(keyword.rows, [], "the keyword net also keeps it out");
    const failing = run({ result: new AnswerError("boom") });
    await failing.bot.reply(SESSION, "anything");
    assert.deepEqual(failing.rows, []);
    // Care mode: the first message starts it, the next unanswered question in the same session is not kept.
    const care = run({ result: nothing, rewriter: { rewrite: async (m) => ({ ...rewritten, code: "en", category: m.includes("kill") ? "crisis" : "in_scope" }) } });
    await care.bot.reply(SESSION, "I want to kill myself");
    await care.bot.reply(SESSION, "Is there parking?");
    assert.deepEqual(care.rows, []);
    await care.bot.reply("22222222-2222-4222-8222-222222222222", "Is there parking?");
    assert.equal(care.rows.length, 1, "another session is logged as usual");
  });

  it("a broken log never changes or delays the reply", async () => {
    const t = run({ result: nothing, logBroken: true });
    const r = await t.bot.reply(SESSION, "Is there parking?");
    assert.equal(r.status, 200);
    assert.equal(r.body.kind, "not_in_content");
  });
});

// ===== BAGIAN 9: live bot: lead card offer (N4) =====
describe("live bot: lead card offer (N4)", () => {
  const ok: AnswerResult = { ...base, kind: "answer", answer: "Please use the consultation link.", usedChunks: [chunk("P6-price-1", 6, "price")], sources: [{ url: SOURCE_PAGES[5]!.url, title: SOURCE_PAGES[5]!.title }] };

  function setup(rewrite: (m: string) => Partial<Rewrite>, result: AnswerResult = ok, localizer?: Parameters<typeof createLiveBot>[0]["localizer"]) {
    const history = createHistoryStore();
    const rewriter: Rewriter = { rewrite: async (m) => ({ ...rewritten, code: "en", ...rewrite(m) }) };
    const bot = createLiveBot({
      retriever: { search: async () => [chunk("P6-price-1", 6, "price")], pages: async () => [], containing: async () => [] },
      answerer: { answer: async () => result },
      rewriter,
      ...(localizer ? { localizer } : {}),
      history,
      log: () => {},
    });
    return { bot, history };
  }
  const wants = (m: string) => ({ wantsQuote: m.includes("quote") || m.includes("contact") });

  it("offers the card with its texts when the visitor asks for a personal quote or to be contacted", async () => {
    const { bot } = setup(wants);
    const r = await bot.reply(SESSION, "Can someone contact me with a quote?");
    assert.equal(r.body.offer_lead, true);
    assert.equal(r.body.lead_texts?.submit, EN.lead_submit);
    assert.equal(r.body.lead_texts?.consent, EN.lead_consent);
    assert.ok(isChatResponse(r.body));
  });

  it("offers nothing for an ordinary question", async () => {
    const { bot } = setup(wants);
    const r = await bot.reply(SESSION, "How much is it?");
    assert.equal(r.body.offer_lead, false);
    assert.equal(r.body.lead_texts ?? null, null);
  });

  it("offers it at most once per session", async () => {
    const { bot } = setup(wants);
    assert.equal((await bot.reply(SESSION, "I want a quote")).body.offer_lead, true);
    assert.equal((await bot.reply(SESSION, "Please contact me")).body.offer_lead, false);
    assert.equal((await bot.reply("22222222-2222-4222-8222-222222222222", "I want a quote")).body.offer_lead, true, "another session gets its own");
  });

  it("never offers it in care mode, even if the visitor asks for a quote", async () => {
    const { bot } = setup((m) => ({ category: m.includes("kill") ? "crisis" : "in_scope", ...wants(m) }));
    await bot.reply(SESSION, "I want to kill myself");
    const r = await bot.reply(SESSION, "Can I get a quote?");
    assert.equal(r.body.offer_lead, false);
  });

  it("never offers it with a medical-advice reply, and does not use up the one offer", async () => {
    const { bot, history } = setup((m) => ({ ...(m.includes("dose") ? { category: "medical" as const } : {}), ...wants(m) }));
    const r = await bot.reply(SESSION, "What dose should I take? Contact me with a quote");
    assert.equal(r.body.offer_lead, false);
    assert.notEqual(history.flags(SESSION).leadOffered, true);
  });

  it("offers it on a 'not covered' reply too (the visitor still wants a person)", async () => {
    const { bot } = setup(wants, { ...base, kind: "not_in_content", answer: "I don't have that." });
    const r = await bot.reply(SESSION, "Can you contact me about a quote?");
    assert.equal(r.body.kind, "not_in_content");
    assert.equal(r.body.offer_lead, true);
  });

  it("writes the card in the visitor's language (tr)", async () => {
    const { createLocalizer, CURATED } = await import("../i18n");
    const { bot } = setup((m) => ({ code: "tr", language: "tr", ...wants(m) }), ok, createLocalizer({ log: () => {} }));
    const r = await bot.reply(SESSION, "quote lütfen");
    assert.equal(r.body.lead_texts?.submit, CURATED.tr!.lead_submit);
    assert.notEqual(r.body.lead_texts?.submit, EN.lead_submit);
  });
});
