/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/follow-ups.ts
 * PURPOSE : Fixed table of follow-up question suggestions. The suggestions are
 *           NOT made by the model, so every question can surely be answered by
 *           the bot and does not repeat the topic that was just answered.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Suggested question text (English)
 *    2. Table of suggestions per topic
 *    3. Mapping of chunk kinds to topics
 *    4. Version of the text keys, so they are shown in the visitor's language
 * IF ASKED TO CHANGE:
 *    - Wording of the suggested questions (PART 1)
 *    - Suggestions that appear for each topic (PART 2)
 *    - Which topic is triggered by which chunk kind (PART 3)
 * ============================================================================ */

/**
 * Follow-up suggestions come from this fixed table, never from the model. Every question here is one the bot
 * can answer, and none repeats the topic that was just answered. (They are English for now; see the README.)
 */

/** What the reply was about. It selects the follow-up questions offered under the reply. */
export type Topic = "cost" | "included" | "duration" | "after" | "about" | "general";

// ===== PART 1: Suggested question text (English) =====
const ASK_COST = "How much does the treatment cost?";
const ASK_INCLUDED = "What is included in the package?";
const ASK_DURATION = "How long is the program?";
const ASK_AFTER = "What happens after the program?";
const ASK_ABOUT = "Tell me about the ITC Immunity Therapy Center";

// ===== PART 2: Table of suggestions per topic =====
export const FOLLOW_UPS: Record<Topic, string[]> = {
  cost: [ASK_INCLUDED, ASK_DURATION, ASK_AFTER],
  included: [ASK_COST, ASK_DURATION, ASK_AFTER],
  duration: [ASK_COST, ASK_INCLUDED, ASK_AFTER],
  after: [ASK_COST, ASK_INCLUDED, ASK_DURATION],
  about: [ASK_COST, ASK_INCLUDED, ASK_DURATION],
  general: [ASK_COST, ASK_INCLUDED, ASK_ABOUT],
};

// ===== PART 3: Mapping of chunk kinds to topics =====
/** The chunk kinds that map to a topic. Anything else (faq, review, overview...) gives the general suggestions. */
const TOPIC_OF_KIND: Record<string, Topic> = {
  price: "cost",
  included: "included",
  excluded: "included",
  optional: "included",
  itinerary: "duration",
  destination: "about",
};

export function topicOfKinds(kinds: string[]): Topic {
  for (const k of kinds) {
    const t = TOPIC_OF_KIND[k];
    if (t) return t;
  }
  return "general";
}

// ===== PART 4: Version of the text keys, so they are shown in the visitor's language =====
/** The same table as FOLLOW_UPS, as text keys, so the questions can be shown in the visitor's language (see i18n). */
export const FOLLOW_UP_KEYS: Record<Topic, readonly ("ask_cost" | "ask_included" | "ask_duration" | "ask_after" | "ask_about")[]> = {
  cost: ["ask_included", "ask_duration", "ask_after"],
  included: ["ask_cost", "ask_duration", "ask_after"],
  duration: ["ask_cost", "ask_included", "ask_after"],
  after: ["ask_cost", "ask_included", "ask_duration"],
  about: ["ask_cost", "ask_included", "ask_duration"],
  general: ["ask_cost", "ask_included", "ask_about"],
};
