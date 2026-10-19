/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/components/Icons.tsx
 * PURPOSE : Small SVG icons for decoration. The buttons and links that use
 *           them carry their own text.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Basic SVG wrapper
 *    2. Plus icon (New chat)
 *    3. Send icon
 *    4. External link icon
 * ============================================================================ */

/** Small inline icons. They are decorative: the buttons and links that use them carry the text. */
import type { SVGProps } from "react";

// ===== PART 1: Basic SVG wrapper =====
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

// ===== PART 2: Plus icon (New chat) =====
export function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

// ===== PART 3: Send icon =====
export function SendIcon() {
  return (
    <Icon>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

// ===== PART 4: External link icon =====
export function ExternalIcon() {
  return (
    <Icon width="16" height="16">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Icon>
  );
}
