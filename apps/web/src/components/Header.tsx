/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/components/Header.tsx
 * PURPOSE : Top of the page: PlacidWay logo, the 'AI assistant' label, the
 *           permanent path to a human (free quote form), and 'New chat' once a
 *           conversation has started. With the mock backend, a thin banner at
 *           the top says the answers are only examples.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. Header component (logo, AI label, New chat, Free quote)
 * IF ASKED TO CHANGE:
 *    - Change the demo banner text: search for 'Demo mode' (PART 2)
 *    - Change the 'Free quote' button: search for 'Free quote' (PART 2)
 * ============================================================================ */

// ===== PART 1: Imports =====
/**
 * Page header: the PlacidWay logo, a label that says this is an AI assistant, a permanent
 * way to reach a person (the free quote form) and, once a chat has started, "New chat".
 * While the backend is a mock, a slim banner above it says the answers are samples.
 */
import { QUOTE_URL } from "@pwbot/shared";
import logoUrl from "../assets/placidway-logo.png";
import { PlusIcon } from "./Icons";

// ===== PART 2: Header component (logo, AI label, New chat, Free quote) =====
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
