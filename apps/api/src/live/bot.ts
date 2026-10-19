/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/live/bot.ts
 * PURPOSE : Live bot: a question comes in, a checked answer with sources goes
 *           out. The flow: rewrite (language, query, category), then choose a
 *           branch, then reply. The SERVER decides, not the model: source
 *           links, suggested questions, the quote link, the kind of reply, the
 *           disclaimer once per session, the contact card, and what to show
 *           when something looks wrong. An answer that does not cite a real
 *           piece is never shown.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Default fixed text and the special chunk kinds (disclaimer, medical)
 *    2. Live bot options (retriever, answerer, rewriter, localizer, log, and
 *       so on)
 *    3. Builder of the live bot and its helpers (suggestions, language,
 *       logging reasons)
 *    4. Contact card: rules for when it is offered (once, not in care mode,
 *       not for medical questions)
 *    5. Full disclaimer once per session
 *    6. limited: the reply when a usage limit is hit (without the model)
 *    7. reply: prepare the history, rewrite, language, care mode
 *    8. BRANCH 1: crisis (two detectors, fixed text, care mode starts)
 *    9. BRANCH 2: small talk without searching the pages
 *    10. BRANCH 3: normal path (search pages, the model answers, the server
 *        checks)
 *    11. Logging unanswered questions and replies without page content
 *    12. Grounded answer: disclaimer, sources, suggestions, contact card
 *    13. If something fails: a safe error reply
 * IF ASKED TO CHANGE:
 *    - Chunk kinds that trigger the disclaimer or are hidden for medical
 *      questions (PART 1)
 *    - Rules for when the contact card appears (PART 4)
 *    - Reason 'price_not_listed' (money words in PRICE_WORDS) (PART 3)
 *    - What changes in care mode (no quote, no suggestions) (PART 10)
 *    - Behaviour in a crisis (PART 8)
 *    - Fixed reply text: edit it in i18n/texts.ts (PART 1)
 * ============================================================================ */

/**
 * The live bot: question in, checked answer with sources out.
 *
 *   question -> rewrite (language, search query, category) -> decide the branch -> reply
 *
 * What the server decides, never the model: the source links (from the fixed list of seven pages, through the cited
 * chunk ids), the follow-up suggestions (a fixed table), the quote link, the kind of reply, whether the disclaimer is
 * shown (once per session), and what to show when something is off. An answer that cites no real chunk is never shown;
 * a fixed reply takes its place. Fixed texts come in the visitor's language (see i18n).
 *
 * Branches, in this order:
 *   crisis      the visitor may harm themselves: fixed text, nothing else is looked up or offered (and care mode starts)
 *   small talk  greeting, thanks, "who are you": answered without the pages
 *   otherwise   search the pages, the model answers from them, the server checks it; the category only changes the kind
 *               of reply (medical decline, out of scope) and what comes with it
 */
import { MAX_FOLLOW_UPS, QUOTE_URL, type AnswerKind, type ChatResponse, type LeadTexts } from "@pwbot/shared";
import type { Answerer, SmallTalker } from "../answer";
import type { Bot } from "../bot";
import { looksLikeCrisis } from "../crisis";
import { EN, primaryCode, type Language, type Localizer, type TextKey } from "../i18n";
import { LIMIT_TEXTS, guessLanguage, limitText, textKeyFor, type LimitReason } from "../limits";
import { createHistoryStore, type HistoryStore } from "../history";
import { FOLLOW_UP_KEYS, topicOfKinds, type Topic } from "../follow-ups";
import { buildResponse, errorResponse } from "../responses";
import { gatherChunks, type Retriever } from "../retrieval";
import type { Rewrite, Rewriter } from "../rewrite";
import type { Reason, UnansweredLog } from "../unanswered";

// ===== PART 1: Default fixed text and the special chunk kinds (disclaimer, medical) =====
/** The English master texts, kept under their old names for tests and tools. The visitor gets them in their own language. */
export const UNGROUNDED_REPLY = EN.ungrounded;
export const NOT_FOUND_REPLY = EN.not_found;
export const REFUSED_REPLY = EN.refused;
export const ERROR_REPLY = EN.error;
export const CRISIS_REPLY = EN.crisis;

