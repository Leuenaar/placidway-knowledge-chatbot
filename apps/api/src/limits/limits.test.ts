/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/limits/limits.test.ts
 * PURPOSE : Test of the limiter (C6): the per-address limit, the daily token
 *           budget, simultaneous conversations, crisis messages, memory,
 *           configuration, the limit text, and the app with the limiter over
 *           real HTTP.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. limiter: per address
 *    2. limiter: daily token budget
 *    3. limiter: chats at the same time
 *    4. limiter: crisis messages
 *    5. limiter: memory
 *    6. limits config
 *    7. limit texts and language guess
 *    8. meter
 *    9. the app with limits (real HTTP)
 *    10. live bot: limited()
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { isChatResponse, QUOTE_URL } from "@pwbot/shared";
import type { ModelClient } from "../answer";
import { createApp } from "../app";
import type { Bot } from "../bot";
import { createHistoryStore } from "../history";
import { createLiveBot } from "../live/bot";
import { buildResponse } from "../responses";
import { LIMIT_DEFAULTS, LIMIT_TEXTS, createLimiter, guessLanguage, limitText, loadLimitsConfig, meterClient, type LimiterOptions } from "./index";

const MIN = 60_000;
const START = Date.UTC(2026, 9, 19, 10, 0, 0);

function clock(start = START) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}
function make(over: Partial<LimiterOptions> = {}, c = clock()) {
  return { c, limiter: createLimiter({ perWindow: 3, windowMs: 10 * MIN, perDay: 5, dailyTokens: 1000, maxConcurrent: 2, now: c.now, salt: "test", ...over }) };
}
const ok = (a: ReturnType<ReturnType<typeof createLimiter>["admit"]>) => {
  assert.equal(a.ok, true);
  if (a.ok) a.release();
};

// ===== PART 1: limiter: per address =====
describe("limiter: per address", () => {
  it("allows the burst size, refuses the next message with the seconds to wait, and frees a slot as the window slides", () => {
    const { c, limiter } = make({ perDay: 100 });
    for (let i = 0; i < 3; i++) ok(limiter.admit("1.2.3.4"));
    const refused = limiter.admit("1.2.3.4");
    assert.equal(refused.ok, false);
    if (!refused.ok) {
      assert.equal(refused.reason, "burst");
      assert.equal(refused.retryAfterSec, 600);
    }
    c.advance(4 * MIN);
    const still = limiter.admit("1.2.3.4");
    assert.equal(still.ok, false);
    if (!still.ok) assert.equal(still.retryAfterSec, 360);
    c.advance(6 * MIN + 1000);
    ok(limiter.admit("1.2.3.4"));
  });

  it("keeps addresses apart", () => {
    const { limiter } = make({ perDay: 100 });
    for (let i = 0; i < 3; i++) ok(limiter.admit("1.1.1.1"));
    assert.equal(limiter.admit("1.1.1.1").ok, false);
    ok(limiter.admit("2.2.2.2"));
  });

  it("stops an address after its daily number, until midnight UTC, then starts again", () => {
    const { c, limiter } = make({ perWindow: 100 });
    for (let i = 0; i < 5; i++) ok(limiter.admit("9.9.9.9"));
    const refused = limiter.admit("9.9.9.9");
    assert.equal(refused.ok, false);
    if (!refused.ok) {
      assert.equal(refused.reason, "daily");
      assert.equal(refused.retryAfterSec, 14 * 3600);
    }
    c.advance(14 * 3600 * 1000);
    ok(limiter.admit("9.9.9.9"));
  });

  it("a refused message is not counted, so waiting is enough", () => {
    const { c, limiter } = make({ perDay: 100 });
    for (let i = 0; i < 3; i++) ok(limiter.admit("5.5.5.5"));
    for (let i = 0; i < 20; i++) assert.equal(limiter.admit("5.5.5.5").ok, false);
    c.advance(10 * MIN + 1);
    ok(limiter.admit("5.5.5.5"));
  });
});

