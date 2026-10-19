/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/suite/checks.ts
 * TUJUAN  : Pemeriksaan otomatis untuk satu jawaban. Sengaja sederhana: FAIL
 *           berarti pasti salah, CHECK berarti petunjuk agar manusia
 *           melihatnya. Tidak menilai nada; laporan selalu menampilkan
 *           jawaban lengkap untuk itu.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: vonis dan hasil pemeriksaan
 *    2. Tipe: semua yang terlihat saat satu kasus berjalan
 *    3. Pembantu: apakah sebuah angka ada di teks
 *    4. Pola kata per bahasa untuk mendeteksi bahasa jawaban
 *    5. Fungsi: apakah teks tampak berbahasa tertentu
 *    6. Pembantu: hitung kalimat dan tentukan vonis terburuk
 *    7. Kata terlarang (cure, proven, ...) dan tanda atribusi
 *    8. Fungsi utama: jalankan semua pemeriksaan pada satu jawaban
 *    9. Pemeriksaan tetap (jenis balasan, kosong, markup bocor, tanda seru)
 *    10. Pemeriksaan grounding (sumber, harga, durasi, kata terlarang, panjang)
 *    11. Pemeriksaan bahasa
 *    12. Pemeriksaan sesuai tuntutan kasus (expect)
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah aturan pemeriksaan baru: tambahkan satu baris add(...) di
 *      runChecks (BAGIAN 8)
 *    - Mengubah daftar kata terlarang (BAGIAN 7)
 *    - Mengubah batas panjang jawaban (BAGIAN 10)
 * ============================================================================ */

/**
 * Automatic checks for one answer. They are deliberately plain: a check is either certain (FAIL) or a hint for a
 * person to look at (CHECK). Nothing here judges tone; the report always shows the full answer for that.
 */
import { SOURCE_PAGES, type AnswerKind, type Source } from "@pwbot/shared";
import type { RetrievedChunk } from "../retrieval";
import type { Case, Lang } from "./cases";
import { LANGUAGE_NAMES } from "./cases";
import { dollarAmounts, normalizeNumbers } from "../retrieval/amounts";

// ===== BAGIAN 1: Tipe: vonis dan hasil pemeriksaan =====
export type Verdict = "PASS" | "CHECK" | "FAIL";

export interface CheckResult {
  name: string;
  verdict: Verdict;
  detail: string;
}

// ===== BAGIAN 2: Tipe: semua yang terlihat saat satu kasus berjalan =====
/** Everything seen while one case ran (the last message of the case). */
export interface Observed {
  answer: string;
  kind: AnswerKind;
  sources: Source[];
  quoteUrl: string | null;
  showDisclaimer: boolean;
  /** Whether the reply offered the lead card. */
  offerLead?: boolean;
  followUps: string[];
  /** Every chunk the model was given for the last message. */
  sentChunks: RetrievedChunk[];
  /** Chunk ids the model said it used. */
  citedIds: string[];
  /** The English name of the language the rewrite step found; undefined if the rewrite step did not run. */
  rewriteLanguage?: string;
  rewriteFallback?: boolean;
  /** The category the rewrite step gave (in_scope, out_of_scope, medical, small_talk, crisis). */
  rewriteCategory?: string;
}

export { dollarAmounts, normalizeNumbers };

// ===== BAGIAN 3: Pembantu: apakah sebuah angka ada di teks =====
function containsNumber(haystack: string, n: string): boolean {
  const esc = n.replace(/\./g, "\\.");
  return new RegExp(`(?<![\\d.])${esc}(?![\\d])`).test(haystack);
}

// ===== BAGIAN 4: Pola kata per bahasa untuk mendeteksi bahasa jawaban =====
const WORDS: Record<Exclude<Lang, "en">, RegExp> = {
  id: /\b(yang|dan|untuk|dengan|adalah|tidak|di|dari|ini|itu|anda|kami)\b/gi,
  tr: /\b(ve|bir|için|ile|bu|olarak|değil|veya|çok|daha)\b|[çğışöü]/gi,
  es: /\b(el|la|los|las|de|que|para|con|es|un|una|por|no)\b|[ñ¿¡]/gi,
  ar: /[؀-ۿ]/g,
};
const EN_WORDS = /\b(the|and|is|are|of|for|with|that|this|you|your|can)\b/gi;

