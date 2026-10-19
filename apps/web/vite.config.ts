/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/vite.config.ts
 * PURPOSE : Vite configuration for the web app. In development and preview,
 *           requests to /api are forwarded to the API server (port 3001), so
 *           the browser sees a single address and needs no CORS settings.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. API server address for development
 *    3. Configuration: React plugin and the /api proxy
 * IF ASKED TO CHANGE:
 *    - Change the API port in development: change apiTarget (PART 2)
 * ============================================================================ */

// ===== PART 1: Imports =====
/**
 * Vite config. In development and preview, requests to /api are forwarded to the API
 * server, so the browser sees one origin and no CORS setup is needed.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ===== PART 2: API server address for development =====
const apiTarget = "http://localhost:3001";

// ===== PART 3: Configuration: React plugin and the /api proxy =====
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": apiTarget } },
  preview: { proxy: { "/api": apiTarget } },
});
