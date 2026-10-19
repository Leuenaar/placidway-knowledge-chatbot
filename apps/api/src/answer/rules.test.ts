/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/answer/rules.test.ts
 * TUJUAN  : Uji berkas aturan model (apps/api/rules/*.md): semua berkas ada,
 *           urutan benar, dan error jelas bila hilang.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. rule files
 * KALAU DIMINTA MENGUBAH:
 *    - Menambah uji baru: salin salah satu blok describe/test di file ini
 *      lalu ubah isinya (BAGIAN 1)
 * ============================================================================ */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AnswerError } from "./config";
import { RULE_GROUPS, loadRules } from "./rules";

// ===== BAGIAN 1: rule files =====
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
