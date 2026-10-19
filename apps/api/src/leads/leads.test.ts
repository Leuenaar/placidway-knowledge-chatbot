/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/leads/leads.test.ts
 * PURPOSE : Test of the contact capture (N4): storage (never logs the name or
 *           email), the service rules, and POST /api/lead over real HTTP
 *           (strict validation, its own limit, the trap field, care mode).
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. lead store
 *    2. lead service
 *    3. POST /api/lead (real HTTP)
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

/**
 * Tests for lead capture (nice-to-have N4): the store (what it writes, that it never logs a name or an email), the rules of the
 * service, and POST /api/lead over real HTTP (strict validation, its own limit, the hidden field, care mode).
 */
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { LEAD_CONSENT_VERSION } from "@pwbot/shared";
import { createApp } from "../app";
import { createLimiter } from "../limits";
import { createLeadService, createLeadStore, createMemoryLeadStore, listLeads, purgeOldLeads, startLeadPurgeSchedule } from ".";

const SESSION = "11111111-1111-4111-8111-111111111111";
const DB = { url: "https://db.example.test", key: "secret-key" };

function fetchStub(status: number, body: unknown = null) {
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetchFn, calls };
}

// ===== PART 1: lead store =====
describe("lead store", () => {
  it("writes name, email, language and the consent version, and nothing else", async () => {
    const f = fetchStub(201);
    const ok = await createLeadStore({ db: DB, fetchFn: f.fetchFn }).add({ name: "Ana Maria", email: "ana@example.com", language: "es", consentVersion: "v1" });
    assert.equal(ok, true);
    assert.equal(f.calls[0]!.url, "https://db.example.test/rest/v1/leads");
    assert.deepEqual(JSON.parse(String(f.calls[0]!.init!.body)), { name: "Ana Maria", email: "ana@example.com", language: "es", consent_version: "v1" });
    assert.equal((f.calls[0]!.init!.headers as Record<string, string>).apikey, "secret-key");
  });

  it("stores a missing language as null", async () => {
    const f = fetchStub(201);
    await createLeadStore({ db: DB, fetchFn: f.fetchFn }).add({ name: "A", email: "a@b.co", consentVersion: "v1" });
    assert.equal(JSON.parse(String(f.calls[0]!.init!.body)).language, null);
  });

  it("returns false and never logs the name or the email when the database refuses or is unreachable", async () => {
    const logs: string[] = [];
    const refused = await createLeadStore({ db: DB, fetchFn: fetchStub(500).fetchFn, log: (m) => logs.push(m) }).add({ name: "Secret Name", email: "secret@example.com", consentVersion: "v1" });
    assert.equal(refused, false);
    const broken = (async () => { throw new Error("connect failed for secret@example.com"); }) as typeof fetch;
    const down = await createLeadStore({ db: DB, fetchFn: broken, log: (m) => logs.push(m) }).add({ name: "Secret Name", email: "secret@example.com", consentVersion: "v1" });
    assert.equal(down, false);
    assert.equal(logs.length, 2);
    for (const l of logs) assert.ok(!/secret/i.test(l), `log line leaks personal data: ${l}`);
  });

  it("keeps leads in memory for the mock mode", async () => {
    const store = createMemoryLeadStore();
    assert.equal(await store.add({ name: "A", email: "a@b.co", consentVersion: "v1" }), true);
    assert.equal(store.rows.length, 1);
  });

  it("purges through the database function and reports the number, or undefined on failure", async () => {
    const f = fetchStub(200, 3);
    assert.equal(await purgeOldLeads({ db: DB, fetchFn: f.fetchFn }), 3);
    assert.equal(f.calls[0]!.url, "https://db.example.test/rest/v1/rpc/purge_old_leads");
    const logs: string[] = [];
    assert.equal(await purgeOldLeads({ db: DB, fetchFn: fetchStub(404).fetchFn, log: (m) => logs.push(m) }), undefined);
    assert.equal(logs.length, 1);
  });

  it("runs the purge at start and then on a timer that can be stopped", async () => {
    const f = fetchStub(200, 0);
    const stop = startLeadPurgeSchedule({ db: DB, fetchFn: f.fetchFn }, 20);
    await new Promise((r) => setTimeout(r, 70));
    stop();
    const n = f.calls.length;
    assert.ok(n >= 2, `ran ${n} times`);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(f.calls.length, n, "stopped");
  });

  it("lists the newest leads, with a limit between 1 and 500", async () => {
    const f = fetchStub(200, [{ id: 1, name: "A", email: "a@b.co", language: "en", consent_version: "v1", created_at: "2026-10-19T00:00:00Z" }]);
    const rows = await listLeads({ db: DB, fetchFn: f.fetchFn }, 9999);
    assert.equal(rows.length, 1);
    assert.match(f.calls[0]!.url, /order=created_at\.desc&limit=500$/);
    await assert.rejects(listLeads({ db: DB, fetchFn: fetchStub(401).fetchFn }), /HTTP 401/);
  });
});

