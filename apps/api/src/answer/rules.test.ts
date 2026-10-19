/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/answer/rules.test.ts
 * PURPOSE : Test of the model rules files (apps/api/rules/*.md): all files
 *           exist, the order is correct, and the error is clear when one is
 *           missing.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. rule files
 * IF ASKED TO CHANGE:
 *    - Add a new test: copy one of the describe/test blocks in this file and
 *      change its content (PART 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AnswerError } from "./config";
import { RULE_GROUPS, loadRules } from "./rules";

// ===== PART 1: rule files =====
describe("rule files", () => {
  it("loads the five real files, trimmed and non-empty", () => {
    const rules = loadRules();
    assert.deepEqual(Object.keys(rules), RULE_GROUPS.map((g) => g.key));
    for (const g of RULE_GROUPS) {
      assert.ok(rules[g.key].length > 100, g.key);
      assert.equal(rules[g.key], rules[g.key].trim());
    }
  });

  it("stops with a clear message when a file is missing, empty or too long", () => {
    const okRead = () => "some rule text";
    assert.doesNotThrow(() => loadRules("/x", okRead));
    assert.throws(() => loadRules("/x", (p) => { if (p.endsWith("3-grounding.md")) throw new Error("ENOENT"); return "text"; }), (e: Error) => e instanceof AnswerError && e.message.includes("3-grounding.md") && e.message.includes("could not be read"));
    assert.throws(() => loadRules("/x", (p) => (p.endsWith("2-scope.md") ? "   \n " : "text")), (e: Error) => e instanceof AnswerError && e.message.includes("2-scope.md") && e.message.includes("empty"));
    assert.throws(() => loadRules("/x", (p) => (p.endsWith("5-claims.md") ? "x".repeat(6001) : "text")), (e: Error) => e instanceof AnswerError && e.message.includes("5-claims.md") && e.message.includes("too long"));
  });
});
