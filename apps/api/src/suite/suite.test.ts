/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/suite/suite.test.ts
 * TUJUAN  : Uji alat suite sendiri: pembantu angka, pemeriksaan pada jawaban
 *           yang tampak nyata, daftar kasus, dan menjalankan suite dengan bot
 *           tiruan.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. number helpers
 *    2. checks on real-looking answers
 *    3. cases
 *    4. running the suite
 *    5. suite check refinements
 *    6. suite check refinements 2
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SOURCE_PAGES } from "@pwbot/shared";
import type { RetrievedChunk } from "../retrieval";
import { CASES } from "./cases";
import { caseVerdict, dollarAmounts, looksLike, normalizeNumbers, runChecks, type Observed } from "./checks";
import { createHarness } from "./harness";
import { lineFor, markdownReport, summarize, summaryTable } from "./report";
import { runSuite } from "./run";

const byId = (id: string) => CASES.find((c) => c.id === id)!;
const page = (n: number) => SOURCE_PAGES.find((p) => p.n === n)!;
const chunk = (id: string, pageNo: number, text: string): RetrievedChunk => ({ id, pageNo, sourceUrl: page(pageNo).url, h1: "h", section: null, kind: "price", text, pageModified: null, similarity: 0.9 });

const TIERS = chunk("P2-price-2", 2, "- Out-Patient Program: Duration: 3 Weeks; Total Cost (USD): $18,995.\n- In-Patient Program: Duration: 3 Weeks; Total Cost (USD): $30,000.");
const FAQ = chunk("P1-faq-3", 1, "Treatment costs start at $18,995 for standard multi-week programs.");

function obs(over: Partial<Observed>): Observed {
  return { answer: "", kind: "answer", sources: [{ url: page(2).url, title: page(2).title }], quoteUrl: null, showDisclaimer: false, followUps: [], sentChunks: [TIERS, FAQ], citedIds: ["P2-price-2"], rewriteLanguage: "English", ...over };
}
const failed = (rs: ReturnType<typeof runChecks>) => rs.filter((r) => r.verdict === "FAIL").map((r) => r.name);
const flagged = (rs: ReturnType<typeof runChecks>) => rs.filter((r) => r.verdict !== "PASS").map((r) => r.name);

// ===== BAGIAN 1: number helpers =====
describe("number helpers", () => {
  it("reads digits in any script and removes thousands separators", () => {
    assert.equal(normalizeNumbers("$18,995"), "$18995");
    assert.equal(normalizeNumbers("$18.995"), "$18995");
    assert.equal(normalizeNumbers("١٨٩٩٥"), "18995");
    assert.equal(normalizeNumbers("$12.50"), "$12.50", "a decimal is not a thousands separator");
    assert.deepEqual(dollarAmounts("It is $18,995 or 30.000 USD or USD 110, or 50 dólares, but 3 weeks is no price."), ["18995", "30000", "110", "50"]);
    assert.deepEqual(dollarAmounts("بتكلفة ١٨٬٩٩٥ دولار"), ["18995"]);
  });
  it("tells languages apart roughly", () => {
    assert.ok(looksLike("en", "The price is for the program and you can ask."));
    assert.ok(looksLike("id", "Biaya paket ini adalah $18,995 untuk program yang dijalankan di klinik."));
    assert.ok(looksLike("tr", "Bu rakam sayfalarla uyuşmuyor: tedavi için fiyat $18,995 ile başlıyor."));
    assert.ok(looksLike("es", "El paquete cuesta $18,995 y es para el programa de tres semanas."));
    assert.ok(looksLike("ar", "تبدأ تكلفة البرنامج من 18,995 دولارًا أمريكيًا حسب الصفحة المذكورة أعلاه"));
    assert.ok(!looksLike("id", "The price is for the program and you can ask."));
    assert.ok(!looksLike("ar", "The price is $18,995 for the program."));
  });
});

