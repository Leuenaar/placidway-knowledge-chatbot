/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/components/Icons.tsx
 * TUJUAN  : Ikon SVG kecil untuk hiasan. Tombol dan tautan yang memakainya
 *           membawa teksnya sendiri.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Pembungkus SVG dasar
 *    2. Ikon plus (New chat)
 *    3. Ikon kirim
 *    4. Ikon tautan keluar
 * ============================================================================ */

/** Small inline icons. They are decorative: the buttons and links that use them carry the text. */
import type { SVGProps } from "react";

// ===== BAGIAN 1: Pembungkus SVG dasar =====
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

// ===== BAGIAN 2: Ikon plus (New chat) =====
export function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

// ===== BAGIAN 3: Ikon kirim =====
export function SendIcon() {
  return (
    <Icon>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

// ===== BAGIAN 4: Ikon tautan keluar =====
export function ExternalIcon() {
  return (
    <Icon width="16" height="16">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Icon>
  );
}
