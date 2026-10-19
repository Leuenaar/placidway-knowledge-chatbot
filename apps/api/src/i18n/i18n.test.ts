/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/i18n/i18n.test.ts
 * PURPOSE : Test of the fixed text and the translator (src/i18n): the text
 *           keys are complete, the curated text per language, and the model
 *           translator with a stand-in.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. fixed texts
 *    2. localizer
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Completion, ModelClient } from "../answer";
import { CURATED, EN, HELPLINE_DIRECTORY, TEXT_KEYS, createLocalizer, primaryCode } from ".";

function model(handler: (user: string) => string | Error) {
  const calls: string[] = [];
  const client: ModelClient = {
    complete: async (input): Promise<Completion> => {
      calls.push(input.user);
      const out = handler(input.user);
      if (out instanceof Error) throw out;
      return { text: out, stopReason: "end_turn", inputTokens: 1, outputTokens: 1, thinkingTokens: 0 };
    },
  };
  return { client, calls };
}

const translateAll = (prefix: string) => JSON.stringify(Object.fromEntries(TEXT_KEYS.map((k) => [k, k === "crisis" ? `${prefix} ${EN.crisis}` : `${prefix} ${EN[k]}`])));

// ===== PART 1: fixed texts =====
describe("fixed texts", () => {
  it("has every key in all five hand-written languages, none empty", () => {
    assert.deepEqual(Object.keys(CURATED).sort(), ["ar", "en", "es", "id", "tr"]);
    for (const [lang, t] of Object.entries(CURATED)) {
      for (const k of TEXT_KEYS) assert.ok(t[k] && t[k].trim().length > 3, `${lang}.${k} is missing`);
    }
  });

  it("every crisis text points to the helpline directory, and none has a phone number", () => {
    for (const [lang, t] of Object.entries(CURATED)) {
      assert.ok(t.crisis.includes(HELPLINE_DIRECTORY), `${lang} crisis text lacks ${HELPLINE_DIRECTORY}`);
      assert.ok(!/\d{3}/.test(t.crisis), `${lang} crisis text contains digits that look like a phone number`);
    }
  });

  it("the English crisis text is the approved wording", () => {
    assert.match(EN.crisis, /^I'm really sorry you're going through this\. I'm an AI assistant that answers questions about the ITC clinic/);
    assert.match(EN.crisis, /local emergency number/);
  });

  it("has no em dashes (client-facing text)", () => {
    for (const t of Object.values(CURATED)) for (const k of TEXT_KEYS) assert.ok(!t[k].includes("—"), k);
  });

  it("maps language codes to their primary part", () => {
    assert.equal(primaryCode("pt-BR"), "pt");
    assert.equal(primaryCode("ID"), "id");
    assert.equal(primaryCode(undefined), "en");
    assert.equal(primaryCode("???"), "en");
  });
});

// ===== PART 2: localizer =====
describe("localizer", () => {
  it("gives hand-written languages from the table without calling the model", async () => {
    const m = model(() => new Error("must not be called"));
    const l = createLocalizer({ client: m.client, log: () => {} });
    const t = await l.get(["crisis", "ask_cost"], { code: "id-ID", name: "Indonesian" });
    assert.equal(t.ask_cost, CURATED.id!.ask_cost);
    assert.equal(m.calls.length, 0);
  });

  it("uses English when the language is unknown or missing", async () => {
    const l = createLocalizer({ log: () => {} });
    assert.equal((await l.get(["error"], {})).error, EN.error);
  });

  it("translates other languages once, keeps the result, and asks again for nothing", async () => {
    const m = model(() => translateAll("[de]"));
    const l = createLocalizer({ client: m.client, log: () => {} });
    const a = await l.get(["crisis", "error"], { code: "de", name: "German" });
    const b = await l.get(["disclaimer"], { code: "de", name: "German" });
    assert.ok(a.crisis.startsWith("[de]"));
    assert.ok(b.disclaimer.startsWith("[de]"));
    assert.equal(m.calls.length, 1, "one request for all texts");
    assert.match(m.calls[0]!, /Target language: German/);
  });

  it("runs only one translation when two visitors need the same language at the same time", async () => {
    const m = model(() => translateAll("[fr]"));
    const l = createLocalizer({ client: m.client, log: () => {} });
    await Promise.all([l.get(["error"], { code: "fr", name: "French" }), l.get(["error"], { code: "fr", name: "French" })]);
    assert.equal(m.calls.length, 1);
  });

  it("falls back to English when the model fails, and waits before trying again", async () => {
    let t = 0;
    let fail = true;
    const logs: string[] = [];
    const m = model(() => (fail ? new Error("HTTP 529") : translateAll("[de]")));
    const l = createLocalizer({ client: m.client, log: (x) => logs.push(x), now: () => t });
    assert.equal((await l.get(["error"], { code: "de", name: "German" })).error, EN.error);
    assert.equal(logs.length, 1);
    fail = false;
    t = 60_000;
    assert.equal((await l.get(["error"], { code: "de", name: "German" })).error, EN.error, "not retried within 5 minutes");
    assert.equal(m.calls.length, 1);
    t = 6 * 60_000;
    assert.ok((await l.get(["error"], { code: "de", name: "German" })).error.startsWith("[de]"), "retried later");
  });

  it("never uses a translated crisis text that lost the helpline address", async () => {
    const reply = JSON.stringify({ ...Object.fromEntries(TEXT_KEYS.map((k) => [k, `[de] ${EN[k]}`])), crisis: "Es tut mir leid. Rufen Sie den Notruf an." });
    const l = createLocalizer({ client: model(() => reply).client, log: () => {} });
    const t = await l.get(["crisis", "error"], { code: "de", name: "German" });
    assert.equal(t.crisis, EN.crisis);
    assert.ok(t.error.startsWith("[de]"), "the other texts are still used");
  });

  it("falls back to English for a reply that is not a set of texts", async () => {
    const l = createLocalizer({ client: model(() => "sorry").client, log: () => {} });
    assert.equal((await l.get(["not_found"], { code: "de", name: "German" })).not_found, EN.not_found);
  });
});
