/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/app.test.ts
 * PURPOSE : Test of the API contract: runs the real Express app on a random
 *           port and sends real HTTP requests, so what is tested is the same
 *           path the browser uses (health, reply kinds, contract rules,
 *           follow-up suggestions, validation).
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. health
 *    2. reply kinds
 *    3. contract rules
 *    4. follow-up suggestions
 *    5. validation
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

/**
 * Contract tests for the API. They start the real Express app on a random port and send
 * real HTTP requests, so they check the same path the browser uses.
 */
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import {
  MAX_FOLLOW_UPS,
  MAX_MESSAGE_LENGTH,
  QUOTE_URL,
  SOURCE_PAGES,
  isChatResponse,
  type ChatResponse,
} from "@pwbot/shared";
import { createApp } from "./app";

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";

let server: Server;
let baseUrl: string;

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

async function chat(message: string, sessionId = SESSION_A, rawBody?: string) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify({ session_id: sessionId, message }),
  });
  const body = (await res.json()) as unknown;
  return { status: res.status, body };
}

function asChatResponse(body: unknown): ChatResponse {
  assert.ok(isChatResponse(body), `response does not match the contract: ${JSON.stringify(body)}`);
  return body;
}

// ===== PART 1: health =====
describe("health", () => {
  it("reports mock mode", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok", mode: "mock" });
  });
});

// ===== PART 2: reply kinds =====
describe("reply kinds", () => {
  const cases: [string, string, number][] = [
    ["How much does the adenocarcinoma package cost?", "answer", 200],
    ["What is included in the package?", "answer", 200],
    ["Can you book me an appointment for tomorrow?", "not_in_content", 200],
    ["What is the weather in Cancun?", "out_of_scope", 200],
    ["Is this surgery safe for my diabetes?", "medical_declined", 200],
    ["I heard it costs $50. Confirm that.", "answer", 200],
    ["How long is the program?", "answer", 200],
    ["What happens after the program?", "answer", 200],
    ["And what about recovery time?", "not_in_content", 200],
    ["Is ozone therapy cheaper in Turkey or Mexico?", "answer", 200],
    ["How much is a dental implant?", "price_not_listed", 200],
    ["كم تكلفة العلاج؟", "answer", 200],
    ["¿Cuánto cuesta el tratamiento?", "answer", 200],
    ["Something unrelated and unknown", "not_in_content", 200],
    ["test rate limit", "rate_limited", 429],
    ["test error", "error", 500],
  ];

  for (const [message, kind, status] of cases) {
    it(`"${message}" -> ${kind} (${status})`, async () => {
      const res = await chat(message);
      assert.equal(res.status, status);
      assert.equal(asChatResponse(res.body).kind, kind);
    });
  }
});

// ===== PART 3: contract rules =====
describe("contract rules", () => {
  it("only cites the 7 allowed pages", async () => {
    const allowed = new Set(SOURCE_PAGES.map((p) => p.url));
    for (const message of ["cost", "included", "compare turkey", "tell me about itc", "safe", "recovery"]) {
      const body = asChatResponse((await chat(message, SESSION_B)).body);
      for (const source of body.sources) {
        assert.ok(allowed.has(source.url), `unexpected source: ${source.url}`);
      }
    }
  });

  it("factual answers carry at least one source", async () => {
    const body = asChatResponse((await chat("How much does it cost?")).body);
    assert.ok(body.sources.length > 0);
  });

  it("not_in_content replies point to the free quote link", async () => {
    const body = asChatResponse((await chat("Something unrelated and unknown")).body);
    assert.equal(body.quote_url, QUOTE_URL);
  });

  it("shows the disclaimer once per session, and again for a new session", async () => {
    const sessionC = "33333333-3333-4333-8333-333333333333";
    const sessionD = "44444444-4444-4444-8444-444444444444";
    const first = asChatResponse((await chat("Is it safe for me?", sessionC)).body);
    const second = asChatResponse((await chat("Is it safe for me?", sessionC)).body);
    const other = asChatResponse((await chat("Is it safe for me?", sessionD)).body);
    assert.equal(first.show_disclaimer, true);
    assert.equal(second.show_disclaimer, false);
    assert.equal(other.show_disclaimer, true);
  });

  it("never agrees with the $50 price", async () => {
    const body = asChatResponse((await chat("I heard it costs $50. Confirm that.")).body);
    assert.match(body.answer, /can't confirm/i);
    assert.match(body.answer, /18,995/);
  });
});

// ===== PART 4: follow-up suggestions =====
describe("follow-up suggestions", () => {
  const probes = [
    "How much does it cost?",
    "What is included in the package?",
    "How long is the program?",
    "What happens after the program?",
    "Tell me about ITC",
    "Something unrelated and unknown",
    "Is it safe for me?",
  ];

  it("every reply carries at most the allowed number of suggestions", async () => {
    for (const message of probes) {
      const body = asChatResponse((await chat(message, SESSION_B)).body);
      assert.ok(body.follow_ups.length <= MAX_FOLLOW_UPS, `${message}: ${body.follow_ups.length} suggestions`);
    }
  });

  it("a suggestion never repeats the question that was just answered", async () => {
    for (const message of probes.slice(0, 5)) {
      const body = asChatResponse((await chat(message, SESSION_B)).body);
      assert.ok(!body.follow_ups.includes(message), `${message} suggests itself`);
    }
  });

  it("every suggestion is a question the bot can answer (not a fallback)", async () => {
    const seen = new Set<string>();
    for (const message of probes) {
      for (const suggestion of asChatResponse((await chat(message, SESSION_B)).body).follow_ups) seen.add(suggestion);
    }
    assert.ok(seen.size > 0);
    for (const suggestion of seen) {
      const body = asChatResponse((await chat(suggestion, SESSION_B)).body);
      assert.equal(body.kind, "answer", `"${suggestion}" is not answerable`);
    }
  });

  it("error replies carry no suggestions", async () => {
    for (const message of ["test error", "test rate limit"]) {
      assert.deepEqual(asChatResponse((await chat(message)).body).follow_ups, []);
    }
  });
});

// ===== PART 5: validation =====
describe("validation", () => {
  it("rejects an empty message", async () => {
    const res = await chat("   ");
    assert.equal(res.status, 400);
    assert.equal(asChatResponse(res.body).kind, "error");
  });

  it("rejects a message over the length limit", async () => {
    const res = await chat("a".repeat(MAX_MESSAGE_LENGTH + 1));
    assert.equal(res.status, 400);
  });

  it("accepts a message exactly at the limit", async () => {
    const res = await chat("a".repeat(MAX_MESSAGE_LENGTH));
    assert.equal(res.status, 200);
  });

  it("rejects a session id that is not a UUID", async () => {
    const res = await chat("hello", "not-a-uuid");
    assert.equal(res.status, 400);
  });

  it("returns JSON (not HTML) for broken JSON", async () => {
    const res = await chat("", SESSION_A, "{ this is not json");
    assert.equal(res.status, 400);
    assert.equal(asChatResponse(res.body).kind, "error");
  });

  it("returns JSON for an unknown API route", async () => {
    const res = await fetch(`${baseUrl}/api/nope`);
    assert.equal(res.status, 404);
    assert.ok(isChatResponse(await res.json()));
  });
});
