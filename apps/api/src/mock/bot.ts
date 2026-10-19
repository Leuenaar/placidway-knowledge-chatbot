/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/mock/bot.ts
 * TUJUAN  : Bot contoh (mock): jawaban siap pakai yang dipilih lewat kata
 *           kunci. Dipakai saat server jalan tanpa .env.api, supaya tampilan
 *           bisa dibangun dan diuji tanpa model. Fakta di dalamnya diambil
 *           dari halaman asli, tapi teksnya tetap contoh: tidak membaca
 *           knowledge base.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe data jawaban contoh
 *    2. Teks kartu kontak untuk mock (dari teks Inggris yang sama dengan bot live)
 *    3. Pembantu: ambil sumber dan pola bahasa
 *    4. Daftar aturan kata kunci (dari atas ke bawah, yang pertama cocok menang)
 *    5. Jawaban bila tidak ada aturan yang cocok
 *    6. Penanda error untuk uji tampilan (test rate limit, test error)
 *    7. Pembuat bot mock: pilih aturan, disclaimer dan kartu kontak sekali per sesi
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah atau mengubah jawaban contoh: cari kata kuncinya di dalam
 *      daftar aturan (BAGIAN 4)
 *    - Memicu error di tampilan: ketik 'test error' atau 'test rate limit'
 *      (BAGIAN 6)
 * ============================================================================ */

/**
 * Mock bot: canned replies chosen by keywords.
 *
 * Why it exists: it lets the UI be built and reviewed before the real pipeline exists.
 * The facts in these replies come from the crawled pages (prices, program names, the
 * 3-month follow-up), so the demo does not show invented numbers. The text is still
 * canned: nothing here reads the knowledge base.
 *
 * Rules run top to bottom and the first match wins. Order matters: specific rules
 * (the "$50" trick, medical questions) must come before generic ones (cost).
 */
import {
  MAX_FOLLOW_UPS,
  QUOTE_URL,
  SOURCE_PAGES,
  type AnswerKind,
  type ChatResponse,
  type LeadTexts,
  type Source,
} from "@pwbot/shared";
import { FOLLOW_UPS, type Topic } from "../follow-ups";
import { EN } from "../i18n";
import { buildResponse, errorResponse } from "../responses";

// ===== BAGIAN 1: Tipe data jawaban contoh =====
export interface MockResult {
  status: number;
  body: ChatResponse;
}

interface Draft {
  kind: AnswerKind;
  answer: string;
  sources?: Source[];
  /** Selects the follow-up suggestions. Defaults to "general". */
  topic?: Topic;
  /** Attach the free quote link. */
  withQuote?: boolean;
  /** The topic is medical, so the disclaimer is relevant (shown once per session). */
  medical?: boolean;
  /** Offer the lead card (name and email for a quote), once per session. */
  offerLead?: boolean;
}

interface Rule {
  matches: (message: string) => boolean;
  draft: () => Draft;
}

// ===== BAGIAN 2: Teks kartu kontak untuk mock (dari teks Inggris yang sama dengan bot live) =====
/** The lead card's words for the mock (English only), taken from the same master texts the live bot uses. */
const MOCK_LEAD_TEXTS: LeadTexts = {
  title: EN.lead_title,
  name: EN.lead_name,
  email: EN.lead_email,
  consent: EN.lead_consent,
  submit: EN.lead_submit,
  decline: EN.lead_decline,
  thanks: EN.lead_thanks,
  failed: EN.lead_failed,
};

// ===== BAGIAN 3: Pembantu: ambil sumber dan pola bahasa =====
/** Looks up a source by its number in the PDF list, and fails loudly on a typo. */
function page(n: number): Source {
  const found = SOURCE_PAGES.find((p) => p.n === n);
  if (!found) throw new Error(`Unknown source page number: ${n}`);
  return { url: found.url, title: found.title };
}

const ARABIC_SCRIPT = /[؀-ۿ]/;
const SPANISH_COST = /(cu[aá]nto|cuesta|precio)/;

