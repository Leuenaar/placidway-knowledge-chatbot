/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/mock/bot.test.ts
 * TUJUAN  : Uji bot contoh (mock) untuk kartu kontak N4: kartu muncul sekali
 *           per sesi dan bentuk balasan sesuai kontrak.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. mock bot: lead card (N4)
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isChatResponse } from "@pwbot/shared";
import { createMockBot } from "./bot";

const A = "11111111-1111-4111-8111-111111111111";

// ===== BAGIAN 1: mock bot: lead card (N4) =====
describe("mock bot: lead card (N4)", () => {
  it("offers the card when asked to be contacted or for a quote, once per session", async () => {
    const bot = createMockBot();
    const first = await bot.reply(A, "Please contact me with a personal quote");
    assert.equal(first.body.offer_lead, true);
    assert.ok(first.body.lead_texts && first.body.lead_texts.submit.length > 0);
    assert.ok(isChatResponse(first.body));
    const again = await bot.reply(A, "email me the quote");
    assert.equal(again.body.offer_lead, false);
  });

  it("does not offer it for an ordinary question", async () => {
    const r = await createMockBot().reply(A, "How much does it cost?");
    assert.equal(r.body.offer_lead, false);
  });

  it("the shared check rejects a card with missing or non-text fields", async () => {
    const body = (await createMockBot().reply(A, "contact me")).body;
    assert.ok(isChatResponse(body));
    assert.equal(isChatResponse({ ...body, lead_texts: { ...body.lead_texts, submit: 5 } }), false);
    assert.equal(isChatResponse({ ...body, lead_texts: { title: "x" } }), false);
  });
});