// ===== PART 2: limiter: daily token budget =====
describe("limiter: daily token budget", () => {
  it("refuses everybody once the day's tokens are used, and starts fresh the next UTC day", () => {
    const { c, limiter } = make({ perDay: 1000, perWindow: 1000 });
    ok(limiter.admit("a"));
    limiter.addTokens(600);
    ok(limiter.admit("b"));
    limiter.addTokens(400);
    const refused = limiter.admit("c");
    assert.equal(refused.ok, false);
    if (!refused.ok) {
      assert.equal(refused.reason, "budget");
      assert.equal(refused.retryAfterSec, 14 * 3600);
    }
    c.advance(14 * 3600 * 1000);
    assert.equal(limiter.stats().tokens, 0);
    ok(limiter.admit("c"));
  });

  it("ignores nonsense token counts", () => {
    const { limiter } = make();
    limiter.addTokens(Number.NaN);
    limiter.addTokens(-5);
    limiter.addTokens(Number.POSITIVE_INFINITY);
    assert.equal(limiter.stats().tokens, 0);
  });
});

// ===== PART 3: limiter: chats at the same time =====
describe("limiter: chats at the same time", () => {
  it("refuses with busy while the slots are taken and frees one when a chat is done (once, even if released twice)", () => {
    const { limiter } = make({ perDay: 1000, perWindow: 1000 });
    const a = limiter.admit("a");
    const b = limiter.admit("b");
    assert.equal(a.ok && b.ok, true);
    const busy = limiter.admit("c");
    assert.equal(busy.ok, false);
    if (!busy.ok) assert.equal(busy.reason, "busy");
    if (a.ok) { a.release(); a.release(); }
    assert.equal(limiter.stats().inFlight, 1);
    const c2 = limiter.admit("c");
    assert.equal(c2.ok, true);
    assert.equal(limiter.stats().inFlight, 2);
  });
});

// ===== PART 4: limiter: crisis messages =====
describe("limiter: crisis messages", () => {
  it("skip every limit, but only up to a small number per address and per day", () => {
    const { limiter } = make({ dailyTokens: 10, perWindow: 1, perDay: 1, maxConcurrent: 1, crisisPerWindow: 2, crisisPerDay: 3 });
    limiter.addTokens(100);
    assert.equal(limiter.admit("x").ok, false, "a normal message is refused (budget)");
    assert.equal(limiter.admit("x", { crisis: true }).ok, true);
    assert.equal(limiter.admit("x", { crisis: true }).ok, true);
    assert.equal(limiter.admit("x", { crisis: true }).ok, false, "third from the same address in the window");
    assert.equal(limiter.admit("y", { crisis: true }).ok, true, "another address, still under the day cap");
    assert.equal(limiter.admit("z", { crisis: true }).ok, false, "day cap of 3 over all visitors reached");
    assert.equal(limiter.stats().crisisToday, 3);
  });
});

