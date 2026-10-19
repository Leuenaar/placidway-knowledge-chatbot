/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/main.tsx
 * PURPOSE : Starting point of the web app: mounts the React app on the #root
 *           element in index.html. Nothing else is here.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. Mount the app on the page
 * ============================================================================ */

// ===== PART 1: Imports =====
/** Mounts the React app. Nothing else belongs here. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// ===== PART 2: Mount the app on the page =====
const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found in index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
