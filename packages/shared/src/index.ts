/* ============================================================================
 * PETA FILE
 * FILE    : packages/shared/src/index.ts
 * TUJUAN  : Kontrak bersama antara server dan browser: batas panjang pesan,
 *           jenis balasan, bentuk permintaan dan jawaban chat, bentuk
 *           permintaan kartu kontak, tujuh halaman sumber yang sah, link
 *           penawaran, teks disclaimer, dan pemeriksa bentuk data
 *           (isChatResponse).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Batas: panjang pesan, jumlah riwayat, panjang jawaban lama
 *    2. Batas dan versi persetujuan kartu kontak (N4)
 *    3. Batas saran lanjutan per balasan
 *    4. Jenis balasan yang mungkin
 *    5. Tipe: sumber, riwayat, permintaan chat
 *    6. Tipe: teks kartu kontak dan permintaan serta jawaban /api/lead
 *    7. Tipe: bentuk jawaban chat dan health
 *    8. Tujuh halaman sumber yang sah (satu-satunya link sumber yang boleh)
 *    9. Link formulir penawaran gratis
 *    10. Teks disclaimer lengkap
 *    11. Pemeriksa bentuk data yang datang lewat jaringan
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah batas panjang pesan: BAGIAN 1 (juga batas di kotak input web)
 *    - Mengubah teks disclaimer: BAGIAN 10
 *    - Mengubah daftar halaman sumber: BAGIAN 8 dan PAGE_TYPES di
 *      apps/ingest/src/pages.ts
 * ============================================================================ */

// ===== BAGIAN 1: Batas: panjang pesan, jumlah riwayat, panjang jawaban lama =====
/**
 * Shared API contract between the web UI and the API server.
 *
 * Why this lives in its own package: the UI and the server must agree on the exact
 * response shape. Keeping the types in one place means a contract change fails the
 * typecheck on both sides instead of breaking at runtime.
 */
/** Longest message the API accepts. The UI enforces the same limit on the input box. */
export const MAX_MESSAGE_LENGTH = 500;

/**
 * Earlier turns the browser may send along with a message. The server keeps its own history in memory; the browser's copy is used
 * only when the server has forgotten the session (restart, an hour of silence), so a reload or a restart does not break a follow-up.
 */
export const MAX_HISTORY_ENTRIES = 12;
/** Longest earlier bot answer accepted in the history (the browser cuts longer ones; they are context only). */
export const MAX_HISTORY_ANSWER_LENGTH = 2000;

// ===== BAGIAN 2: Batas dan versi persetujuan kartu kontak (N4) =====
/** Lead capture (nice-to-have N4): limits for the name and email a visitor may leave, and the version of the consent text they agreed to. */
export const MAX_LEAD_NAME_LENGTH = 100;
export const MAX_LEAD_EMAIL_LENGTH = 254;
export const LEAD_CONSENT_VERSION = "v1";

// ===== BAGIAN 3: Batas saran lanjutan per balasan =====
/** Most follow-up suggestions a reply may carry. More than a few only adds choice overload. */
export const MAX_FOLLOW_UPS = 3;

// ===== BAGIAN 4: Jenis balasan yang mungkin =====
/**
 * What kind of reply the bot produced. The UI uses it for styling, and the server
 * uses it to decide which fixed behaviour applied (answer, decline, fallback).
 */
export const ANSWER_KINDS = [
  "answer",
  "not_in_content",
  "price_not_listed",
  "out_of_scope",
  "medical_declined",
  /** The visitor said they may harm themselves or do not want to live. Fixed text, no sources, no quote link, no suggestions. */
  "crisis",
  /** Greeting, thanks, or a question about the bot itself. Answered without searching the pages. */
  "small_talk",
  "rate_limited",
  "error",
] as const;

export type AnswerKind = (typeof ANSWER_KINDS)[number];

// ===== BAGIAN 5: Tipe: sumber, riwayat, permintaan chat =====
export interface Source {
  url: string;
  title: string;
}

export interface HistoryEntry {
  role: "visitor" | "assistant";
  text: string;
}

export interface ChatRequest {
  /** Anonymous id created by the browser for one conversation. */
  session_id: string;
  message: string;
  /**
   * Optional. The last exchanges, oldest first, alternating visitor / assistant and starting with the visitor (so an even number).
   * At most MAX_HISTORY_ENTRIES. Treated as untrusted data and used only when the server has no history for the session.
   */
  history?: HistoryEntry[];
}

// ===== BAGIAN 6: Tipe: teks kartu kontak dan permintaan serta jawaban /api/lead =====
/** The words of the lead card, in the visitor's language, chosen by the server (the web page has no texts of its own for it). */
export interface LeadTexts {
  title: string;
  name: string;
  email: string;
  consent: string;
  submit: string;
  decline: string;
  thanks: string;
  failed: string;
}
export const LEAD_TEXT_FIELDS = ["title", "name", "email", "consent", "submit", "decline", "thanks", "failed"] as const satisfies ReadonlyArray<keyof LeadTexts>;