// ===== PART 5: limiter: memory =====
describe("limiter: memory", () => {
  it("keeps no address anywhere, drops the least recently seen address beyond the cap", () => {
    const { limiter } = make({ maxKeys: 3, perDay: 1000, perWindow: 1000, maxConcurrent: 100 });
    for (const ip of ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"]) ok(limiter.admit(ip));
    const stats = limiter.stats();
    assert.equal(stats.keys, 3);
    assert.ok(!JSON.stringify(stats).includes("10.0.0"));
  });

  it("treats a missing address as one shared visitor instead of crashing", () => {
    const { limiter } = make({ perDay: 1000 });
    for (let i = 0; i < 3; i++) ok(limiter.admit(undefined));
    assert.equal(limiter.admit(undefined).ok, false);
  });
});

// ===== PART 6: limits config =====
describe("limits config", () => {
  it("has safe defaults and reads each setting", () => {
    const d = loadLimitsConfig({});
    assert.deepEqual([d.perWindow, d.perDay, d.dailyTokens, d.maxConcurrent, d.trustProxy], [LIMIT_DEFAULTS.perWindow, LIMIT_DEFAULTS.perDay, LIMIT_DEFAULTS.dailyTokens, LIMIT_DEFAULTS.maxConcurrent, 0]);
    const c = loadLimitsConfig({ RATE_LIMIT_PER_10_MIN: "20", RATE_LIMIT_PER_DAY: "50", DAILY_TOKEN_BUDGET: "3000000", MAX_CONCURRENT_CHATS: "4", TRUST_PROXY: "1" });
    assert.deepEqual([c.perWindow, c.perDay, c.dailyTokens, c.maxConcurrent, c.trustProxy], [20, 50, 3_000_000, 4, 1]);
    assert.equal(loadLimitsConfig({ RATE_LIMIT_PER_DAY: "  " }).perDay, LIMIT_DEFAULTS.perDay);
  });
  it("refuses a wrong value with the name of the setting", () => {
    for (const bad of [{ RATE_LIMIT_PER_10_MIN: "0" }, { RATE_LIMIT_PER_DAY: "abc" }, { DAILY_TOKEN_BUDGET: "5.5" }, { MAX_CONCURRENT_CHATS: "-1" }, { TRUST_PROXY: "99" }]) {
      assert.throws(() => loadLimitsConfig(bad), new RegExp(Object.keys(bad)[0]!));
    }
  });
});

// ===== PART 7: limit texts and language guess =====
describe("limit texts and language guess", () => {
  it("has every text in all five languages, none empty, no em dash", () => {
    for (const code of ["en", "id", "tr", "es", "ar"]) {
      for (const key of ["rate_limited", "busy", "budget"] as const) {
        const t = LIMIT_TEXTS[code]![key];
        assert.ok(t.length > 10, `${code}.${key}`);
        assert.ok(!t.includes("—"), `${code}.${key} has an em dash`);
      }
    }
  });
  it("maps reasons to texts; unknown languages get English", () => {
    assert.equal(limitText("en", "daily"), limitText("en", "budget"));
    assert.notEqual(limitText("en", "burst"), limitText("en", "busy"));
    assert.equal(limitText("de", "burst"), limitText("en", "burst"));
  });
  it("guesses the five languages from script and common words, and says English when unsure", () => {
    assert.equal(guessLanguage("كم تكلفة العلاج؟"), "ar");
    assert.equal(guessLanguage("Tedavi ne kadar tutuyor?"), "tr");
    assert.equal(guessLanguage("Artık dayanamıyorum"), "tr");
    assert.equal(guessLanguage("¿Cuánto cuesta el tratamiento?"), "es");
    assert.equal(guessLanguage("Berapa biaya paket ini?"), "id");
    assert.equal(guessLanguage("How much does it cost?"), "en");
    assert.equal(guessLanguage("Wie viel kostet das?"), "en");
  });
});

// ===== PART 8: meter =====
describe("meter", () => {
  it("reports input plus output tokens of every call, and nothing when the call fails", async () => {
    const seen: number[] = [];
    let fail = false;
    const inner: ModelClient = { complete: async () => { if (fail) throw new Error("down"); return { text: "x", stopReason: "end_turn", inputTokens: 100, outputTokens: 40, thinkingTokens: 30 }; } };
    const m = meterClient(inner, (n) => seen.push(n));
    const out = await m.complete({ system: "s", user: "u", maxTokens: 10 });
    assert.equal(out.text, "x");
    fail = true;
    await assert.rejects(() => m.complete({ system: "s", user: "u", maxTokens: 10 }));
    assert.deepEqual(seen, [140]);
  });
});

// ===== PART 9: the app with limits (real HTTP) =====
describe("the app with limits (real HTTP)", () => {
  async function start(opts: { limiter: ReturnType<typeof createLimiter>; bot: Bot; trustProxy?: number }) {
    const server: Server = createApp({ bot: opts.bot, limiter: opts.limiter, ...(opts.trustProxy ? { trustProxy: opts.trustProxy } : {}) }).listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (message: string, headers: Record<string, string> = {}) =>
      fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ session_id: "11111111-1111-4111-8111-111111111111", message }) });
    return { post, close: () => server.close() };
  }
  const fine: Bot = { reply: async () => ({ status: 200, body: buildResponse({ kind: "answer", answer: "ok", sources: [] }) }) };

  it("answers 429 with Retry-After and a valid rate_limited reply in English when the bot has no limited() text", async () => {
    const { limiter } = make({ perWindow: 1, perDay: 100 });
    const s = await start({ limiter, bot: fine });
    try {
      assert.equal((await s.post("hello")).status, 200);
      const r = await s.post("hello again");
      assert.equal(r.status, 429);
      assert.equal(r.headers.get("retry-after"), "600");
      const body = await r.json();
      assert.ok(isChatResponse(body));
      assert.equal(body.kind, "rate_limited");
      assert.equal(body.answer, limitText("en", "burst"));
    } finally { s.close(); }
  });

  it("does not count a bad request, and does not call the bot when refused", async () => {
    const { limiter } = make({ perWindow: 1, perDay: 100 });
    let calls = 0;
    const s = await start({ limiter, bot: { reply: async () => { calls++; return fine.reply("", ""); } } });
    try {
      assert.equal((await s.post("   ")).status, 400);
      assert.equal((await s.post("one")).status, 200);
      assert.equal((await s.post("two")).status, 429);
      assert.equal(calls, 1);
    } finally { s.close(); }
  });

  it("lets a crisis message through while the budget is used up", async () => {
    const { limiter } = make({ dailyTokens: 10 });
    limiter.addTokens(50);
    const s = await start({ limiter, bot: fine });
    try {
      assert.equal((await s.post("How much is it?")).status, 429);
      assert.equal((await s.post("I want to kill myself")).status, 200);
    } finally { s.close(); }
  });

  it("frees the concurrency slot when the bot fails", async () => {
    const { limiter } = make({ maxConcurrent: 1, perWindow: 100, perDay: 100 });
    const s = await start({ limiter, bot: { reply: async () => { throw new Error("boom"); } } });
    try {
      const origError = console.error;
      console.error = () => {};
      try {
        assert.equal((await s.post("a")).status, 500);
        assert.equal((await s.post("b")).status, 500, "not 429: the slot was released");
      } finally { console.error = origError; }
      assert.equal(limiter.stats().inFlight, 0);
    } finally { s.close(); }
  });

  it("tells visitors apart by X-Forwarded-For only when a proxy is trusted", async () => {
    const trusted = await start({ limiter: make({ perWindow: 1, perDay: 100 }).limiter, bot: fine, trustProxy: 1 });
    try {
      assert.equal((await trusted.post("a", { "X-Forwarded-For": "203.0.113.1" })).status, 200);
      assert.equal((await trusted.post("a", { "X-Forwarded-For": "203.0.113.2" })).status, 200, "another visitor behind the proxy");
      assert.equal((await trusted.post("a", { "X-Forwarded-For": "203.0.113.1" })).status, 429);
    } finally { trusted.close(); }
    const direct = await start({ limiter: make({ perWindow: 1, perDay: 100 }).limiter, bot: fine });
    try {
      assert.equal((await direct.post("a", { "X-Forwarded-For": "203.0.113.1" })).status, 200);
      assert.equal((await direct.post("a", { "X-Forwarded-For": "203.0.113.2" })).status, 429, "the header is ignored without TRUST_PROXY, so a visitor cannot dodge the limit by faking it");
    } finally { direct.close(); }
  });
});