/**
 * Chunk kinds that talk about risks, outcomes or other people's experiences. A reply built on them carries the disclaimer.
 * Not "disclaimer": that kind is page 7's note about price estimates, and a price check must not use up the medical disclaimer.
 */
const DISCLAIMER_KINDS = new Set(["risks", "review", "patient_story"]);
/** Chunk kinds the answer step never sees for a medical question (a story or review of a result must not answer "will it cure me?"). */
export const MEDICAL_HIDDEN_KINDS = new Set(["review", "patient_story"]);

// ===== PART 2: Live bot options (retriever, answerer, rewriter, localizer, log, and so on) =====
export interface LiveBotOptions {
  retriever: Retriever;
  answerer: Answerer;
  /** Turns the message into a search query and finds the answer language and the category. */
  rewriter: Rewriter;
  /** Fixed texts in the visitor's language. Default: English only. */
  localizer?: Localizer;
  /** Answers greetings and "who are you" without the pages. Default: such messages go through the normal path. */
  smallTalker?: SmallTalker;
  /** Where unanswered questions are noted (N5). Default: nowhere. Crisis messages and care-mode sessions are never passed to it. */
  unanswered?: UnansweredLog;
  /** Conversation memory. Default: a fresh in-memory store. */
  history?: HistoryStore;
  /** How many chunks the vector search returns. */
  resultCount?: number;
  /** How many pages are added in full next to the hits (0 = off). */
  expandPages?: number;
  /** Where server-side problems are written. Never receives the visitor's question. */
  log?: (message: string) => void;
}

const englishOnly: Localizer = {
  async get(keys) {
    return Object.fromEntries(keys.map((k) => [k, EN[k]])) as Record<(typeof keys)[number], string>;
  },
};

