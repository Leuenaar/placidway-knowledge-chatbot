/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/components/SourcesList.tsx
 * PURPOSE : Show the page an answer came from as a card that names the page
 *           (not just 'Source') so the reader knows what will open. Each card
 *           opens in a new tab.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. Page kind label from the start of the URL path
 *    3. Build the 'host · page kind' description
 *    4. Sources list component
 * IF ASKED TO CHANGE:
 *    - Change the page kind labels: PART 2
 *    - Change the 'Sources' heading: search for 'sources-title' (PART 4)
 * ============================================================================ */

// ===== PART 1: Imports =====
/**
 * Lists the pages an answer came from, as cards that name the page (not just "Source")
 * so the reader knows what they are about to open. Each card opens in a new tab.
 */
import type { Source } from "@pwbot/shared";
import { ExternalIcon } from "./Icons";

// ===== PART 2: Page kind label from the start of the URL path =====
/** Plain-language label for the kind of page, taken from the first part of the URL path. */
const PAGE_KINDS: [prefix: string, label: string][] = [
  ["/profile-videos/", "Videos"],
  ["/profile/", "Clinic profile"],
  ["/package/", "Package page"],
  ["/price-list/", "Price list"],
  ["/search-medical-pricings/", "Price comparison"],
];

// ===== PART 3: Build the 'host · page kind' description =====
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

// ===== PART 4: Sources list component =====
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
