/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/api.ts
 * PURPOSE : API client for the web app: send a message (/api/chat), check the
 *           server mode (/api/health), send the contact card (/api/lead).
 *           These functions never throw: a network failure becomes an ordinary
 *           'error' reply, so the screen has only one path.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. Base API address (empty = same address through the proxy)
 *    3. Reply when the server cannot be reached
 *    4. Send one question to /api/chat (with the history from the browser)
 *    5. Check /api/health (mock or live)
 *    6. Send the contact card to /api/lead
 * IF ASKED TO CHANGE:
 *    - Change the connection error text: search for 'I couldn't reach the
 *      server' (PART 3)
 *    - Change the API address in production: VITE_API_BASE (PART 2)
 * ============================================================================ */

// ===== PART 1: Imports =====
/**
 * Client for the API. These functions never throw: a network failure becomes a normal
 * "error" reply, so the UI has a single path for success and failure.
 */
import {
  isChatResponse,
  type ChatRequest,
  type ChatResponse,
  type HealthResponse,
  type HistoryEntry,
  type LeadRequest,
  type LeadResponse,
} from "@pwbot/shared";

// ===== PART 2: Base API address (empty = same address through the proxy) =====
/** Empty by default (same origin, via the dev proxy). Set VITE_API_BASE to call another host. */
const API_BASE: string = import.meta.env?.VITE_API_BASE ?? "";

// ===== PART 3: Reply when the server cannot be reached =====
const CONNECTION_ERROR: ChatResponse = {
  answer: "I couldn't reach the server. Please check your connection and try again.",
  kind: "error",
  sources: [],
  show_disclaimer: false,
  quote_url: null,
  offer_lead: false,
  follow_ups: [],
};

// ===== PART 4: Send one question to /api/chat (with the history from the browser) =====
/** `history` is the chat the browser remembers; the server uses it only if it has forgotten the session. */
export async function sendMessage(sessionId: string, message: string, history: HistoryEntry[] = []): Promise<ChatResponse> {
  const payload: ChatRequest = { session_id: sessionId, message, ...(history.length > 0 ? { history } : {}) };
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    // The API returns the same JSON shape for errors (400, 429, 500), so parse every status.
    const body: unknown = await res.json().catch(() => null);
    if (isChatResponse(body)) return body;
  } catch {
    // Falls through to the generic error below.
  }
  return CONNECTION_ERROR;
}

// ===== PART 5: Check /api/health (mock or live) =====
/** Returns null when the API is unreachable. The UI then simply hides the mode badge. */
export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

// ===== PART 6: Send the contact card to /api/lead =====
/** Sends the contact card. true only when the server stored it; any failure (network, limit, validation) is false. */
export async function submitLead(request: Omit<LeadRequest, "consent">): Promise<boolean> {
  const payload: LeadRequest = { ...request, consent: true };
  try {
    const res = await fetch(`${API_BASE}/api/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => null)) as Partial<LeadResponse> | null;
    return res.ok && body?.ok === true;
  } catch {
    return false;
  }
}
