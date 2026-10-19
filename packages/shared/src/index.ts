/* ============================================================================
 * FILE MAP
 * FILE    : packages/shared/src/index.ts
 * PURPOSE : Contract shared by the server and the browser: message length
 *           limit, reply kinds, the shape of chat requests and answers, the
 *           shape of the contact card request, the seven valid source pages,
 *           the quote link, the disclaimer text, and the shape checker
 *           (isChatResponse).
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Limits: message length, number of history entries, length of an old
 *       answer
 *    2. Limits and version of the contact card consent (N4)
 *    3. Limit on follow-up suggestions per reply
 *    4. Possible reply kinds
 *    5. Type: source, history, chat request
 *    6. Type: contact card text and the /api/lead request and answer
 *    7. Type: the shape of the chat and health answers
 *    8. The seven valid source pages (the only source links allowed)
 *    9. Link to the free quote form
 *    10. Full disclaimer text
 *    11. Checker for the shape of data that arrives over the network
 * IF ASKED TO CHANGE:
 *    - Change the message length limit: PART 1 (also the limit in the web
 *      input box)
 *    - Change the disclaimer text: PART 10
 *    - Change the list of source pages: PART 8 and PAGE_TYPES in
 *      apps/ingest/src/pages.ts
 * ============================================================================ */

// ===== PART 1: Limits: message length, number of history entries, length of an old answer =====
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

// ===== PART 2: Limits and version of the contact card consent (N4) =====
/** Lead capture (nice-to-have N4): limits for the name and email a visitor may leave, and the version of the consent text they agreed to. */
export const MAX_LEAD_NAME_LENGTH = 100;
export const MAX_LEAD_EMAIL_LENGTH = 254;
export const LEAD_CONSENT_VERSION = "v1";

// ===== PART 3: Limit on follow-up suggestions per reply =====
/** Most follow-up suggestions a reply may carry. More than a few only adds choice overload. */
export const MAX_FOLLOW_UPS = 3;

// ===== PART 4: Possible reply kinds =====
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

// ===== PART 5: Type: source, history, chat request =====
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

// ===== PART 6: Type: contact card text and the /api/lead request and answer =====
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

// ===== PART 7: Type: the shape of the chat and health answers =====
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

// ===== PART 8: The seven valid source pages (the only source links allowed) =====
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

// ===== PART 9: Link to the free quote form =====
/** Free quote form link. It is taken from the page content (the "Contact PlacidWay for a Free Quote" link). */
export const QUOTE_URL =
  "https://www.placidway.com/rfi/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center";

// ===== PART 10: Full disclaimer text =====
/**
 * Disclaimer wording. It reuses the sentences from the "Important Disclaimer" block of
 * the price comparison page, so the bot says what PlacidWay itself says.
 */
export const DISCLAIMER_TEXT =
  "PlacidWay provides medical travel information, not healthcare services, and does not endorse any provider. " +
  "Consult your local licensed healthcare provider before pursuing any treatment.";

// ===== PART 11: Checker for the shape of data that arrives over the network =====
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