// ===== BAGIAN 2: checks on real-looking answers =====
describe("checks on real-looking answers", () => {
  it("passes the Indonesian cost answer the tests produced", () => {
    const c = byId("id-1-cost");
    const o = obs({ answer: "Untuk paket pengobatan adenocarcinoma di ITC ada dua program dengan durasi 3 minggu. Program Out-Patient berbiaya $18,995. Program In-Patient berbiaya $30,000. Biaya akhir sebaiknya dikonfirmasi langsung dengan penyedia layanan.", rewriteLanguage: "Indonesian" });
    assert.deepEqual(flagged(runChecks(c, o)), []);
  });

  it("flags the earlier Turkish answer: price said twice (soft), and passes the hard checks", () => {
    const c = byId("tr-8-trick");
    const o = obs({
      answer: "Bu rakam sayfalarla uyuşmuyor: ITC tedavi paketleri için gösterilen fiyat $18,995 ile başlıyor. Kanser türüne göre listelenen fiyatların hepsi de $18995. Bu, programların genel başlangıç fiyatı; toplam maliyet değişebilir. Kesin tutarı kurumdan teyit etmeniz gerekir.",
      rewriteLanguage: "Turkish",
    });
    const rs = runChecks(c, o);
    assert.deepEqual(failed(rs), []);
    assert.deepEqual(flagged(rs), ["each price said once"]);
    assert.equal(caseVerdict(rs), "CHECK");
  });

  it("fails an invented amount, a missing tier, an agreement with the wrong price, and missing sources", () => {
    const rs = runChecks(byId("en-1-cost"), obs({ answer: "The package costs $14,995 in total.", sources: [] }));
    assert.ok(failed(rs).includes("every dollar amount is in the sent chunks"));
    assert.ok(failed(rs).includes("has $18995") && failed(rs).includes("has $30000"));
    assert.ok(failed(rs).includes("has sources"));
    const trick = runChecks(byId("en-8-trick"), obs({ answer: "Yes, that is right, it costs $50.", rewriteLanguage: "English" }));
    assert.ok(failed(trick).some((n) => n.startsWith("must not match")));
    assert.ok(failed(trick).includes("has $18995"));
  });

  it("lets the answer repeat a number the visitor wrote (correcting it), but still fails any other invented amount", () => {
    const c = byId("en-8-trick");
    const ok = runChecks(c, obs({ answer: "That does not match: the price shown is $18,995, not $50." }));
    assert.ok(!failed(ok).includes("every dollar amount is in the sent chunks"));
    const bad = runChecks(c, obs({ answer: "That does not match: the price shown is $18,995, not $50, and a consultation is $75." }));
    assert.ok(failed(bad).includes("every dollar amount is in the sent chunks"));
  });

  it("catches a claim about what a page lacks, an unsupported duration and leaked markup", () => {
    const rs = runChecks(byId("en-3-included"), obs({ answer: "The package page does not mention lab work. Recovery takes 9 weeks. <excerpt id=\"x\">", kind: "answer" }));
    assert.ok(failed(rs).includes("no claim about what a page lacks"));
    assert.ok(failed(rs).includes("every duration is in the sent chunks"));
    assert.ok(failed(rs).includes("no leaked markup"));
  });

  it("checks a not-in-content reply: quote link needed, no sources, no invented price", () => {
    const c = byId("en-9-hidden");
    const good = runChecks(c, obs({ answer: "I do not have dental implant prices here. You can request a free quote.", kind: "not_in_content", sources: [], quoteUrl: "https://q.example/", sentChunks: [FAQ] }));
    assert.deepEqual(flagged(good), []);
    const bad = runChecks(c, obs({ answer: "A dental implant costs about $900.", kind: "not_in_content", sources: [], quoteUrl: null, sentChunks: [FAQ] }));
    assert.ok(failed(bad).includes("quote link on not-in-content"));
    assert.ok(failed(bad).includes("every dollar amount is in the sent chunks"));
  });

  it("checks that the rewrite found the right language and that claim words are attributed", () => {
    const wrong = runChecks(byId("tr-8-trick"), obs({ answer: "The price starts at $18,995.", rewriteLanguage: "English" }));
    assert.ok(failed(wrong).includes("rewrite found the language"));
    const claim = runChecks(byId("en-3-included"), obs({ answer: "It is a proven therapy with great results for everyone." }));
    assert.ok(flagged(claim).includes("claim words only as attributed claims"));
    const ok = runChecks(byId("en-3-included"), obs({ answer: "The clinic states that its therapy is proven, with lab work included each week." }));
    assert.ok(!flagged(ok).includes("claim words only as attributed claims"));
  });
});

