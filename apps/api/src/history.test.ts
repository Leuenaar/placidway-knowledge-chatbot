/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/history.test.ts
 * PURPOSE : Test of the conversation history store in the server memory
 *           (src/history.ts): the message limit, the expiry, and the history
 *           seed from the browser.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. history store
 *    2. history store: turns from the browser (seed)
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHistoryStore } from "./history";

// ===== PART 1: history store =====
describe("history store", () => {
  it("returns nothing for an unknown session and keeps sessions apart", () => {
    const h = createHistoryStore();
    assert.deepEqual(h.get("a"), []);
    h.add("a", "hi", "hello");
    assert.deepEqual(h.get("a"), [{ role: "visitor", text: "hi" }, { role: "assistant", text: "hello" }]);
    assert.deepEqual(h.get("b"), []);
  });

  it("keeps only the last maxMessages messages, oldest dropped first", () => {
    const h = createHistoryStore({ maxMessages: 4 });
    for (let i = 1; i <= 4; i++) h.add("a", `q${i}`, `a${i}`);
    assert.deepEqual(h.get("a").map((t) => t.text), ["q3", "a3", "q4", "a4"]);
  });

  it("returns a copy, so a caller cannot change the stored history", () => {
    const h = createHistoryStore();
    h.add("a", "q", "a");
    h.get("a").push({ role: "visitor", text: "injected" });
    assert.equal(h.get("a").length, 2);
  });

  it("forgets a session after the time limit without activity, and activity renews it", () => {
    let t = 0;
    const h = createHistoryStore({ ttlMs: 1000, now: () => t });
    h.add("a", "q", "a");
    t = 900;
    assert.equal(h.get("a").length, 2);
    h.add("a", "q2", "a2");
    t = 1800;
    assert.equal(h.get("a").length, 4, "renewed by the second message");
    t = 3000;
    assert.deepEqual(h.get("a"), []);
  });

  it("drops the least recently used session when too many exist", () => {
    const h = createHistoryStore({ maxSessions: 2 });
    h.add("a", "q", "a");
    h.add("b", "q", "a");
    h.add("a", "q2", "a2");
    h.add("c", "q", "a");
    assert.deepEqual(h.get("b"), []);
    assert.equal(h.get("a").length, 4);
    assert.equal(h.get("c").length, 2);
  });

  it("keeps per-session flags, off by default, and keeps them apart", () => {
    const h = createHistoryStore();
    assert.deepEqual(h.flags("a"), { care: false, disclaimerShown: false });
    h.setFlags("a", { care: true });
    h.setFlags("a", { languageCode: "tr", languageName: "Turkish" });
    assert.deepEqual(h.flags("a"), { care: true, disclaimerShown: false, languageCode: "tr", languageName: "Turkish" });
    assert.equal(h.flags("b").care, false);
    h.add("a", "q", "r");
    assert.equal(h.flags("a").care, true, "adding a turn keeps the flags");
  });

  it("forgets flags together with the turns after the time limit", () => {
    let t = 0;
    const h = createHistoryStore({ ttlMs: 1000, now: () => t });
    h.setFlags("a", { care: true, disclaimerShown: true });
    t = 500;
    assert.equal(h.flags("a").care, true);
    t = 2000;
    assert.deepEqual(h.flags("a"), { care: false, disclaimerShown: false });
  });

  it("returns a copy of the flags", () => {
    const h = createHistoryStore();
    h.setFlags("a", { care: true });
    h.flags("a").care = false;
    assert.equal(h.flags("a").care, true);
  });
});

// ===== PART 2: history store: turns from the browser (seed) =====
describe("history store: turns from the browser (seed)", () => {
  const turns = [
    { role: "visitor" as const, text: "q1" },
    { role: "assistant" as const, text: "a1" },
  ];

  it("takes the turns for a session the server does not know, and keeps the flags untouched", () => {
    const h = createHistoryStore();
    assert.equal(h.seed("a", turns), true);
    assert.deepEqual(h.get("a"), turns);
    assert.deepEqual(h.flags("a"), { care: false, disclaimerShown: false });
  });

  it("ignores the turns when the server has its own history for the session", () => {
    const h = createHistoryStore();
    h.add("a", "mine", "mine too");
    assert.equal(h.seed("a", turns), false);
    assert.deepEqual(h.get("a").map((t) => t.text), ["mine", "mine too"]);
  });

  it("seeds a session that only has flags (no turns yet) and keeps those flags", () => {
    const h = createHistoryStore();
    h.setFlags("a", { care: true });
    assert.equal(h.seed("a", turns), true);
    assert.equal(h.flags("a").care, true);
  });

  it("does nothing for an empty list, keeps at most maxMessages, and copies what it gets", () => {
    const h = createHistoryStore({ maxMessages: 2 });
    assert.equal(h.seed("a", []), false);
    const many = [...turns, { role: "visitor" as const, text: "q2" }, { role: "assistant" as const, text: "a2" }];
    h.seed("a", many);
    assert.deepEqual(h.get("a").map((t) => t.text), ["q2", "a2"]);
    many[3]!.text = "changed";
    assert.equal(h.get("a")[1]!.text, "a2");
  });

  it("seeds again after the server forgot the session", () => {
    let t = 0;
    const h = createHistoryStore({ ttlMs: 1000, now: () => t });
    h.add("a", "old", "old");
    t = 5000;
    assert.equal(h.seed("a", turns), true);
    assert.deepEqual(h.get("a"), turns);
  });
});

