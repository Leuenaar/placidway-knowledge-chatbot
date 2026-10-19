/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/vite.config.ts
 * TUJUAN  : Konfigurasi Vite untuk web. Saat pengembangan dan preview,
 *           permintaan ke /api diteruskan ke server API (port 3001) sehingga
 *           browser melihat satu alamat saja dan tidak perlu pengaturan CORS.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Alamat server API untuk pengembangan
 *    3. Konfigurasi: plugin React dan proxy /api
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah port API saat pengembangan: ubah apiTarget (BAGIAN 2)
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/**
 * Vite config. In development and preview, requests to /api are forwarded to the API
 * server, so the browser sees one origin and no CORS setup is needed.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ===== BAGIAN 2: Alamat server API untuk pengembangan =====
const apiTarget = "http://localhost:3001";

// ===== BAGIAN 3: Konfigurasi: plugin React dan proxy /api =====
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": apiTarget } },
  preview: { proxy: { "/api": apiTarget } },
});
