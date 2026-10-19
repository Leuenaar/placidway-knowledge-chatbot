/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/components/Header.tsx
 * TUJUAN  : Bagian atas halaman: logo PlacidWay, label 'AI assistant', jalan
 *           permanen ke manusia (formulir penawaran gratis), dan 'New chat'
 *           setelah obrolan mulai. Saat backend mock, spanduk tipis di atas
 *           menyebut jawaban hanya contoh.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Komponen Header (logo, label AI, New chat, Free quote)
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah teks spanduk demo: cari 'Demo mode' (BAGIAN 2)
 *    - Mengubah tombol 'Free quote': cari 'Free quote' (BAGIAN 2)
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/**
 * Page header: the PlacidWay logo, a label that says this is an AI assistant, a permanent
 * way to reach a person (the free quote form) and, once a chat has started, "New chat".
 * While the backend is a mock, a slim banner above it says the answers are samples.
 */
import { QUOTE_URL } from "@pwbot/shared";
import logoUrl from "../assets/placidway-logo.png";
import { PlusIcon } from "./Icons";

// ===== BAGIAN 2: Komponen Header (logo, label AI, New chat, Free quote) =====
export function Header({
  mode,
  onNewChat,
  canReset,
}: {
  mode: "mock" | "live" | null;
  onNewChat: () => void;
  canReset: boolean;
}) {
  return (
    <header className="header">
      {mode === "mock" && (
        <p className="demo-banner">Demo mode: these answers are samples, not yet generated from the PlacidWay pages.</p>
      )}
      <div className="header-inner">
        <div className="brand">
          <img className="logo" src={logoUrl} alt="PlacidWay" width={64} height={32} />
          <span className="pill">
            AI<span className="pill-rest"> assistant</span>
          </span>
        </div>
        <div className="actions">
          {canReset && (
            <button type="button" className="ghost" onClick={onNewChat} aria-label="New chat">
              <PlusIcon />
              <span className="btn-label">New chat</span>
            </button>
          )}
          <a className="quote-link" href={QUOTE_URL} target="_blank" rel="noopener noreferrer">
            Free quote
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
      <h1 className="sr-only">PlacidWay AI Assistant</h1>
    </header>
  );
}