// ===== BAGIAN 4: Daftar aturan kata kunci (dari atas ke bawah, yang pertama cocok menang) =====
const RULES: Rule[] = [
  {
    // Manual triggers so every UI error state can be checked without breaking anything.
    matches: (m) => m.includes("test rate limit"),
    draft: () => {
      throw new RateLimited();
    },
  },
  {
    matches: (m) => m.includes("test error"),
    draft: () => {
      throw new ServerFailure();
    },
  },
  {
    // The UI must render right-to-left text correctly, so Arabic gets a real Arabic reply.
    matches: (m) => ARABIC_SCRIPT.test(m),
    draft: () => ({
      kind: "answer",
      answer:
        "حسب صفحة الباقة، يبلغ سعر برنامج العيادات الخارجية (Out-Patient) لمدة 3 أسابيع 18,995 دولارًا أمريكيًا، " +
        "وسعر برنامج الإقامة (In-Patient) لمدة 3 أسابيع 30,000 دولار أمريكي.\n\n" +
        "هذه الأسعار تقديرية يقدّمها المركز. يُرجى تأكيد السعر مع مقدّم الخدمة أو طلب عرض سعر مجاني.",
      sources: [page(2), page(7)],
    }),
  },
  {
    matches: (m) => SPANISH_COST.test(m),
    draft: () => ({
      kind: "answer",
      answer:
        "Según la página del paquete, el programa ambulatorio (Out-Patient) de 3 semanas cuesta $18,995 USD " +
        "y el programa con hospitalización (In-Patient) de 3 semanas cuesta $30,000 USD.\n\n" +
        "Son precios estimados proporcionados por el centro. Confirme el precio con el proveedor o solicite una cotización gratuita.",
      sources: [page(2), page(7)],
    }),
  },
  {
    matches: (m) => /\b(weather|temperature|rain|forecast)\b|clima/.test(m),
    draft: () => ({
      kind: "out_of_scope",
      answer:
        "I can only help with the PlacidWay pages I was given: the ITC Immunity Therapy Center in Tijuana and alternative medicine prices. " +
        "I can't help with the weather, but I'm glad to answer questions about treatments, packages or costs on those pages.",
    }),
  },
  {
    // Asks to be contacted or for a personal quote: the lead card is offered (once per session, see reply()).
    matches: (m) => /\b(contact me|call me|email me|get a quote|send me a quote|personal quote)\b/.test(m),
    draft: () => ({
      kind: "answer",
      answer: "PlacidWay prepares a personal quote for free. You can request it with the link below, or leave your name and email here and the PlacidWay team can contact you.",
      withQuote: true,
      offerLead: true,
    }),
  },
  {
    matches: (m) => /\b(book|appointment|reserve|schedule)\b/.test(m),
    draft: () => ({
      kind: "not_in_content",
      answer:
        "I can't book appointments. I can only answer questions using the PlacidWay pages I was given.\n\n" +
        "To arrange a consultation, you can request a free quote from PlacidWay.",
      withQuote: true,
    }),
  },
  {
    // Trick question: the bot must not agree with a wrong price.
    matches: (m) => /\$\s?50\b|\b50 dollars\b/.test(m),
    draft: () => ({
      kind: "answer",
      answer:
        "I can't confirm that. The pages list a price starting from $18,995 (USD) for the ITC cancer treatment programs, not $50. " +
        "The price list page shows $18,995 for each cancer type it lists.\n\n" +
        "Prices are estimates, so please confirm the exact price with the provider.",
      sources: [page(6), page(2)],
    }),
  },
  {
    matches: (m) => /\b(safe|safety|diabet|diagnos|should i|my (condition|cancer|health))\b/.test(m),
    draft: () => ({
      kind: "medical_declined",
      answer:
        "I can't tell whether a treatment is safe for you. That depends on your medical history, and only your own doctor can assess it.\n\n" +
        "The clinic profile says patients have a medical evaluation before they are accepted. It also suggests getting a second opinion " +
        "and not delaying standard treatment without talking to your oncologist. I can share what the pages say about eligibility if that helps.",
      sources: [page(1)],
      medical: true,
    }),
  },
  {
    // Follow-up example: "recovery time" is not on any page, so the honest answer is "not listed".
    matches: (m) => m.includes("recover"),
    draft: () => ({
      kind: "not_in_content",
      answer:
        "The pages I have don't give a recovery time.\n\n" +
        "What they do say: the programs run for 3 weeks, and there is one follow-up consultation with an ITC doctor 3 months after discharge. " +
        "For recovery details, you can request a free quote and ask PlacidWay.",
      sources: [page(2)],
      withQuote: true,
      medical: true,
    }),
  },
  {
    // Comparison only between listings for the same procedure, and with their dates.
    matches: (m) => /\b(cheaper|compare|comparison|turkey|thailand|croatia|versus|vs)\b/.test(m),
    draft: () => ({
      kind: "answer",
      answer:
        "On the price comparison page, two clinics list the same procedure, Ozone Therapy. " +
        "Fizikon Medical Center in Konya, Turkey lists $110 (page modified Jul 31, 2023). " +
        "Stem Health Guadalajara in Zapopan, Mexico lists $1000 (modified Mar 28, 2025).\n\n" +
        "On this page the Turkey listing is lower. These are estimates provided by the centers, and the listings were updated on different dates, so please confirm with each provider.",
      sources: [page(7)],
    }),
  },
  {
    matches: (m) => /dental|implant/.test(m),
    draft: () => ({
      kind: "price_not_listed",
      answer:
        "The pages I have don't list a price for dental implants. You can request a free quote and PlacidWay will send you pricing.",
      withQuote: true,
    }),
  },
  {
    matches: (m) => /\b(how long|duration|how many (weeks|days))\b/.test(m),
    draft: () => ({
      kind: "answer",
      answer:
        "Both programs on the package page run for **3 weeks**: Out-Patient at $18,995 and In-Patient at $30,000.\n\n" +
        "The page also lists one follow-up consultation with an ITC doctor 3 months after discharge.",
      sources: [page(2)],
      topic: "duration",
    }),
  },
  {
    matches: (m) => /(what happens after|follow[- ]?up|aftercare|after (the )?(program|treatment|discharge))/.test(m),
    draft: () => ({
      kind: "answer",
      answer:
        "According to the package page, there is one follow-up consultation with an ITC doctor 3 months after discharge.\n\n" +
        "The pages I have don't describe any other aftercare. To ask about it, you can request a free quote.",
      sources: [page(2)],
      topic: "after",
      withQuote: true,
    }),
  },
  {
    matches: (m) => /includ/.test(m),
    draft: () => ({
      kind: "answer",
      answer:
        "The adenocarcinoma package page describes two 3-week programs.\n\n" +
        "**Out-Patient ($18,995 USD)** includes:\n\n" +
        "- Weekly lab work\n" +
        "- One prescribed X-ray, ultrasound or CT scan of one area\n" +
        "- The core therapies of the 3-week program\n" +
        "- Two health-focused meals a day during treatment hours\n" +
        "- Standard out-patient medications\n" +
        "- One follow-up consultation with an ITC doctor after 3 months\n\n" +
        "**In-Patient ($30,000 USD)** includes:\n\n" +
        "- 24/7 medical supervision\n" +
        "- A private room and three meals a day\n" +
        "- Weekly lab panels and one prescribed imaging scan\n" +
        "- The program therapies and in-patient medications\n" +
        "- A follow-up consultation after 3 months",
      sources: [page(2)],
      topic: "included",
      medical: true,
    }),
  },
  {
    // Word boundaries on purpose: a bare "fee" would also match "feel" or "coffee".
    matches: (m) => /\b(costs?|prices?|pricing|how much|fees?)\b/.test(m),
    draft: () => ({
      kind: "answer",
      answer:
        "Price starting from **$18,995** (USD). The adenocarcinoma package page lists two 3-week programs:\n\n" +
        "- Out-Patient: **$18,995**\n" +
        "- In-Patient: **$30,000**\n\n" +
        "Not included in these prices:\n\n" +
        "- Specialist consultations: approx. $200 per visit\n" +
        "- Blood products: approx. $462 per pint\n" +
        "- Ambulance transfers: $950\n" +
        "- Extra CT scans: $300 per area\n\n" +
        "Optional procedures cost extra. Prices are estimates provided by the centers, so please confirm the exact price with the provider or request a free quote.",
      sources: [page(2), page(7)],
      topic: "cost",
    }),
  },
  {
    matches: (m) => /(tell me about|what is itc|about itc|who is itc|overview)/.test(m),
    draft: () => ({
      kind: "answer",
      answer:
        "According to its profile page, the ITC Immunity Therapy Center in Tijuana, Mexico offers alternative cancer treatment programs, " +
        "such as immunotherapies, hyperthermia and biomagnetic therapy, tailored to each patient. " +
        "The page says eligibility depends on cancer type, stage, physical strength, organ function and medical history, with a medical evaluation before acceptance. " +
        "Treatment costs start at $18,995.\n\n" +
        "This describes what the clinic says about itself. It is not a medical result.",
      sources: [page(1)],
      topic: "about",
      medical: true,
    }),
  },
  {
    matches: (m) => /^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(m),
    draft: () => ({
      kind: "answer",
      answer: "Hello. Ask me about the ITC Immunity Therapy Center packages, prices, or how to request a quote.",
    }),
  },
];

