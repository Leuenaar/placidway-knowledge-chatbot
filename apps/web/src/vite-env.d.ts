/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/vite-env.d.ts
 * TUJUAN  : Deklarasi tipe untuk variabel lingkungan Vite. VITE_API_BASE
 *           (opsional) adalah alamat server API; bila kosong web memakai
 *           alamat yang sama lewat proxy.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe variabel lingkungan Vite
 * ============================================================================ */

// ===== BAGIAN 1: Tipe variabel lingkungan Vite =====
/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Optional API origin. Leave unset to use the same origin through the dev proxy. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
