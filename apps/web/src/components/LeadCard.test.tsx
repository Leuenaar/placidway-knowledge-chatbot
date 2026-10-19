/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/components/LeadCard.test.tsx
 * TUJUAN  : Uji kartu kontak di browser: tampilan awal, pemeriksaan dasar
 *           sebelum kirim, dan permintaan ke server hanya membawa tanda
 *           persetujuan serta apa yang diketik pengunjung.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. LeadCard
 *    2. checks before sending
 *    3. submitLead
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

/**
 * Tests for the contact card: what it shows before anything is typed, the basic checks before sending, and that the
 * request to the server carries the consent flag and nothing the visitor did not type.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LeadTexts } from "@pwbot/shared";
import { submitLead } from "../api";
import { LeadCard, canSubmit, looksLikeEmail } from "./LeadCard";

const SID = "11111111-1111-4111-8111-111111111111";
const texts: LeadTexts = { title: "Leave your details", name: "Your name", email: "Your email", consent: "I agree to be contacted. Deleted after 90 days.", submit: "Send", decline: "No, thanks", thanks: "Thank you!", failed: "Could not send." };

const render = (outcome?: "done" | "declined") =>
  renderToStaticMarkup(createElement(LeadCard, { texts, sessionId: SID, outcome, onOutcome: () => {} }));

// ===== BAGIAN 1: LeadCard =====
describe("LeadCard", () => {
  it("shows the server's texts, an untouched consent box and a disabled send button", () => {
    const html = render();
    for (const t of [texts.title, texts.name, texts.email, texts.consent, texts.submit, texts.decline]) assert.ok(html.includes(t), t);
    assert.ok(!/<input[^>]*type="checkbox"[^>]*checked/.test(html), "the box starts unticked");
    assert.match(html, /<button[^>]*type="submit"[^>]*disabled/);
    assert.ok(!html.includes(texts.failed) && !html.includes(texts.thanks));
  });

  it("has a hidden field for bots that keyboard and screen readers skip", () => {
    const html = render();
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /name="website"[^>]*tabindex="-1"|tabindex="-1"[^>]*name="website"/);
  });

  it("asks the browser to fill name and email", () => {
    const html = render();
    assert.match(html, /autoComplete="name"|autocomplete="name"/i);
    assert.match(html, /type="email"/);
  });

  it("shows only the thank-you line once sent, and nothing once declined", () => {
    const done = render("done");
    assert.ok(done.includes(texts.thanks));
    assert.ok(!done.includes("<form") && !done.includes("<input"));
    assert.equal(render("declined"), "");
  });
});

// ===== BAGIAN 2: checks before sending =====
describe("checks before sending", () => {
  it("accepts ordinary emails and refuses malformed ones", () => {
    for (const e of ["ana@example.com", " ana@example.com ", "a.b+c@mail.co.id"]) assert.ok(looksLikeEmail(e), e);
    for (const e of ["", "ana", "ana@", "@example.com", "ana@example", "a na@example.com", `${"a".repeat(250)}@b.co`]) assert.ok(!looksLikeEmail(e), e);
  });

  it("needs a name, a valid email and the ticked box", () => {
    assert.ok(canSubmit("Ana", "ana@example.com", true));
    assert.ok(!canSubmit("Ana", "ana@example.com", false));
    assert.ok(!canSubmit("  ", "ana@example.com", true));
    assert.ok(!canSubmit("Ana", "nope", true));
    assert.ok(!canSubmit("a".repeat(101), "ana@example.com", true));
  });
});

// ===== BAGIAN 3: submitLead =====
describe("submitLead", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  function stub(status: number, body: unknown) {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return calls;
  }

  it("posts the details with consent: true and reports success", async () => {
    const calls = stub(200, { ok: true });
    assert.equal(await submitLead({ session_id: SID, name: "Ana", email: "ana@example.com" }), true);
    assert.equal(calls[0]!.url, "/api/lead");
    assert.deepEqual(calls[0]!.body, { session_id: SID, name: "Ana", email: "ana@example.com", consent: true });
  });

  it("reports failure for a server error, a limit, an odd reply and a network failure (never throws)", async () => {
    for (const [status, body] of [[502, { ok: false }], [429, { ok: false }], [200, { ok: false }], [200, "text"]] as const) {
      stub(status, body);
      assert.equal(await submitLead({ session_id: SID, name: "Ana", email: "ana@example.com" }), false, String(status));
    }
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    assert.equal(await submitLead({ session_id: SID, name: "Ana", email: "ana@example.com" }), false);
  });
});
