/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/vite-env.d.ts
 * PURPOSE : Type declarations for the Vite environment variables.
 *           VITE_API_BASE (optional) is the address of the API server; when
 *           empty, the web app uses the same address through the proxy.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type of the Vite environment variables
 * ============================================================================ */

// ===== PART 1: Type of the Vite environment variables =====
/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Optional API origin. Leave unset to use the same origin through the dev proxy. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
