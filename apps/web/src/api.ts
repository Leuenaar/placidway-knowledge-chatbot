/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/api.ts
 * TUJUAN  : Klien API untuk web: kirim pesan (/api/chat), cek mode server
 *           (/api/health), kirim kartu kontak (/api/lead). Fungsi-fungsi ini
 *           tidak pernah melempar error: kegagalan jaringan menjadi balasan
 *           'error' biasa sehingga tampilan hanya punya satu jalur.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Alamat dasar API (kosong = alamat yang sama lewat proxy)
 *    3. Balasan bila server tidak terjangkau
 *    4. Kirim satu pertanyaan ke /api/chat (beserta riwayat dari browser)
 *    5. Cek /api/health (mock atau live)
 *    6. Kirim kartu kontak ke /api/lead
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah teks error koneksi: cari 'I couldn't reach the server'
 *      (BAGIAN 3)
 *    - Mengubah alamat API saat produksi: VITE_API_BASE (BAGIAN 2)
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
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

// ===== BAGIAN 2: Alamat dasar API (kosong = alamat yang sama lewat proxy) =====
/** Empty by default (same origin, via the dev proxy). Set VITE_API_BASE to call another host. */
const API_BASE: string = import.meta.env?.VITE_API_BASE ?? "";

// ===== BAGIAN 3: Balasan bila server tidak terjangkau =====
const CONNECTION_ERROR: ChatResponse = {
  answer: "I couldn't reach the server. Please check your connection and try again.",
  kind: "error",
  sources: [],
  show_disclaimer: false,
  quote_url: null,
  offer_lead: false,
  follow_ups: [],
};

// ===== BAGIAN 4: Kirim satu pertanyaan ke /api/chat (beserta riwayat dari browser) =====
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

// ===== BAGIAN 5: Cek /api/health (mock atau live) =====
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

// ===== BAGIAN 6: Kirim kartu kontak ke /api/lead =====
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
