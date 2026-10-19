/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/components/LeadCard.tsx
 * PURPOSE : A small contact card that the bot offers only once, when the
 *           visitor asks for a personal quote or asks to be contacted. All
 *           text comes from the server (in the visitor's language). Nothing is
 *           sent before the consent box is ticked and the button is pressed.
 *           The name and email live only in component state, never in storage,
 *           and are cleared after sending. The hidden 'website' field is a bot
 *           trap. 'No thanks' closes the card and it is not asked again in
 *           this chat.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. Basic email check (the server checks again)
 *    3. Condition for the send button to be active
 *    4. LeadCard component and its props
 *    5. Form state (name, email, consent, trap, sending, failed)
 *    6. The card was declined or sent: show a short line or nothing at all
 *    7. Send the card to the server
 *    8. Form view: name, email, bot trap, consent, button
 * IF ASKED TO CHANGE:
 *    - Add an input field: PART 8 and LeadRequest in packages/shared
 *    - Change the email rules: PART 2
 * ============================================================================ */

// ===== PART 1: Imports =====
/**
 * The small contact card the bot offers once, when the visitor asks for a personal quote or to be contacted.
 *
 * - Every text comes from the server (in the visitor's language); nothing here is hard-coded English.
 * - Nothing is sent until the box is ticked and the button pressed. The name and email live only in this component's state,
 *   never in storage, and are cleared once sent.
 * - A hidden field ("website") is for bots: a person never sees or fills it.
 * - "No thanks" simply closes the card; it is not asked again in this chat.
 */
import { useId, useState } from "react";
import { MAX_LEAD_EMAIL_LENGTH, MAX_LEAD_NAME_LENGTH, type LeadTexts } from "@pwbot/shared";
import { submitLead } from "../api";
import type { LeadOutcome } from "../types";

// ===== PART 2: Basic email check (the server checks again) =====
/** A basic check before sending (the server checks again): something@something.tld, no spaces. */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= MAX_LEAD_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

// ===== PART 3: Condition for the send button to be active =====
export function canSubmit(name: string, email: string, consent: boolean): boolean {
  return consent && name.trim().length > 0 && name.trim().length <= MAX_LEAD_NAME_LENGTH && looksLikeEmail(email);
}

// ===== PART 4: LeadCard component and its props =====
export function LeadCard({
  texts,
  sessionId,
  language,
  outcome,
  onOutcome,
}: {
  texts: LeadTexts;
  sessionId: string;
  /** The language code the server wrote the card in, if known. Sent along so the team can answer in it. */
  language?: string;
  /** Set once the card was sent or declined; then only a short line (or nothing) is shown. */
  outcome: LeadOutcome | undefined;
  onOutcome: (outcome: LeadOutcome) => void;
}) {

  // ===== PART 5: Form state (name, email, consent, trap, sending, failed) =====
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [trap, setTrap] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  // ===== PART 6: The card was declined or sent: show a short line or nothing at all =====
  if (outcome === "declined") return null;
  if (outcome === "done") {
    return (
      <p className="note lead-thanks" role="status" dir="auto">
        {texts.thanks}
      </p>
    );
  }

  // ===== PART 7: Send the card to the server =====
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (sending || !canSubmit(name, email, consent)) return;
    setSending(true);
    setFailed(false);
    const ok = await submitLead({ session_id: sessionId, name: name.trim(), email: email.trim(), ...(language ? { language } : {}), ...(trap ? { website: trap } : {}) });
    setSending(false);
    if (ok) {
      setName("");
      setEmail("");
      onOutcome("done");
    } else {
      setFailed(true);
    }
  }

  // ===== PART 8: Form view: name, email, bot trap, consent, button =====
  return (
    <form className="lead" onSubmit={(e) => void send(e)} aria-labelledby={`${id}-title`} noValidate>
      <p className="lead-title" id={`${id}-title`} dir="auto">
        {texts.title}
      </p>

      <label className="lead-field" htmlFor={`${id}-name`}>
        <span dir="auto">{texts.name}</span>
        <input id={`${id}-name`} type="text" name="name" autoComplete="name" maxLength={MAX_LEAD_NAME_LENGTH} value={name} onChange={(e) => setName(e.target.value)} dir="auto" required />
      </label>

      <label className="lead-field" htmlFor={`${id}-email`}>
        <span dir="auto">{texts.email}</span>
        <input id={`${id}-email`} type="email" name="email" autoComplete="email" inputMode="email" maxLength={MAX_LEAD_EMAIL_LENGTH} value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" required />
      </label>

      {/* Bait for bots: off-screen, skipped by keyboard and screen readers, and a person never fills it. */}
      <div className="lead-trap" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </label>
      </div>

      <label className="lead-consent" htmlFor={`${id}-consent`}>
        <input id={`${id}-consent`} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span dir="auto">{texts.consent}</span>
      </label>

      {failed && (
        <p className="lead-failed" role="alert" dir="auto">
          {texts.failed}
        </p>
      )}

      <div className="lead-actions">
        <button type="submit" className="cta lead-submit" disabled={sending || !canSubmit(name, email, consent)}>
          {texts.submit}
        </button>
        <button type="button" className="lead-decline" disabled={sending} onClick={() => onOutcome("declined")}>
          {texts.decline}
        </button>
      </div>
    </form>
  );
}
