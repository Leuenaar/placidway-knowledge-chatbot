/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/components/Typing.tsx
 * PURPOSE : The 'working' indicator. Three dots appear at once so the visitor
 *           knows the message was received. If the wait is long (6 seconds), a
 *           status line explains, containing only what is really happening
 *           (the pages are being searched).
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. Time to wait before the status line appears
 *    3. Component: dots and status line
 * IF ASKED TO CHANGE:
 *    - Change the wait time: SLOW_AFTER_MS (PART 2)
 *    - Change the status text: search for 'Checking the PlacidWay pages' (PART
 *      3)
 * ============================================================================ */

// ===== PART 1: Imports =====
/**
 * Shown while the assistant is working. The three dots appear at once, so the user sees that
 * the message was received. If the wait runs long, a plain status line explains it. The line
 * only says what really happens (the pages are being searched); it does not narrate reasoning.
 */
import { useEffect, useState } from "react";
import markUrl from "../assets/placidway-mark.png";

// ===== PART 2: Time to wait before the status line appears =====
const SLOW_AFTER_MS = 6000;

// ===== PART 3: Component: dots and status line =====
export function Typing() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="row row-assistant">
      <img className="avatar" src={markUrl} alt="" width={32} height={32} />
      <div className="col">
        <div className="bubble bubble-assistant typing" role="status" aria-label="The assistant is typing">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
          {slow && <span className="typing-text">Checking the PlacidWay pages…</span>}
        </div>
      </div>
    </div>
  );
}
