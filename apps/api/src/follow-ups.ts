/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/follow-ups.ts
 * TUJUAN  : Tabel tetap saran pertanyaan lanjutan. Saran TIDAK dibuat oleh
 *           model, jadi tiap pertanyaan pasti bisa dijawab bot dan tidak
 *           mengulang topik yang baru dijawab.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Teks saran pertanyaan (Inggris)
 *    2. Tabel saran per topik
 *    3. Pemetaan jenis chunk ke topik
 *    4. Versi kunci teks, supaya tampil dalam bahasa pengunjung
 * KALAU DIMINTA MENGUBAH:
 *    - Kata-kata saran pertanyaan (BAGIAN 1)
 *    - Saran yang muncul untuk tiap topik (BAGIAN 2)
 *    - Topik mana yang dipicu jenis chunk apa (BAGIAN 3)
 * ============================================================================ */

/**
 * Follow-up suggestions come from this fixed table, never from the model. Every question here is one the bot
 * can answer, and none repeats the topic that was just answered. (They are English for now; see the README.)
 */

/** What the reply was about. It selects the follow-up questions offered under the reply. */
export type Topic = "cost" | "included" | "duration" | "after" | "about" | "general";

// ===== BAGIAN 1: Teks saran pertanyaan (Inggris) =====
const ASK_COST = "How much does the treatment cost?";
const ASK_INCLUDED = "What is included in the package?";
const ASK_DURATION = "How long is the program?";
const ASK_AFTER = "What happens after the program?";
const ASK_ABOUT = "Tell me about the ITC Immunity Therapy Center";

// ===== BAGIAN 2: Tabel saran per topik =====
export const FOLLOW_UPS: Record<Topic, string[]> = {
  cost: [ASK_INCLUDED, ASK_DURATION, ASK_AFTER],
  included: [ASK_COST, ASK_DURATION, ASK_AFTER],
  duration: [ASK_COST, ASK_INCLUDED, ASK_AFTER],
  after: [ASK_COST, ASK_INCLUDED, ASK_DURATION],
  about: [ASK_COST, ASK_INCLUDED, ASK_DURATION],
  general: [ASK_COST, ASK_INCLUDED, ASK_ABOUT],
};

// ===== BAGIAN 3: Pemetaan jenis chunk ke topik =====
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

// ===== BAGIAN 4: Versi kunci teks, supaya tampil dalam bahasa pengunjung =====
/** The same table as FOLLOW_UPS, as text keys, so the questions can be shown in the visitor's language (see i18n). */
export const FOLLOW_UP_KEYS: Record<Topic, readonly ("ask_cost" | "ask_included" | "ask_duration" | "ask_after" | "ask_about")[]> = {
  cost: ["ask_included", "ask_duration", "ask_after"],
  included: ["ask_cost", "ask_duration", "ask_after"],
  duration: ["ask_cost", "ask_included", "ask_after"],
  after: ["ask_cost", "ask_included", "ask_duration"],
  about: ["ask_cost", "ask_included", "ask_duration"],
  general: ["ask_cost", "ask_included", "ask_about"],
};
