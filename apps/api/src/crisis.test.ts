/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/crisis.test.ts
 * PURPOSE : Test of the crisis keyword net (src/crisis.ts): crisis sentences
 *           must be caught in several languages, ordinary sentences must not.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. crisis keyword net
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
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

// ===== PART 1: crisis keyword net =====
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
