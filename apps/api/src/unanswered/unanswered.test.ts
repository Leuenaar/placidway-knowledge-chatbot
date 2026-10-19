/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/unanswered/unanswered.test.ts
 * TUJUAN  : Uji log pertanyaan tak terjawab: penyamaran data pribadi,
 *           penulisan log, penghapusan 30 hari, dan daftar terbaru.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. masking personal data
 *    2. unanswered log
 *    3. 30 day cleanup
 *    4. listing
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_QUESTION_LENGTH, createUnansweredLog, listRecent, maskPersonalData, purgeOld, questionForLog, startPurgeSchedule } from ".";

const db = { url: "https://db.example", key: "sb_secret_TESTKEY" };
const SESSION = "11111111-1111-4111-8111-111111111111";

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response> | Error) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const out = await handler(url, init);
    if (out instanceof Error) throw out;
    return out;
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

// ===== BAGIAN 1: masking personal data =====
describe("masking personal data", () => {
  it("masks e-mail addresses, phone numbers and long digit runs", () => {
    assert.equal(maskPersonalData("write me at john.doe@mail.com please"), "write me at [email] please");
    assert.equal(maskPersonalData("call +62 812-3456-7890 now"), "call [number] now");
    assert.equal(maskPersonalData("my number is (555) 123 4567"), "my number is [number]");
    assert.equal(maskPersonalData("passport 123456789"), "passport [number]");
    assert.equal(maskPersonalData("nomor 081234567890"), "nomor [number]");
  });

  it("keeps dollar amounts, years, durations and short numbers", () => {
    for (const t of ["I heard it costs $50. Confirm that.", "Is $18,995 right?", "treatment in 2026 for 3 weeks", "costs $1,000,000?", "price 30000 usd", "$1000 only?"]) {
      assert.equal(maskPersonalData(t), t, t);
    }
  });

  it("does not remove names or health words (documented limit), and caps the length", () => {
    assert.equal(maskPersonalData("I am Maria and I have diabetes"), "I am Maria and I have diabetes");
    assert.equal(questionForLog("x".repeat(900)).length, MAX_QUESTION_LENGTH);
    assert.equal(questionForLog("   "), "");
  });
});

// ===== BAGIAN 2: unanswered log =====
describe("unanswered log", () => {
  it("writes one row with the masked question, the reason and the session id, and no IP", async () => {
    const f = fakeFetch(() => new Response(null, { status: 201 }));
    await createUnansweredLog({ db, fetchFn: f.fetchFn, log: () => {} }).record({ question: "Can you book me? mail a@b.co", reason: "out_of_scope", sessionId: SESSION });
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0]!.url, "https://db.example/rest/v1/unanswered_questions");
    assert.equal(f.calls[0]!.init.method, "POST");
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers.apikey, db.key);
    assert.equal(headers.Prefer, "return=minimal");
    assert.deepEqual(JSON.parse(String(f.calls[0]!.init.body)), { question: "Can you book me? mail [email]", reason: "out_of_scope", session_id: SESSION });
  });

  it("never throws or rejects: a failing database is only noted, without the question or the key", async () => {
    for (const handler of [() => new Response("boom", { status: 500 }), () => new Error("socket hang up secret-question")]) {
      const logs: string[] = [];
      const f = fakeFetch(handler);
      await createUnansweredLog({ db, fetchFn: f.fetchFn, log: (m) => logs.push(m) }).record({ question: "my secret question", reason: "not_in_content", sessionId: SESSION });
      assert.equal(logs.length, 1);
      assert.ok(!logs[0]!.includes("secret question") && !logs[0]!.includes("TESTKEY"));
    }
  });

  it("writes nothing when only personal data was typed", async () => {
    const f = fakeFetch(() => new Response(null, { status: 201 }));
    await createUnansweredLog({ db, fetchFn: f.fetchFn, log: () => {} }).record({ question: "   ", reason: "not_in_content", sessionId: SESSION });
    assert.equal(f.calls.length, 0);
  });
});

// ===== BAGIAN 3: 30 day cleanup =====
describe("30 day cleanup", () => {
  it("calls the database function and returns how many rows it deleted", async () => {
    const f = fakeFetch(() => new Response("7", { status: 200 }));
    assert.equal(await purgeOld({ db, fetchFn: f.fetchFn, log: () => {} }), 7);
    assert.equal(f.calls[0]!.url, "https://db.example/rest/v1/rpc/purge_old_unanswered_questions");
  });

  it("returns undefined and logs when it fails", async () => {
    const logs: string[] = [];
    const f = fakeFetch(() => new Response("no", { status: 401 }));
    assert.equal(await purgeOld({ db, fetchFn: f.fetchFn, log: (m) => logs.push(m) }), undefined);
    assert.equal(logs.length, 1);
  });

  it("runs at start and then on the interval, and can be stopped", async () => {
    const f = fakeFetch(() => new Response("0", { status: 200 }));
    const stop = startPurgeSchedule({ db, fetchFn: f.fetchFn, log: () => {} }, 20);
    await new Promise((r) => setTimeout(r, 75));
    stop();
    const n = f.calls.length;
    assert.ok(n >= 3, `ran ${n} times`);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(f.calls.length, n, "stopped");
  });
});

// ===== BAGIAN 4: listing =====
describe("listing", () => {
  it("asks for the newest rows, capped at 500", async () => {
    const f = fakeFetch(() => new Response(JSON.stringify([{ id: 1, question: "q", reason: "not_in_content", session_id: SESSION, created_at: "2026-10-19T00:00:00Z" }]), { status: 200 }));
    const rows = await listRecent({ db, fetchFn: f.fetchFn }, 9999);
    assert.equal(rows.length, 1);
    assert.match(f.calls[0]!.url, /order=created_at\.desc&limit=500$/);
  });
});