// ===== PART 3: Builder of the live bot and its helpers (suggestions, language, logging reasons) =====
export function createLiveBot({
  retriever,
  answerer,
  rewriter,
  localizer = englishOnly,
  smallTalker,
  unanswered,
  history = createHistoryStore(),
  resultCount = 5,
  expandPages = 0,
  log = (m) => console.error(m),
}: LiveBotOptions): Bot {
  const followUps = async (topic: Topic, language: Language): Promise<string[]> => {
    const keys = FOLLOW_UP_KEYS[topic].slice(0, MAX_FOLLOW_UPS);
    const t = await localizer.get(keys, language);
    return keys.map((k) => t[k]);
  };

  /** The language of this message: from the rewrite step, else the last one seen in this session, else English. */
  const languageOf = (rw: Rewrite, sessionId: string): Language => {
    if (rw.code) return { code: rw.code, name: rw.language };
    const f = history.flags(sessionId);
    return { code: f.languageCode, name: f.languageName };
  };

  /** A question about money that could not be answered gets its own reason. Decided on the English query, so it works in every language. */
  const PRICE_WORDS = /\b(price|prices|pricing|cost|costs|how much|fee|fees|expensive|cheap|cheaper)\b/i;
  const reasonFor = (rw: Rewrite, message: string, medical: boolean): Reason =>
    medical ? "medical_declined" : rw.category === "out_of_scope" ? "out_of_scope" : PRICE_WORDS.test(rw.fallback ? message : rw.query) ? "price_not_listed" : "not_in_content";

  // ===== PART 4: Contact card: rules for when it is offered (once, not in care mode, not for medical questions) =====
  /**
   * The lead card (name and email for a quote), offered only when the visitor asked for a quote or to be contacted, at most once per
   * session, never in care mode and never next to a medical reply. The card's words come in the visitor's language.
   */
  const LEAD_KEYS = ["lead_title", "lead_name", "lead_email", "lead_consent", "lead_submit", "lead_decline", "lead_thanks", "lead_failed"] as const;
  const leadOffer = async (rw: Rewrite, sessionId: string, language: Language, care: boolean, medical: boolean): Promise<Partial<ChatResponse>> => {
    if (rw.wantsQuote !== true || care || medical || history.flags(sessionId).leadOffered) return {};
    history.setFlags(sessionId, { leadOffered: true });
    const t = await localizer.get(LEAD_KEYS, language);
    const lead_texts: LeadTexts = { title: t.lead_title, name: t.lead_name, email: t.lead_email, consent: t.lead_consent, submit: t.lead_submit, decline: t.lead_decline, thanks: t.lead_thanks, failed: t.lead_failed };
    return { offer_lead: true, lead_texts };
  };

  // ===== PART 5: Full disclaimer once per session =====
  /** Show the full disclaimer once per session, decided here. */
  const disclaimerOnce = async (sessionId: string, language: Language): Promise<Pick<ChatResponse, "show_disclaimer" | "disclaimer_text">> => {
    if (history.flags(sessionId).disclaimerShown) return { show_disclaimer: false, disclaimer_text: null };
    history.setFlags(sessionId, { disclaimerShown: true });
    const { disclaimer } = await localizer.get(["disclaimer"], language);
    return { show_disclaimer: true, disclaimer_text: disclaimer };
  };

  return {

    // ===== PART 6: limited: the reply when a usage limit is hit (without the model) =====
    /** A refused message: a fixed text in the visitor's language (only the five hand-written ones; no model call). Care mode: never a quote button. */
    limited(sessionId, message, reason: LimitReason) {
      const f = history.flags(sessionId);
      const known = primaryCode(f.languageCode);
      const code = LIMIT_TEXTS[known] && f.languageCode ? known : guessLanguage(message);
      const key = textKeyFor(reason);
      return {
        status: 429,
        body: buildResponse({ kind: "rate_limited", answer: limitText(code, reason), quote_url: key === "budget" && !f.care ? QUOTE_URL : null }),
      };
    },

    // ===== PART 7: reply: prepare the history, rewrite, language, care mode =====
    async reply(sessionId, message, fromBrowser) {
      let language: Language = {};
      try {
        // The browser's copy of the chat is taken only when the server has forgotten the session. It is data for the model, like any visitor text.
        if (fromBrowser?.length) history.seed(sessionId, fromBrowser);
        const earlier = history.get(sessionId);
        const rw = await rewriter.rewrite(message, earlier);
        language = languageOf(rw, sessionId);
        if (rw.code) history.setFlags(sessionId, { languageCode: rw.code, languageName: rw.language });
        const care = history.flags(sessionId).care;

        // ===== PART 8: BRANCH 1: crisis (two detectors, fixed text, care mode starts) =====
        // 1. Crisis. Two independent detectors: the rewrite step's category and a keyword net that needs no model.
        if (rw.category === "crisis" || looksLikeCrisis(message)) {
          const { crisis } = await localizer.get(["crisis"], language);
          history.add(sessionId, message, crisis);
          history.setFlags(sessionId, { care: true });
          return { status: 200, body: buildResponse({ kind: "crisis", answer: crisis }) };
        }

        // ===== PART 9: BRANCH 2: small talk without searching the pages =====
        // 2. Small talk. If the small talker is missing or fails, the message goes through the normal path below.
        if (rw.category === "small_talk" && smallTalker) {
          try {
            const text = await smallTalker.reply(message, { language: rw.fallback ? undefined : rw.language, history: earlier });
            history.add(sessionId, message, text);
            return { status: 200, body: buildResponse({ kind: "small_talk", answer: text, follow_ups: care ? [] : await followUps("general", language) }) };
          } catch (e) {
            log(`[chat] small talk failed, using the normal path (${e instanceof Error ? e.message : String(e)})`);
          }
        }

        // ===== PART 10: BRANCH 3: normal path (search pages, the model answers, the server checks) =====
        // 3. The normal path.
        const medical = rw.category === "medical";
        const found = await gatherChunks(retriever, rw.query, { resultCount, expandPages, visitorMessage: message, log });
        // A medical question ("will it cure my cancer?") must never be answered with a patient's story or a review of a result: the answer step
        // does not see them. The pages' own cautions, FAQ and overview stay.
        const chunks = medical ? found.filter((c) => !MEDICAL_HIDDEN_KINDS.has(c.kind)) : found;
        const r = await answerer.answer(message, chunks, { language: rw.language, history: earlier, care });
        // In care mode nothing is sold: no quote button and no suggested questions.
        const quote = care ? null : QUOTE_URL;
        const generalFollowUps = care ? [] : await followUps("general", language);

        // ===== PART 11: Logging unanswered questions and replies without page content =====
        // Noted after the reply is built, never awaited. Not in care mode: that session is health-sensitive, nothing from it is kept.
        const note = (reason: Reason) => {
          if (!unanswered || care) return;
          try {
            void unanswered.record({ question: message, reason, sessionId }).catch(() => {});
          } catch {
            // A broken log must never reach the visitor.
          }
        };

        /** A reply that claims nothing from the pages. */
        const nothing = async (answer: string, fixed: boolean): Promise<{ status: number; body: ChatResponse }> => {
          const kind: AnswerKind = medical ? "medical_declined" : rw.category === "out_of_scope" ? "out_of_scope" : "not_in_content";
          const disclaimer = medical ? await disclaimerOnce(sessionId, language) : {};
          if (!fixed) history.add(sessionId, message, answer);
          note(reasonFor(rw, message, medical));
          const lead = await leadOffer(rw, sessionId, language, care, medical);
          return { status: 200, body: buildResponse({ kind, answer, quote_url: medical ? null : quote, follow_ups: generalFollowUps, ...disclaimer, ...lead }) };
        };

        if (r.kind === "refused") {
          const t = await localizer.get(["refused"], language);
          return nothing(t.refused, true);
        }
        if (r.kind === "not_in_content") {
          const t = await localizer.get(["not_found", "medical_fallback"], language);
          return nothing(r.answer || (medical ? t.medical_fallback : t.not_found), !r.answer);
        }
        if (r.ungrounded) {
          log("[chat] an answer cited no valid chunk and was replaced by the fixed reply");
          const t = await localizer.get(["ungrounded", "medical_fallback"], language);
          return nothing(medical ? t.medical_fallback : t.ungrounded, true);
        }

        // ===== PART 12: Grounded answer: disclaimer, sources, suggestions, contact card =====
        history.add(sessionId, message, r.answer);
        const usedKinds = r.usedChunks.map((c) => c.kind);
        const needsDisclaimer = medical || usedKinds.some((k) => DISCLAIMER_KINDS.has(k));
        const disclaimer = needsDisclaimer ? await disclaimerOnce(sessionId, language) : {};
        // A request the bot cannot act on (booking, for example) can still be answered from the pages, for instance by pointing to the
        // consultation link. It keeps its sources, but it is labelled out_of_scope and carries the quote button, as the fixed replies do.
        const outOfScope = !medical && rw.category === "out_of_scope";
        if (medical) note("medical_declined");
        else if (outOfScope) note("out_of_scope");
        const lead = await leadOffer(rw, sessionId, language, care, medical);
        return {
          status: 200,
          body: buildResponse({
            kind: medical ? "medical_declined" : outOfScope ? "out_of_scope" : "answer",
            answer: r.answer,
            sources: r.sources,
            ...(outOfScope ? { quote_url: quote } : {}),
            follow_ups: care ? [] : await followUps(topicOfKinds(usedKinds), language),
            ...disclaimer,
            ...lead,
          }),
        };
      } catch (e) {

        // ===== PART 13: If something fails: a safe error reply =====
        // The visitor sees a plain message; the real reason goes to the server log (it never contains a key or the question).
        log(`[chat] ${e instanceof Error ? e.message : String(e)}`);
        const { error } = await localizer.get(["error"], language).catch(() => ({ error: ERROR_REPLY }));
        return { status: 500, body: errorResponse("error", error) };
      }
    },
  };
}
