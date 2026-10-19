/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/leads/service.ts
 * TUJUAN  : Aturan penerimaan lead setelah bentuk permintaan sudah valid:
 *           kolom jebakan 'website' terisi berarti bot (jawab ok, simpan
 *           nothing), sesi care mode tidak pernah meninggalkan lead, selain
 *           itu simpan dengan versi persetujuan dan bahasa chat.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Bentuk input dan kontrak layanan
 *    2. Layanan lead: honeypot, care mode, simpan
 * KALAU DIMINTA MENGUBAH:
 *    - Aturan siapa yang boleh menyimpan lead (BAGIAN 2)
 * ============================================================================ */

/**
 * The rules for accepting a lead. The HTTP layer validates the shape (see app.ts); this decides what happens to a valid request:
 *
 *  - a hidden "website" field that is filled in means a bot: answer "ok" and store nothing (a bot learns nothing from a refusal);
 *  - a session in care mode never leaves a lead (the lead card is never shown there, so this is a second wall);
 *  - otherwise the lead is stored with the version of the consent text and the chat language, nothing else.
 */
import { LEAD_CONSENT_VERSION, type LeadResponse } from "@pwbot/shared";
import { primaryCode } from "../i18n";
import type { LeadStore } from "./store";

// ===== BAGIAN 1: Bentuk input dan kontrak layanan =====
export interface LeadInput {
  sessionId: string;
  name: string;
  email: string;
  language?: string | undefined;
  website?: string | undefined;
}

export interface LeadService {
  submit(input: LeadInput): Promise<{ status: number; body: LeadResponse }>;
}

// ===== BAGIAN 2: Layanan lead: honeypot, care mode, simpan =====
export function createLeadService({
  store,
  isCare = () => false,
  languageOf = () => undefined,
}: {
  store: LeadStore;
  isCare?: (sessionId: string) => boolean;
  /** The language the server itself found for this chat; used when the browser did not send one (the browser never knows it). */
  languageOf?: (sessionId: string) => string | undefined;
}): LeadService {
  return {
    async submit({ sessionId, name, email, language, website }) {
      if (website && website.trim() !== "") return { status: 200, body: { ok: true } };
      if (isCare(sessionId)) return { status: 403, body: { ok: false } };
      const saved = await store.add({ name, email, language: (language ?? languageOf(sessionId)) ? primaryCode((language ?? languageOf(sessionId))!) : undefined, consentVersion: LEAD_CONSENT_VERSION });
      return saved ? { status: 200, body: { ok: true } } : { status: 502, body: { ok: false } };
    },
  };
}
