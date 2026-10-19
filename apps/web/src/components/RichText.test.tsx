/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/components/RichText.test.tsx
 * PURPOSE : Test of the reply renderer: text from the model must not become
 *           HTML; only bold and bullet lists are understood.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. parseBlocks
 *    2. RichText
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

/**
 * Tests for the reply renderer. The text comes from a model, so the main thing to prove is
 * that it can never become HTML: only bold and bullet lists are understood.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText, parseBlocks } from "./RichText";

const render = (text: string) => renderToStaticMarkup(createElement(RichText, { text }));

// ===== PART 1: parseBlocks =====
describe("parseBlocks", () => {
  it("splits paragraphs on blank lines", () => {
    assert.deepEqual(parseBlocks("one\n\ntwo"), [
      { kind: "paragraph", lines: ["one"] },
      { kind: "paragraph", lines: ["two"] },
    ]);
  });

  it("reads a run of '- ' lines as one list", () => {
    assert.deepEqual(parseBlocks("- a\n- b\n- c"), [{ kind: "list", items: ["a", "b", "c"] }]);
  });

  it("handles an intro line directly followed by a list", () => {
    assert.deepEqual(parseBlocks("Includes:\n- a\n- b"), [
      { kind: "paragraph", lines: ["Includes:"] },
      { kind: "list", items: ["a", "b"] },
    ]);
  });

  it("keeps a hyphen inside a sentence as text, not a list", () => {
    assert.deepEqual(parseBlocks("Out-Patient - 3 weeks"), [{ kind: "paragraph", lines: ["Out-Patient - 3 weeks"] }]);
  });

  it("returns nothing for empty text", () => {
    assert.deepEqual(parseBlocks("  \n\n "), []);
  });
});

// ===== PART 2: RichText =====
describe("RichText", () => {
  it("renders **bold** as <strong>", () => {
    assert.match(render("Price **$18,995** (USD)"), /<strong>\$18,995<\/strong>/);
  });

  it("leaves an unmatched ** as literal text", () => {
    const html = render("a ** b");
    assert.ok(!html.includes("<strong>"));
    assert.ok(html.includes("a ** b"));
  });

  it("renders a list as <ul><li>", () => {
    assert.match(render("- one\n- two"), /<ul[^>]*><li>one<\/li><li>two<\/li><\/ul>/);
  });

  it("never turns text into HTML", () => {
    const html = render('<script>alert(1)</script> <img src=x onerror=alert(1)> [link](http://evil.example)');
    assert.ok(!html.includes("<script"), html);
    assert.ok(!html.includes("<img"), html);
    assert.ok(!html.includes("<a "), html);
    assert.ok(html.includes("&lt;script&gt;"), html);
  });

  it("marks every block with dir=auto so right-to-left text lays out correctly", () => {
    const html = render("مرحبا\n\n- نعم");
    assert.equal((html.match(/dir="auto"/g) ?? []).length, 2);
  });
});