// ===== BAGIAN 5: Fungsi: apakah teks tampak berbahasa tertentu =====
/** True when the text looks like it is written in the language. A rough word count, enough to catch an answer in the wrong language. */
export function looksLike(lang: Lang, text: string): boolean {
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  if (lang === "en") return count(EN_WORDS) >= 2;
  if (lang === "ar") return count(WORDS.ar) >= 10 && count(WORDS.ar) > count(/[A-Za-z]/g);
  return count(WORDS[lang]) >= 3 && count(WORDS[lang]) >= count(EN_WORDS);
}

// ===== BAGIAN 6: Pembantu: hitung kalimat dan tentukan vonis terburuk =====
function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?؟。])\s+/).filter((s) => s.trim().length > 0).length;
}

const worst = (rs: CheckResult[]): Verdict => (rs.some((r) => r.verdict === "FAIL") ? "FAIL" : rs.some((r) => r.verdict === "CHECK") ? "CHECK" : "PASS");
export const caseVerdict = (rs: CheckResult[]): Verdict => worst(rs);

// ===== BAGIAN 7: Kata terlarang (cure, proven, ...) dan tanda atribusi =====
const FORBIDDEN_WORDS = /\b(cure[sd]?|cured|breakthrough|proven|painless|non-?toxic)\b/i;
const ATTRIBUTION = /\b(states?|says?|claims?|according|describes?|calls?)\b|["“”«»']/i;

// ===== BAGIAN 8: Fungsi utama: jalankan semua pemeriksaan pada satu jawaban =====
export function runChecks(c: Case, o: Observed): CheckResult[] {
  const r: CheckResult[] = [];
  const add = (name: string, ok: boolean, detail: string, soft = false) => r.push({ name, verdict: ok ? "PASS" : soft ? "CHECK" : "FAIL", detail });
  const text = o.answer;
  const normalized = normalizeNumbers(text);
  const sentText = normalizeNumbers(o.sentChunks.map((ch) => ch.text).join("\n"));

  // ===== BAGIAN 9: Pemeriksaan tetap (jenis balasan, kosong, markup bocor, tanda seru) =====
  // The fixed, certain checks.
  if (c.expect.kind) {
    const allowed = Array.isArray(c.expect.kind) ? c.expect.kind : [c.expect.kind];
    add("kind", allowed.includes(o.kind), `expected ${allowed.join(" or ")}, got ${o.kind}`);
  }
  add("not empty", text.trim().length > 0, "the answer is empty");
  add("no leaked markup", !/<\/?(excerpt|excerpts|reminder|question|conversation|turn|reply_language)\b|used_chunk_ids/i.test(text), "the answer contains prompt markup or field names");
  add("no exclamation mark", !/[!！]/.test(text), "the answer contains an exclamation mark", true);

  // ===== BAGIAN 10: Pemeriksaan grounding (sumber, harga, durasi, kata terlarang, panjang) =====
  // Grounding.
  if (o.kind === "answer") add("has sources", o.sources.length > 0, "an answer without any source link");
  else if (o.kind !== "medical_declined") add("no source links on a reply that claims nothing", o.sources.length === 0, "sources were attached to a reply that claims nothing", true);
  if (o.kind === "not_in_content" || o.kind === "out_of_scope") add("quote link on not-in-content", o.quoteUrl !== null, "no quote link on a reply that could not answer", c.expect.quote === false);
  // An amount the visitor wrote themselves ("I heard it costs $50") may be repeated back while correcting it; it is not an invented price.
  const visitorAmounts = new Set(dollarAmounts(c.turns.join(" ")));
  const invented = dollarAmounts(text).filter((a) => !containsNumber(sentText, a) && !visitorAmounts.has(a));
  add("every dollar amount is in the sent chunks", invented.length === 0, `amount(s) not found in the chunks the model saw: ${invented.join(", ")}`);
  if (c.lang === "en") {
    const durations = [...normalizeNumbers(text).matchAll(/\b(\d+)[ -]?(days?|weeks?|months?|years?)\b/gi)].map((m) => ({ n: m[1]!, unit: m[2]!.toLowerCase().replace(/s$/, "") }));
    const bad = durations.filter((d) => !new RegExp(`\\b${d.n}[ -]?${d.unit}s?\\b`, "i").test(sentText));
    add("every duration is in the sent chunks", bad.length === 0, `duration(s) not found in the chunks: ${bad.map((d) => `${d.n} ${d.unit}`).join(", ")}`);
    add("no claim about what a page lacks", !/\b(page|pages|price list)\b[^.]{0,60}\b(does not|doesn't|do not|don't|did not|didn't|never)\b[^.]{0,20}\b(mention|list|contain|state|show|include|say|cover)\b/i.test(text), "the answer says a page does not mention or list something");
    const forbidden = FORBIDDEN_WORDS.exec(text);
    if (forbidden) add("claim words only as attributed claims", ATTRIBUTION.test(text), `"${forbidden[0]}" appears without any attribution`, true);
  }
  const repeated = (() => {
    const counts = new Map<string, number>();
    for (const a of dollarAmounts(text)) if (!visitorAmounts.has(a)) counts.set(a, (counts.get(a) ?? 0) + 1);
    return [...counts].filter(([, n]) => n > 1).map(([a]) => a);
  })();
  add("each price said once", repeated.length === 0, `repeated amount(s): ${repeated.join(", ")}`, true);
  add("length", sentenceCount(text) <= 6, `${sentenceCount(text)} sentences (the rule is usually 2 to 4, up to 5)`, true);
  const words = text.trim().split(/\s+/).length;
  add("not a wall of text", words <= 130 || /\n- /.test(text), `${words} words in one block; a long list of inclusions is easier to read as "- " lines`, true);

  // ===== BAGIAN 11: Pemeriksaan bahasa =====
  // Language.
  if (o.rewriteLanguage !== undefined) add("rewrite found the language", o.rewriteLanguage === LANGUAGE_NAMES[c.lang], `expected ${LANGUAGE_NAMES[c.lang]}, rewrite said ${o.rewriteLanguage}${o.rewriteFallback ? " (rewrite fell back)" : ""}`);
  if (o.kind !== "error") add(`answer is in ${LANGUAGE_NAMES[c.lang]}`, looksLike(c.lang, text), "the answer does not look like it is in the visitor's language", c.lang !== "ar");

  // ===== BAGIAN 12: Pemeriksaan sesuai tuntutan kasus (expect) =====
  // What this case demands.
  const e = c.expect;
  if (e.quote !== undefined) add(e.quote ? "has quote link" : "no quote link", (o.quoteUrl !== null) === e.quote, e.quote ? "the reply has no quote link" : "the reply carries a quote link");
  if (e.noSources) add("no source links", o.sources.length === 0, `${o.sources.length} source link(s) on a reply that must have none`);
  if (e.noFollowUps) add("no follow-up suggestions", o.followUps.length === 0, `${o.followUps.length} suggestion(s) on a reply that must have none`);
  if (e.offerLead !== undefined) add(e.offerLead ? "lead card offered" : "no lead card", (o.offerLead === true) === e.offerLead, e.offerLead ? "the reply did not offer the contact card" : "the reply offered the contact card where it must not");
  if (e.disclaimer !== undefined) add(e.disclaimer ? "disclaimer shown" : "disclaimer not repeated", o.showDisclaimer === e.disclaimer, e.disclaimer ? "the full disclaimer is missing" : "the full disclaimer was shown again");
  for (const a of e.amounts ?? []) add(`has $${a}`, containsNumber(normalized, a), `the amount ${a} is not in the answer`);
  if (e.pages) {
    const pages = o.sources.map((s) => SOURCE_PAGES.find((p) => p.url === s.url)?.n).filter((n): n is number => n !== undefined);
    add("source page", pages.some((n) => e.pages!.includes(n)), `sources are pages [${pages.join(", ")}], expected one of [${e.pages.join(", ")}]`);
  }
  for (const re of e.mustMatch ?? []) add(`must match ${re}`, re.test(text), `no match for ${re}`);
  for (const re of e.mustNotMatch ?? []) add(`must not match ${re}`, !re.test(text), `matches ${re}`);
  for (const re of e.shouldMatch ?? []) add(`should match ${re}`, re.test(text), `no match for ${re}`, true);
  for (const re of e.shouldNotMatch ?? []) add(`should not match ${re}`, !re.test(text), `matches ${re}`, true);
  return r;
}