/** What the lead card sends to POST /api/lead. `consent` must be true: it is the visitor's ticked box. `website` is a hidden field only a bot fills in. */
export interface LeadRequest {
  session_id: string;
  name: string;
  email: string;
  consent: true;
  /** Language code of the chat (for the owner's follow-up). Optional. */
  language?: string;
  website?: string;
}

export interface LeadResponse {
  ok: boolean;
}

// ===== BAGIAN 7: Tipe: bentuk jawaban chat dan health =====
export interface ChatResponse {
  answer: string;
  kind: AnswerKind;
  /** Pages the answer came from. Empty for replies that make no factual claim. */
  sources: Source[];
  /** True only the first time a medical disclaimer is relevant in a session. */
  show_disclaimer: boolean;
  /** The disclaimer in the visitor's language, set together with show_disclaimer. The UI falls back to DISCLAIMER_TEXT when it is missing. */
  disclaimer_text?: string | null;
  /** Link to the free quote form, set when the bot suggests contacting PlacidWay. */
  quote_url: string | null;
  /** True when the bot offers to pass the visitor's name and email to the PlacidWay team (at most once per session, never in care mode). */
  offer_lead: boolean;
  /** The words of the lead card in the visitor's language. Set together with offer_lead. */
  lead_texts?: LeadTexts | null;
  /**
   * Up to MAX_FOLLOW_UPS suggested next questions. The server picks them from a fixed table
   * (never from the model), so each one is a question the bot can actually answer.
   */
  follow_ups: string[];
}

export interface HealthResponse {
  status: "ok";
  /** "mock" means the answers are canned samples, not generated from the knowledge base. */
  mode: "mock" | "live";
}

// ===== BAGIAN 8: Tujuh halaman sumber yang sah (satu-satunya link sumber yang boleh) =====
/** The only pages the bot may use as a knowledge base, and therefore the only valid sources. */
export const SOURCE_PAGES: readonly (Source & { n: number })[] = [
  {
    n: 1,
    title: "ITC Immunity Therapy Center – Alternative Cancer Treatment",
    url: "https://www.placidway.com/profile/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center",
  },
  {
    n: 2,
    title: "Alternative Adenocarcinoma Cancer Treatment in Tijuana",
    url: "https://www.placidway.com/package/7903/Alternative-Adenocarcinoma-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC",
  },
  {
    n: 3,
    title: "Alternative Adrenal Cancer Treatment in Tijuana",
    url: "https://www.placidway.com/package/7902/Alternative-Adrenal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC",
  },
  {
    n: 4,
    title: "Alternative Anal Cancer Treatment in Tijuana",
    url: "https://www.placidway.com/package/7901/Alternative-Anal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC",
  },
  {
    n: 5,
    title: "ITC Tijuana Videos – Alternative Cancer Treatment",
    url: "https://www.placidway.com/profile-videos/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center",
  },
  {
    n: 6,
    title: "ITC Immunity Therapy Center – Price List",
    url: "https://www.placidway.com/price-list/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center",
  },
  {
    n: 7,
    title: "Alternative Medicine Cost Abroad – Compare Prices 2026",
    url: "https://www.placidway.com/search-medical-pricings/Alternative-Medicine/All/1",
  },
];

// ===== BAGIAN 9: Link formulir penawaran gratis =====
/** Free quote form link. It is taken from the page content (the "Contact PlacidWay for a Free Quote" link). */
export const QUOTE_URL =
  "https://www.placidway.com/rfi/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center";

// ===== BAGIAN 10: Teks disclaimer lengkap =====
/**
 * Disclaimer wording. It reuses the sentences from the "Important Disclaimer" block of
 * the price comparison page, so the bot says what PlacidWay itself says.
 */
export const DISCLAIMER_TEXT =
  "PlacidWay provides medical travel information, not healthcare services, and does not endorse any provider. " +
  "Consult your local licensed healthcare provider before pursuing any treatment.";

// ===== BAGIAN 11: Pemeriksa bentuk data yang datang lewat jaringan =====
/** Runtime check for data that crossed the network, so the UI never trusts an unknown shape. */
export function isChatResponse(value: unknown): value is ChatResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.answer === "string" &&
    typeof v.kind === "string" &&
    (ANSWER_KINDS as readonly string[]).includes(v.kind) &&
    Array.isArray(v.sources) &&
    typeof v.show_disclaimer === "boolean" &&
    (v.disclaimer_text === undefined || v.disclaimer_text === null || typeof v.disclaimer_text === "string") &&
    (v.quote_url === null || typeof v.quote_url === "string") &&
    typeof v.offer_lead === "boolean" &&
    (v.lead_texts === undefined || v.lead_texts === null || isLeadTexts(v.lead_texts)) &&
    Array.isArray(v.follow_ups) &&
    v.follow_ups.every((item) => typeof item === "string")
  );
}

function isLeadTexts(value: unknown): value is LeadTexts {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return LEAD_TEXT_FIELDS.every((k) => typeof v[k] === "string");
}
