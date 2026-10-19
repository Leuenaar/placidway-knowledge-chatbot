/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/components/Typing.tsx
 * TUJUAN  : Penanda 'sedang bekerja'. Tiga titik muncul langsung agar
 *           pengunjung tahu pesan diterima. Bila menunggu lama (6 detik),
 *           baris status menjelaskan, hanya berisi hal yang benar-benar
 *           terjadi (halaman sedang dicari).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Batas waktu sebelum baris status muncul
 *    3. Komponen: titik dan baris status
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah waktu tunggu: SLOW_AFTER_MS (BAGIAN 2)
 *    - Mengubah teks status: cari 'Checking the PlacidWay pages' (BAGIAN 3)
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/**
 * Shown while the assistant is working. The three dots appear at once, so the user sees that
 * the message was received. If the wait runs long, a plain status line explains it. The line
 * only says what really happens (the pages are being searched); it does not narrate reasoning.
 */
import { useEffect, useState } from "react";
import markUrl from "../assets/placidway-mark.png";

// ===== BAGIAN 2: Batas waktu sebelum baris status muncul =====
const SLOW_AFTER_MS = 6000;

// ===== BAGIAN 3: Komponen: titik dan baris status =====
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
