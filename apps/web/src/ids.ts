/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/ids.ts
 * PURPOSE : Session id builder. crypto.randomUUID only exists in a secure
 *           context (https or localhost); the fallback builds a UUID v4 itself
 *           so a demo over http does not fail.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Create a session id (UUID v4, with a fallback)
 * ============================================================================ */

// ===== PART 1: Create a session id (UUID v4, with a fallback) =====
/**
 * Id helpers.
 *
 * crypto.randomUUID only exists in secure contexts (https or localhost). A demo served
 * over plain http on an IP address would crash without the fallback below.
 */
export function createSessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