// ===== BAGIAN 5: Jawaban bila tidak ada aturan yang cocok =====
/** Used when no rule matches: the honest "I don't know" with the quote suggestion. */
const FALLBACK: Draft = {
  kind: "not_in_content",
  answer:
    "I couldn't find that in the pages I have, so I'd rather not guess. PlacidWay can answer it directly if you request a free quote.",
  withQuote: true,
};

// ===== BAGIAN 6: Penanda error untuk uji tampilan (test rate limit, test error) =====
class RateLimited extends Error {}
class ServerFailure extends Error {}

interface SessionState {
  disclaimerShown: boolean;
  leadOffered: boolean;
}

/** The mock keeps state in memory only. This cap stops a long demo from growing it forever. */
const MAX_SESSIONS = 1000;

// ===== BAGIAN 7: Pembuat bot mock: pilih aturan, disclaimer dan kartu kontak sekali per sesi =====
export function createMockBot() {
  const sessions = new Map<string, SessionState>();

  function stateFor(sessionId: string): SessionState {
    let state = sessions.get(sessionId);
    if (!state) {
      if (sessions.size >= MAX_SESSIONS) {
        const oldest = sessions.keys().next().value;
        if (oldest !== undefined) sessions.delete(oldest);
      }
      state = { disclaimerShown: false, leadOffered: false };
      sessions.set(sessionId, state);
    }
    return state;
  }

  return {
    reply(sessionId: string, rawMessage: string): MockResult {
      const message = rawMessage.toLowerCase();

      let draft: Draft = FALLBACK;
      try {
        const rule = RULES.find((r) => r.matches(message));
        if (rule) draft = rule.draft();
      } catch (err) {
        if (err instanceof RateLimited) {
          return {
            status: 429,
            body: errorResponse("rate_limited", "You are sending messages too quickly. Please wait a moment and try again."),
          };
        }
        if (err instanceof ServerFailure) {
          return {
            status: 500,
            body: errorResponse("error", "Something went wrong on our side. Please try again in a moment."),
          };
        }
        throw err;
      }

      // The disclaimer appears once per session, the first time a medical topic comes up.
      const state = stateFor(sessionId);
      let showDisclaimer = false;
      if (draft.medical && !state.disclaimerShown) {
        showDisclaimer = true;
        state.disclaimerShown = true;
      }

      let offerLead = false;
      if (draft.offerLead && !state.leadOffered) {
        offerLead = true;
        state.leadOffered = true;
      }

      return {
        status: 200,
        body: buildResponse({
          kind: draft.kind,
          answer: draft.answer,
          sources: draft.sources ?? [],
          show_disclaimer: showDisclaimer,
          quote_url: draft.withQuote ? QUOTE_URL : null,
          ...(offerLead ? { offer_lead: true, lead_texts: MOCK_LEAD_TEXTS } : {}),
          follow_ups: FOLLOW_UPS[draft.topic ?? "general"].slice(0, MAX_FOLLOW_UPS),
        }),
      };
    },
  };
}
