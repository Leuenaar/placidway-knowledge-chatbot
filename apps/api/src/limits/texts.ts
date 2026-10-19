/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/limits/texts.ts
 * TUJUAN  : Teks yang dilihat pengunjung saat batas tercapai, ditulis tangan
 *           dalam lima bahasa dan tidak pernah lewat model (karena teks ini
 *           tampil tepat saat server tidak boleh membelanjakan apa pun).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe kunci teks batas
 *    2. Teks batas per bahasa (en, id, tr, es, ar)
 *    3. Tabel dan pemetaan alasan ke teks
 * KALAU DIMINTA MENGUBAH:
 *    - Kalimat saat batas tercapai (BAGIAN 2)
 * ============================================================================ */

/**
 * What a visitor sees when a limit is reached. These are written by hand in the five supported languages and never go through the model,
 * because a limit message is shown exactly when the server must not spend anything. Any other language gets the language it can be guessed in
 * (see guess.ts) or English. Review status: en and id were not separately reviewed by the owner; tr, es and ar are not reviewed by a native speaker.
 */
import type { LimitReason } from "./limiter";

// ===== BAGIAN 1: Tipe kunci teks batas =====
export type LimitTextKey = "rate_limited" | "busy" | "budget";
export type LimitTexts = Record<LimitTextKey, string>;

// ===== BAGIAN 2: Teks batas per bahasa (en, id, tr, es, ar) =====
const EN: LimitTexts = {
  rate_limited: "You are sending messages quickly. Please wait a few minutes and try again.",
  busy: "The assistant is busy right now. Please try again in a moment.",
  budget: "The usage limit for today has been reached. Please try again tomorrow. PlacidWay can answer questions directly if you request a free quote.",
};
const ID: LimitTexts = {
  rate_limited: "Pesan Anda terlalu cepat berurutan. Mohon tunggu beberapa menit lalu coba lagi.",
  busy: "Asisten sedang sibuk. Mohon coba lagi sebentar lagi.",
  budget: "Batas pemakaian hari ini sudah tercapai. Silakan coba lagi besok. PlacidWay bisa menjawab pertanyaan Anda langsung jika Anda meminta penawaran gratis.",
};
const TR: LimitTexts = {
  rate_limited: "Çok hızlı mesaj gönderiyorsunuz. Lütfen birkaç dakika bekleyip tekrar deneyin.",
  busy: "Asistan şu anda meşgul. Lütfen biraz sonra tekrar deneyin.",
  budget: "Bugünkü kullanım sınırına ulaşıldı. Lütfen yarın tekrar deneyin. Ücretsiz teklif talep ederseniz PlacidWay sorularınızı doğrudan yanıtlayabilir.",
};
const ES: LimitTexts = {
  rate_limited: "Está enviando mensajes demasiado rápido. Espere unos minutos e inténtelo de nuevo.",
  busy: "El asistente está ocupado en este momento. Inténtelo de nuevo en un momento.",
  budget: "Se alcanzó el límite de uso de hoy. Inténtelo de nuevo mañana. PlacidWay puede responder sus preguntas directamente si solicita una cotización gratuita.",
};
const AR: LimitTexts = {
  rate_limited: "أنت ترسل الرسائل بسرعة كبيرة. يرجى الانتظار بضع دقائق ثم المحاولة مرة أخرى.",
  busy: "المساعد مشغول حاليًا. يرجى المحاولة مرة أخرى بعد قليل.",
  budget: "تم الوصول إلى حد الاستخدام لهذا اليوم. يرجى المحاولة مرة أخرى غدًا. يمكن لـ PlacidWay الإجابة عن أسئلتك مباشرة إذا طلبت عرض سعر مجانيًا.",
};

// ===== BAGIAN 3: Tabel dan pemetaan alasan ke teks =====
export const LIMIT_TEXTS: Readonly<Record<string, LimitTexts>> = { en: EN, id: ID, tr: TR, es: ES, ar: AR };

/** burst -> rate_limited, busy -> busy, budget and daily -> budget (both say "the limit for today"). */
export function textKeyFor(reason: LimitReason): LimitTextKey {
  return reason === "burst" ? "rate_limited" : reason === "busy" ? "busy" : "budget";
}

export function limitText(code: string, reason: LimitReason): string {
  return (LIMIT_TEXTS[code] ?? EN)[textKeyFor(reason)];
}