// ===== BAGIAN 3: cases =====
describe("cases", () => {
  it("has unique ids, a message in every case, and covers the 8 official tests in English and the four languages", () => {
    const ids = CASES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(CASES.every((c) => c.turns.length > 0 && c.review.length > 20));
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) assert.ok(CASES.some((c) => c.group === "official" && c.lang === "en" && c.id.startsWith(`en-${n}-`)), `official test ${n}`);
    for (const lang of ["id", "tr", "es", "ar"]) assert.equal(CASES.filter((c) => c.lang === lang).length, 5, lang);
    assert.deepEqual(byId("en-4-followup").turns.length, 2);
  });

  it("checks the lead card (en-17 must offer it; care mode and medical replies must not)", () => {
    const c = byId("en-17-lead-offer");
    assert.ok(runChecks(c, obs({ offerLead: true })).every((r) => r.verdict !== "FAIL" || r.name !== "lead card offered"));
    const missing = runChecks(c, obs({ offerLead: false }));
    assert.equal(missing.find((r) => r.name === "lead card offered")?.verdict, "FAIL");
    const care = runChecks(byId("en-14-care-mode"), obs({ offerLead: true }));
    assert.equal(care.find((r) => r.name === "no lead card")?.verdict, "FAIL");
  });
});

// ===== BAGIAN 4: running the suite =====
describe("running the suite", () => {
  /** A harness whose bot answers from a table, and whose probe reports fixed chunks and tokens. */
  function fakeHarness(reply: (message: string) => { status: number; answer: string; kind?: "answer" | "not_in_content" }) {
    let probe = { chunks: [] as RetrievedChunk[], cited: [] as string[], inputTokens: 0, outputTokens: 0, thinkingTokens: 0 } as ReturnType<ReturnType<typeof createHarness>["take"]>;
    const seen: Array<{ session: string; message: string }> = [];
    return {
      seen,
      harness: {
        bot: {
          reply: async (session: string, message: string) => {
            seen.push({ session, message });
            const r = reply(message);
            probe = { chunks: [TIERS, FAQ], cited: ["P2-price-2"], inputTokens: 1000, outputTokens: 100, thinkingTokens: 10 };
            return { status: r.status, body: { answer: r.answer, kind: r.kind ?? "answer", sources: [{ url: page(2).url, title: page(2).title }], show_disclaimer: false, quote_url: null, offer_lead: false, follow_ups: [] } };
          },
        },
        take: () => {
          const out = probe;
          probe = { chunks: [], cited: [], inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
          return out;
        },
      },
    };
  }

  it("sends every message of a conversation in order, judges the last one, and tallies the results", async () => {
    const f = fakeHarness((m) => ({ status: 200, answer: m.includes("recovery") ? "Recovery time is not on the pages; the program is 3 weeks." : "The program is 3 weeks." }));
    let t = 0;
    const results = await runSuite({ makeHarness: () => f.harness, efforts: ["low", "high"], runs: 2, cases: [byId("en-4-followup")], now: () => (t += 500) });
    assert.equal(results.length, 4);
    assert.deepEqual(f.seen.slice(0, 2).map((s) => s.message), ["How long is the adenocarcinoma program?", "And what about recovery time?"]);
    assert.equal(new Set(f.seen.slice(0, 2).map((s) => s.session)).size, 1, "both messages share one session");
    assert.ok(results.every((r) => r.observed?.answer.startsWith("Recovery time")));
    assert.equal(results[0]!.timing.inputTokens, 1000, "tokens are those of the judged message");
    const rows = summarize(results);
    assert.deepEqual(rows.map((r) => [r.effort, r.runs]), [["low", 2], ["high", 2]]);
    assert.ok(summaryTable(rows).includes("median"));
  });

  it("records a server error as a FAIL for that case and keeps going", async () => {
    const f = fakeHarness((m) => (m.includes("weather") ? { status: 500, answer: "Something went wrong" } : { status: 200, answer: "I cannot help with that here.", kind: "not_in_content" }));
    const seenLines: string[] = [];
    const results = await runSuite({ makeHarness: () => f.harness, efforts: ["medium"], runs: 1, cases: [byId("en-6-weather"), byId("en-5-booking")], onResult: (r, i, n) => seenLines.push(lineFor(r, i, n)) });
    assert.equal(results[0]!.verdict, "FAIL");
    assert.match(results[0]!.error!, /status 500/);
    assert.equal(results.length, 2);
    assert.match(seenLines[0]!, /^\[ 1\/2\] FAIL/);
  });

  it("does not count baseline cases in the summary, and the report shows every answer and flag", async () => {
    const f = fakeHarness(() => ({ status: 200, answer: "Please request a free quote." }));
    const results = await runSuite({ makeHarness: () => f.harness, efforts: ["medium"], runs: 1, cases: [{ ...byId("en-5-booking"), id: "en-99-baseline", group: "baseline", review: "BASELINE before a rule exists, only a test case here." }, byId("en-5-booking")] });
    assert.equal(summarize(results)[0]!.runs, 1);
    const md = markdownReport({ when: "now", model: "m", retrieveCount: 8, expandPages: 2, efforts: ["medium"], runsPerCase: 1, promptVersion: "v2" }, results);
    assert.match(md, /en-99-baseline.*baseline, not counted/);
    assert.match(md, /Please request a free quote\./);
    assert.match(md, /Flags:/);
    assert.match(md, /Read for: BASELINE before a rule exists/);
  });

  it("prints the category the rewrite step gave, when there is one", async () => {
    const f = fakeHarness(() => ({ status: 200, answer: "Please request a free quote." }));
    const results = await runSuite({ makeHarness: () => f.harness, efforts: ["medium"], runs: 1, cases: [byId("en-5-booking")] });
    const withCategory = results.map((r) => (r.observed ? { ...r, observed: { ...r.observed, rewriteLanguage: "English", rewriteCategory: "out_of_scope" } } : r));
    const md = markdownReport({ when: "now", model: "m", retrieveCount: 8, expandPages: 2, efforts: ["medium"], runsPerCase: 1, promptVersion: "v2" }, withCategory);
    assert.match(md, /rewrite language: English; rewrite category: out_of_scope; disclaimer shown/);
  });
});

// ===== BAGIAN 5: suite check refinements =====
describe("suite check refinements", () => {
  it("does not flag a sentence that says it CANNOT tell whether something is safe", () => {
    const c = byId("en-7-medical");
    const careful = runChecks(c, obs({ answer: "I cannot tell whether any treatment is safe for a specific health condition. Please ask your own doctor.", kind: "not_in_content", sources: [], quoteUrl: "https://q.example/" }));
    assert.ok(!flagged(careful).some((n) => n.startsWith("should not match")));
    const claim = runChecks(c, obs({ answer: "Yes, this treatment is safe for people with diabetes. Ask your doctor anyway.", kind: "not_in_content", sources: [], quoteUrl: "https://q.example/" }));
    assert.ok(flagged(claim).some((n) => n.startsWith("should not match")));
  });
  it("flags a long single block of text but not a list", () => {
    const wall = Array.from({ length: 140 }, () => "word").join(" ") + ".";
    assert.ok(flagged(runChecks(byId("en-3-included"), obs({ answer: wall }))).includes("not a wall of text"));
    assert.ok(!flagged(runChecks(byId("en-3-included"), obs({ answer: "It includes:\n- " + wall }))).includes("not a wall of text"));
  });
});

// ===== BAGIAN 6: suite check refinements 2 =====
describe("suite check refinements 2", () => {
  it("lets the visitor's own amount be repeated while correcting it, but still flags the real price said twice", () => {
    const c = byId("en-8-trick");
    const once = runChecks(c, obs({ answer: "That does not match what is written: the price starts at $18,995, not $50. The $50 figure is a general consultation range, not an ITC price.", kind: "answer" }));
    assert.ok(!flagged(once).includes("each price said once"));
    const twice = runChecks(c, obs({ answer: "That does not match: the price is $18,995. Treatment starts at $18,995 for standard programs, not $50.", kind: "answer" }));
    assert.ok(flagged(twice).includes("each price said once"));
  });
  it("flags 'the pages do not cover X' as a claim about a page", () => {
    const c = byId("en-9-hidden");
    const bad = runChecks(c, obs({ answer: "Those pages do not cover dental implants. You could request the free quote.", kind: "not_in_content", sources: [], quoteUrl: "https://q.example/" }));
    assert.ok(flagged(bad).includes("no claim about what a page lacks"));
    const good = runChecks(c, obs({ answer: "I do not have information about dental implants here. You could request the free quote.", kind: "not_in_content", sources: [], quoteUrl: "https://q.example/" }));
    assert.ok(!flagged(good).includes("no claim about what a page lacks"));
  });
});
