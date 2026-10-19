/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/main.tsx
 * TUJUAN  : Titik awal web: memasang aplikasi React ke elemen #root di
 *           index.html. Tidak ada hal lain di sini.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Memasang aplikasi ke halaman
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/** Mounts the React app. Nothing else belongs here. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// ===== BAGIAN 2: Memasang aplikasi ke halaman =====
const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found in index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
