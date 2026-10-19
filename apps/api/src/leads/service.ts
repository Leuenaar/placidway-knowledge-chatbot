/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/leads/service.ts
 * PURPOSE : Rules for accepting a lead once the request shape is valid: a
 *           filled 'website' trap field means a bot (answer ok, store
 *           nothing), a care mode session never leaves a lead, otherwise store
 *           it with the consent version and the chat language.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Shape of the input and the service contract
 *    2. Lead service: honeypot, care mode, store
 * IF ASKED TO CHANGE:
 *    - Rules for who may store a lead (PART 2)
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

// ===== PART 1: Shape of the input and the service contract =====
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

// ===== PART 2: Lead service: honeypot, care mode, store =====
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
