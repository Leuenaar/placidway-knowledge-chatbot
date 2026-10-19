/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/components/SourcesList.tsx
 * TUJUAN  : Menampilkan halaman asal sebuah jawaban sebagai kartu yang
 *           menyebut nama halaman (bukan sekadar 'Source') supaya pembaca
 *           tahu apa yang akan dibuka. Tiap kartu terbuka di tab baru.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Label jenis halaman dari awalan path URL
 *    3. Membuat keterangan 'host · jenis halaman'
 *    4. Komponen daftar sumber
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah label jenis halaman: BAGIAN 2
 *    - Mengubah judul 'Sources': cari 'sources-title' (BAGIAN 4)
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/**
 * Lists the pages an answer came from, as cards that name the page (not just "Source")
 * so the reader knows what they are about to open. Each card opens in a new tab.
 */
import type { Source } from "@pwbot/shared";
import { ExternalIcon } from "./Icons";

// ===== BAGIAN 2: Label jenis halaman dari awalan path URL =====
/** Plain-language label for the kind of page, taken from the first part of the URL path. */
const PAGE_KINDS: [prefix: string, label: string][] = [
  ["/profile-videos/", "Videos"],
  ["/profile/", "Clinic profile"],
  ["/package/", "Package page"],
  ["/price-list/", "Price list"],
  ["/search-medical-pricings/", "Price comparison"],
];

// ===== BAGIAN 3: Membuat keterangan 'host · jenis halaman' =====
function describe(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    const kind = PAGE_KINDS.find(([prefix]) => pathname.startsWith(prefix))?.[1];
    return kind ? `${host} · ${kind}` : host;
  } catch {
    return url;
  }
}

// ===== BAGIAN 4: Komponen daftar sumber =====
export function SourcesList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="sources">
      <p className="sources-title">Sources</p>
      <ul>
        {sources.map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              <span className="source-text">
                <span className="source-title">{source.title}</span>
                <span className="source-meta">{describe(source.url)}</span>
              </span>
              <ExternalIcon />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
