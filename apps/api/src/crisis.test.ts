/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/crisis.test.ts
 * TUJUAN  : Uji jaring kata kunci krisis (src/crisis.ts): kalimat krisis
 *           harus tertangkap dalam beberapa bahasa, kalimat biasa tidak
 *           boleh.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. crisis keyword net
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeCrisis, normalizeForMatch } from "./crisis";

const YES: Record<string, string[]> = {
  en: ["I want to kill myself", "i dont want to live anymore", "I can't do this anymore. I don't want to be here.", "thinking about suicide", "I want to die", "I might hurt myself"],
  id: ["Ingin bunuh diri", "aku pengen mati", "gak mau hidup lagi", "saya ingin mengakhiri hidup"],
  tr: ["Ölmek istiyorum", "intihar etmeyi düşünüyorum", "Yaşamak istemiyorum", "kendimi öldüreceğim"],
  es: ["quiero morir", "no quiero vivir", "Pienso en suicidarme", "quiero quitarme la vida"],
  ar: ["أريد أن أموت", "أفكر في الانتحار", "لا أريد أن أعيش", "سأقتل نفسي"],
};

const NO = [
  "How much does the treatment cost?",
  "I'm scared of dying from this cancer",
  "Is it safe for my diabetes?",
  "Berapa biaya paket?",
  "Tedavi ne kadar tutuyor?",
  "¿Cuánto cuesta?",
  "كم تبلغ تكلفة العلاج؟",
  "What is the weather in Cancun?",
  "The treatment has a life-saving goal",
  "I want to know the price",
  "Can I die during the treatment?",
];

// ===== BAGIAN 1: crisis keyword net =====
describe("crisis keyword net", () => {
  for (const [lang, phrases] of Object.entries(YES)) {
    it(`catches self-harm and not-wanting-to-live phrases in ${lang}`, () => {
      for (const p of phrases) assert.ok(looksLikeCrisis(p), `missed: ${p}`);
    });
  }

  it("does not fire on cost questions, illness fear or ordinary words", () => {
    for (const p of NO) assert.ok(!looksLikeCrisis(p), `false positive: ${p}`);
  });

  it("sees through case, accents, dotless i, Arabic marks and extra spaces", () => {
    assert.ok(looksLikeCrisis("ÖLMEK   İSTİYORUM"));
    assert.ok(looksLikeCrisis("أُرِيدُ أَنْ أَمُوتَ"));
    assert.equal(normalizeForMatch("  ÇOK   İyi ").trim(), "cok iyi");
  });
});
