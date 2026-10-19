/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/storage.test.tsx
 * TUJUAN  : Uji obrolan yang diingat browser: apa yang disimpan, dipulihkan,
 *           dan terutama apa yang TIDAK pernah disimpan (obrolan krisis) atau
 *           tidak dipercaya (data rusak atau lama).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. saveChat and loadChat
 *    2. buildHistory
 *    3. the contact card outcome
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

/**
 * Tests for the chat the browser remembers: what is saved, what is restored, and above all what is NEVER kept
 * (a crisis chat) or never trusted (a damaged or old entry).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatResponse } from "@pwbot/shared";
import { MAX_STORED_BYTES, MAX_STORED_MESSAGES, STORAGE_KEY, buildHistory, clearChat, loadChat, saveChat, type TabStorage } from "./storage";
import type { ChatMessage } from "./types";

const SID = "11111111-1111-4111-8111-111111111111";

function memoryStore(initial: Record<string, string> = {}): TabStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

const brokenStore: TabStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("full"); },
  removeItem: () => { throw new Error("blocked"); },
};

const response = (kind: ChatResponse["kind"], answer: string): ChatResponse => ({ answer, kind, sources: [], show_disclaimer: false, quote_url: null, offer_lead: false, follow_ups: [] });
const user = (n: number, text: string): ChatMessage => ({ id: `m${n}`, role: "user", text });
const bot = (n: number, text: string, kind: ChatResponse["kind"] = "answer"): ChatMessage => ({ id: `m${n}`, role: "assistant", text, response: response(kind, text) });

// ===== BAGIAN 1: saveChat and loadChat =====
describe("saveChat and loadChat", () => {
  it("restores the chat and the session id after a reload", () => {
    const store = memoryStore();
    const chat = [user(1, "How much?"), bot(2, "From $18,995.")];
    saveChat(SID, chat, store);
    assert.deepEqual(loadChat(store), { sessionId: SID, messages: chat });
  });

  it("returns null when nothing was saved", () => {
    assert.equal(loadChat(memoryStore()), null);
  });

  it("drops a last question that never got an answer (reload while the bot was thinking)", () => {
    const store = memoryStore();
    saveChat(SID, [user(1, "a"), bot(2, "b"), user(3, "c")], store);
    assert.deepEqual(loadChat(store)?.messages.map((m) => m.id), ["m1", "m2"]);
  });

  it("returns null when the only message is an unanswered question", () => {
    const store = memoryStore();
    saveChat(SID, [user(1, "a")], store);
    assert.equal(loadChat(store), null);
  });

  it("never keeps a chat that contains a crisis reply, and erases what was saved before", () => {
    const store = memoryStore();
    saveChat(SID, [user(1, "hi"), bot(2, "hello")], store);
    assert.ok(store.data[STORAGE_KEY]);
    saveChat(SID, [user(1, "hi"), bot(2, "hello"), user(3, "I want to die"), bot(4, "Please reach out.", "crisis")], store);
    assert.equal(store.data[STORAGE_KEY], undefined);
  });

  it("refuses to restore a stored crisis chat even if one got in", () => {
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify({ v: 1, sessionId: SID, messages: [user(1, "x"), bot(2, "y", "crisis")] }) });
    assert.equal(loadChat(store), null);
    assert.equal(store.data[STORAGE_KEY], undefined, "and the entry is removed");
  });

  it("erases the entry for an empty chat and on clearChat (New chat)", () => {
    const store = memoryStore();
    saveChat(SID, [user(1, "a"), bot(2, "b")], store);
    saveChat(SID, [], store);
    assert.equal(store.data[STORAGE_KEY], undefined);
    saveChat(SID, [user(1, "a"), bot(2, "b")], store);
    clearChat(store);
    assert.equal(store.data[STORAGE_KEY], undefined);
  });

  it("throws away damaged, old-format or foreign entries", () => {
    const good = [user(1, "a"), bot(2, "b")];
    const cases: Array<[string, string]> = [
      ["not JSON", "{oops"],
      ["wrong version", JSON.stringify({ v: 2, sessionId: SID, messages: good })],
      ["session id is not a UUID", JSON.stringify({ v: 1, sessionId: "<script>", messages: good })],
      ["messages not a list", JSON.stringify({ v: 1, sessionId: SID, messages: "x" })],
      ["a message with a wrong shape", JSON.stringify({ v: 1, sessionId: SID, messages: [{ id: 1, role: "user", text: "a" }] })],
      ["an assistant response that breaks the contract", JSON.stringify({ v: 1, sessionId: SID, messages: [user(1, "a"), { id: "m2", role: "assistant", text: "b", response: { answer: 5 } }] })],
      ["a user message that carries a response", JSON.stringify({ v: 1, sessionId: SID, messages: [{ ...user(1, "a"), response: response("answer", "x") }, bot(2, "b")] })],
      ["too many messages", JSON.stringify({ v: 1, sessionId: SID, messages: Array.from({ length: MAX_STORED_MESSAGES + 2 }, (_, i) => (i % 2 === 0 ? user(i, "a") : bot(i, "b"))) })],
    ];
    for (const [name, raw] of cases) {
      const store = memoryStore({ [STORAGE_KEY]: raw });
      assert.equal(loadChat(store), null, name);
      assert.equal(store.data[STORAGE_KEY], undefined, `${name}: removed`);
    }
  });

  it("keeps only the newest messages when the chat is long, and stays under the size limit", () => {
    const store = memoryStore();
    const long: ChatMessage[] = [];
    for (let i = 0; i < 60; i += 2) long.push(user(i + 1, "q"), bot(i + 2, "a".repeat(4000)));
    saveChat(SID, long, store);
    const raw = store.data[STORAGE_KEY]!;
    assert.ok(raw.length <= MAX_STORED_BYTES);
    const back = loadChat(store)!;
    assert.ok(back.messages.length <= MAX_STORED_MESSAGES);
    assert.equal(back.messages[back.messages.length - 1]!.id, "m60", "the newest message is kept");
    assert.equal(back.messages[0]!.role, "user", "the kept part starts with a question");
  });

  it("works without storage, or with storage that throws (private window, full, blocked)", () => {
    assert.doesNotThrow(() => saveChat(SID, [user(1, "a"), bot(2, "b")], null));
    assert.equal(loadChat(null), null);
    assert.doesNotThrow(() => saveChat(SID, [user(1, "a"), bot(2, "b")], brokenStore));
    assert.equal(loadChat(brokenStore), null);
    assert.doesNotThrow(() => clearChat(brokenStore));
  });
});

// ===== BAGIAN 2: buildHistory =====
describe("buildHistory", () => {
  it("returns complete question + answer pairs, oldest first", () => {
    assert.deepEqual(buildHistory([user(1, "q1"), bot(2, "a1"), user(3, "q2"), bot(4, "a2")]), [
      { role: "visitor", text: "q1" }, { role: "assistant", text: "a1" },
      { role: "visitor", text: "q2" }, { role: "assistant", text: "a2" },
    ]);
  });

  it("is empty for a new chat", () => {
    assert.deepEqual(buildHistory([]), []);
  });

  it("leaves out a pair whose answer failed or was refused, and the question that has no answer yet", () => {
    const chat = [user(1, "q1"), bot(2, "a1"), user(3, "q2"), bot(4, "oops", "error"), user(5, "q3"), bot(6, "slow down", "rate_limited"), user(7, "q4")];
    assert.deepEqual(buildHistory(chat).map((e) => e.text), ["q1", "a1"]);
  });

  it("leaves out a crisis pair and the local greeting without a response", () => {
    const greeting: ChatMessage = { id: "g", role: "assistant", text: "Hello" };
    assert.deepEqual(buildHistory([greeting, user(1, "q"), bot(2, "help", "crisis")]), []);
  });

  it("keeps the last 6 pairs (12 entries) and cuts a long answer to 2000 characters", () => {
    const chat: ChatMessage[] = [];
    for (let i = 1; i <= 8; i++) chat.push(user(i * 2 - 1, `q${i}`), bot(i * 2, i === 8 ? "x".repeat(5000) : `a${i}`));
    const h = buildHistory(chat);
    assert.equal(h.length, 12);
    assert.equal(h[0]!.text, "q3");
    assert.equal(h[11]!.text.length, 2000);
  });

  it("is what the server accepts: alternating, visitor first, even length", () => {
    const h = buildHistory([user(1, "q1"), bot(2, "a1"), user(3, "q2"), bot(4, "a2")]);
    assert.equal(h.length % 2, 0);
    assert.ok(h.every((e, i) => e.role === (i % 2 === 0 ? "visitor" : "assistant")));
  });
});

// ===== BAGIAN 3: the contact card outcome =====
describe("the contact card outcome", () => {
  it("keeps 'sent' and 'declined' across a reload, and nothing else about the card", () => {
    const store = memoryStore();
    const offered: ChatMessage = { ...bot(2, "Please use the link."), lead: "done" };
    saveChat(SID, [user(1, "contact me"), offered], store);
    assert.equal(loadChat(store)!.messages[1]!.lead, "done");
    assert.ok(!store.data[STORAGE_KEY]!.includes("@"), "no email address is ever stored");
  });

  it("throws away an entry with an unknown outcome, or an outcome on a visitor message", () => {
    for (const messages of [
      [user(1, "q"), { ...bot(2, "a"), lead: "pending" }],
      [{ ...user(1, "q"), lead: "done" }, bot(2, "a")],
    ]) {
      const store = memoryStore({ [STORAGE_KEY]: JSON.stringify({ v: 1, sessionId: SID, messages }) });
      assert.equal(loadChat(store), null);
      assert.equal(store.data[STORAGE_KEY], undefined);
    }
  });
});
