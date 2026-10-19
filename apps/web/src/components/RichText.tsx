/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/components/RichText.tsx
 * PURPOSE : Show the reply text. Only two things are understood: **bold** and
 *           the '- ' list bullet. No Markdown library, because the text comes
 *           from the model and must not be able to inject HTML, links or
 *           images. This renderer only builds React elements (no innerHTML);
 *           anything it does not recognise is shown as plain text.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. Split the text into paragraphs and lists
 *    3. Turn **bold** into <strong>
 *    4. Display component
 * IF ASKED TO CHANGE:
 *    - Allow a new format (for example italics): change inline (PART 3)
 *      carefully because of the security rules
 * ============================================================================ */

// ===== PART 1: Imports =====
/**
 * Renders reply text. Only two things are understood: **bold** and "- " list items.
 *
 * Why not a full Markdown library: the text comes from a model, so it must never be able to
 * inject HTML, links or images. This renderer builds React elements only (no innerHTML), and
 * anything it does not recognise is shown as plain text.
 */
import { Fragment, type ReactNode } from "react";

type Block = { kind: "paragraph"; lines: string[] } | { kind: "list"; items: string[] };

// ===== PART 2: Split the text into paragraphs and lists =====
/** Splits text into paragraphs and bullet lists. Blank lines separate blocks. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    let current: Block | null = null;
    for (const line of chunk.split("\n")) {
      const bullet = /^\s*-\s+(.*)$/.exec(line);
      if (bullet) {
        if (current?.kind !== "list") {
          current = { kind: "list", items: [] };
          blocks.push(current);
        }
        current.items.push(bullet[1] ?? "");
      } else if (line.trim() !== "") {
        if (current?.kind !== "paragraph") {
          current = { kind: "paragraph", lines: [] };
          blocks.push(current);
        }
        current.lines.push(line);
      }
    }
  }
  return blocks;
}

// ===== PART 3: Turn **bold** into <strong> =====
/** Turns **bold** into <strong>. An unmatched ** stays as literal text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

// ===== PART 4: Display component =====
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseBlocks(text).map((block, index) =>
        block.kind === "list" ? (
          // dir="auto" per block, so a right-to-left reply that quotes English still lays out correctly.
          <ul key={index} dir="auto">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={index} dir="auto">
            {block.lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </>
  );
}