// ===== PART 2: lead service =====
describe("lead service", () => {
  const input = { sessionId: SESSION, name: "Ana", email: "ana@example.com", language: "pt-BR" };

  it("stores a lead with the consent version and the primary language code", async () => {
    const store = createMemoryLeadStore();
    const r = await createLeadService({ store }).submit(input);
    assert.deepEqual(r, { status: 200, body: { ok: true } });
    assert.deepEqual(store.rows, [{ name: "Ana", email: "ana@example.com", language: "pt", consentVersion: LEAD_CONSENT_VERSION }]);
  });

  it("uses the language the server found for the chat when the browser sent none", async () => {
    const store = createMemoryLeadStore();
    await createLeadService({ store, languageOf: () => "tr" }).submit({ sessionId: SESSION, name: "Ali", email: "ali@example.com" });
    assert.equal(store.rows[0]!.language, "tr");
  });

  it("answers 'ok' to a filled hidden field and stores nothing (a bot learns nothing from a refusal)", async () => {
    const store = createMemoryLeadStore();
    const r = await createLeadService({ store }).submit({ ...input, website: "http://spam.example" });
    assert.deepEqual(r, { status: 200, body: { ok: true } });
    assert.equal(store.rows.length, 0);
  });

  it("stores nothing for a session in care mode", async () => {
    const store = createMemoryLeadStore();
    const r = await createLeadService({ store, isCare: (id) => id === SESSION }).submit(input);
    assert.deepEqual(r, { status: 403, body: { ok: false } });
    assert.equal(store.rows.length, 0);
  });

  it("reports a failed save", async () => {
    const r = await createLeadService({ store: { add: async () => false } }).submit(input);
    assert.deepEqual(r, { status: 502, body: { ok: false } });
  });
});

// ===== PART 3: POST /api/lead (real HTTP) =====
describe("POST /api/lead (real HTTP)", () => {
  let server: Server;
  let baseUrl: string;
  const store = createMemoryLeadStore();
  let care = false;
  const leadLimiter = createLimiter({ perWindow: 6, windowMs: 3_600_000, perDay: 100, dailyTokens: Number.MAX_SAFE_INTEGER, maxConcurrent: 4 });

  before(async () => {
    server = createApp({ leads: createLeadService({ store, isCare: () => care }), leadLimiter }).listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const good = { session_id: SESSION, name: "Ana Maria", email: "ana@example.com", consent: true, language: "es" };
  const post = (body: unknown) => fetch(`${baseUrl}/api/lead`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("saves a valid lead", async () => {
    const res = await post(good);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(store.rows.at(-1), { name: "Ana Maria", email: "ana@example.com", language: "es", consentVersion: LEAD_CONSENT_VERSION });
  });

  it("refuses anything that is not a ticked box, a plain name and a real-looking email, with 400 and nothing stored", async () => {
    const before = store.rows.length;
    const bad: Array<[string, unknown]> = [
      ["no consent", { ...good, consent: undefined }],
      ["consent false", { ...good, consent: false }],
      ["consent as text", { ...good, consent: "true" }],
      ["empty name", { ...good, name: "   " }],
      ["name too long", { ...good, name: "a".repeat(101) }],
      ["name with a line break", { ...good, name: "Ana\nBcc: x@y.z" }],
      ["name with a tag", { ...good, name: "<script>alert(1)</script>" }],
      ["email without @", { ...good, email: "ana.example.com" }],
      ["email too long", { ...good, email: `${"a".repeat(250)}@b.co` }],
      ["bad session id", { ...good, session_id: "nope" }],
      ["bad language", { ...good, language: "english please" }],
      ["not an object", "hello"],
      ["unknown field", { ...good, role: "admin" }],
    ];
    for (const [name, body] of bad) {
      const res = await post(body);
      assert.equal(res.status, 400, name);
      assert.deepEqual(await res.json(), { ok: false }, name);
    }
    assert.equal(store.rows.length, before);
  });

  it("answers ok but stores nothing when the hidden field is filled", async () => {
    const before = store.rows.length;
    const res = await post({ ...good, website: "x" });
    assert.equal(res.status, 200);
    assert.equal(store.rows.length, before);
  });

  it("refuses a session in care mode with 403", async () => {
    care = true;
    const before = store.rows.length;
    const res = await post(good);
    care = false;
    assert.equal(res.status, 403);
    assert.equal(store.rows.length, before);
  });

  it("has its own limit: after 6 tries from one address the next is 429 with Retry-After", async () => {
    // 3 valid or hidden-field requests were counted above; the 400s do not reach the limiter. Fill what is left, then expect 429.
    let last: Response | undefined;
    for (let i = 0; i < 10; i++) {
      last = await post(good);
      if (last.status === 429) break;
    }
    assert.equal(last!.status, 429);
    assert.ok(Number(last!.headers.get("retry-after")) > 0);
    assert.deepEqual(await last!.json(), { ok: false });
  });
});