// ===== PART 10: live bot: limited() =====
describe("live bot: limited()", () => {
  function liveBot() {
    const history = createHistoryStore();
    let modelCalls = 0;
    const bot = createLiveBot({
      retriever: { search: async () => { modelCalls++; return []; }, pages: async () => { modelCalls++; return []; }, containing: async () => { modelCalls++; return []; } },
      answerer: { answer: async () => { modelCalls++; throw new Error("no"); } },
      rewriter: { rewrite: async () => { modelCalls++; throw new Error("no"); } },
      history,
      log: () => {},
    });
    return { bot, history, calls: () => modelCalls };
  }
  const SID = "11111111-1111-4111-8111-111111111111";

  it("answers 429 rate_limited in the language of the message, with no model or database call", async () => {
    const t = liveBot();
    const tr = await t.bot.limited!(SID, "Tedavi ne kadar tutuyor?", "burst");
    assert.equal(tr.status, 429);
    assert.equal(tr.body.kind, "rate_limited");
    assert.equal(tr.body.answer, limitText("tr", "burst"));
    assert.equal(tr.body.quote_url, null);
    assert.equal((await t.bot.limited!(SID, "كم السعر", "busy")).body.answer, limitText("ar", "busy"));
    assert.equal((await t.bot.limited!(SID, "Wie viel?", "burst")).body.answer, limitText("en", "burst"));
    assert.equal(t.calls(), 0);
  });

  it("uses the language the session already had, when it is one of the five", async () => {
    const t = liveBot();
    t.history.setFlags(SID, { languageCode: "id", languageName: "Indonesian" });
    assert.equal((await t.bot.limited!(SID, "ok", "burst")).body.answer, limitText("id", "burst"));
    t.history.setFlags(SID, { languageCode: "de", languageName: "German" });
    assert.equal((await t.bot.limited!(SID, "ok", "burst")).body.answer, limitText("en", "burst"));
  });

  it("offers the quote link only for the day limit (not for burst or busy), and never in care mode", async () => {
    const t = liveBot();
    assert.equal((await t.bot.limited!(SID, "hi", "budget")).body.quote_url, QUOTE_URL);
    assert.equal((await t.bot.limited!(SID, "hi", "daily")).body.quote_url, QUOTE_URL);
    assert.equal((await t.bot.limited!(SID, "hi", "burst")).body.quote_url, null);
    t.history.setFlags(SID, { care: true });
    assert.equal((await t.bot.limited!(SID, "hi", "budget")).body.quote_url, null);
  });
});
