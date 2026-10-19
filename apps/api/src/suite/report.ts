/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/suite/report.ts
 * PURPOSE : Turn the suite results into a terminal summary and a markdown
 *           report. Pure functions, so they are easy to test.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type: time and tokens of one case
 *    2. Type: result of one case
 *    3. Type: summary per effort level
 *    4. Helper for the median and the average
 *    5. Build the result of one case (an error automatically becomes FAIL)
 *    6. Count PASS, CHECK, FAIL, time and tokens per effort level
 *    7. Helper for formatting seconds and thousands
 *    8. One result line in the terminal
 *    9. Summary table in the terminal
 *    10. Type: extra data in the report header
 *    11. Full markdown report
 *    12. Stability section (when run more than once)
 *    13. Case section: question, answer, sources, checks
 * IF ASKED TO CHANGE:
 *    - Change the content of the markdown report: edit markdownReport (PART
 *      11)
 *    - Change the table columns in the terminal (PART 9)
 * ============================================================================ */

/** Turns suite results into the terminal summary and the markdown report. Pure functions, so they are easy to test. */
import type { Case } from "./cases";
import { caseVerdict, type CheckResult, type Observed, type Verdict } from "./checks";

// ===== PART 1: Type: time and tokens of one case =====
export interface Timing {
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

// ===== PART 2: Type: result of one case =====
export interface CaseRun {
  effort: string;
  run: number;
  case: Case;
  observed?: Observed;
  /** Set when the bot threw or returned an error status. */
  error?: string;
  checks: CheckResult[];
  verdict: Verdict;
  timing: Timing;
}

// ===== PART 3: Type: summary per effort level =====
export interface Summary {
  effort: string;
  runs: number;
  pass: number;
  check: number;
  fail: number;
  medianMs: number;
  maxMs: number;
  avgInput: number;
  avgOutput: number;
  avgThinking: number;
}

// ===== PART 4: Helper for the median and the average =====
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ===== PART 5: Build the result of one case (an error automatically becomes FAIL) =====
export function makeRun(c: Case, effort: string, run: number, timing: Timing, observed?: Observed, error?: string, checks: CheckResult[] = []): CaseRun {
  const failedRun: CheckResult[] = error ? [{ name: "ran without error", verdict: "FAIL", detail: error }] : checks;
  return { effort, run, case: c, ...(observed ? { observed } : {}), ...(error ? { error } : {}), checks: failedRun, verdict: caseVerdict(failedRun), timing };
}

// ===== PART 6: Count PASS, CHECK, FAIL, time and tokens per effort level =====
/** Baseline cases (a rule that does not exist yet) are listed but never counted in the totals. */
export function summarize(runs: CaseRun[]): Summary[] {
  const efforts = [...new Set(runs.map((r) => r.effort))];
  return efforts.map((effort) => {
    const mine = runs.filter((r) => r.effort === effort);
    const counted = mine.filter((r) => r.case.group !== "baseline");
    return {
      effort,
      runs: counted.length,
      pass: counted.filter((r) => r.verdict === "PASS").length,
      check: counted.filter((r) => r.verdict === "CHECK").length,
      fail: counted.filter((r) => r.verdict === "FAIL").length,
      medianMs: median(counted.map((r) => r.timing.totalMs)),
      maxMs: Math.max(0, ...counted.map((r) => r.timing.totalMs)),
      avgInput: avg(counted.map((r) => r.timing.inputTokens)),
      avgOutput: avg(counted.map((r) => r.timing.outputTokens)),
      avgThinking: avg(counted.map((r) => r.timing.thinkingTokens)),
    };
  });
}

// ===== PART 7: Helper for formatting seconds and thousands =====
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

// ===== PART 8: One result line in the terminal =====
export function lineFor(r: CaseRun, index: number, total: number): string {
  const kind = r.observed?.kind ?? "-";
  const flagged = r.checks.filter((c) => c.verdict !== "PASS").map((c) => c.name).slice(0, 3).join("; ");
  return `[${String(index).padStart(2)}/${total}] ${r.verdict.padEnd(5)} ${r.effort.padEnd(6)} ${r.case.id.padEnd(24)} ${kind.padEnd(14)} ${sec(r.timing.totalMs).padStart(6)} ${k(r.timing.inputTokens).padStart(6)} in ${k(r.timing.outputTokens).padStart(5)} out${flagged ? `   <- ${flagged}` : ""}`;
}

// ===== PART 9: Summary table in the terminal =====
export function summaryTable(rows: Summary[]): string {
  const head = "effort   cases  PASS  CHECK  FAIL   median    max   avg in   avg out  avg thinking";
  const lines = rows.map((s) => `${s.effort.padEnd(8)} ${String(s.runs).padStart(5)} ${String(s.pass).padStart(5)} ${String(s.check).padStart(6)} ${String(s.fail).padStart(5)} ${sec(s.medianMs).padStart(8)} ${sec(s.maxMs).padStart(6)} ${k(s.avgInput).padStart(8)} ${k(s.avgOutput).padStart(9)} ${k(s.avgThinking).padStart(13)}`);
  return [head, ...lines].join("\n");
}

// ===== PART 10: Type: extra data in the report header =====
export interface ReportMeta {
  when: string;
  model: string;
  retrieveCount: number;
  expandPages: number;
  efforts: string[];
  runsPerCase: number;
  promptVersion: string;
}

// ===== PART 11: Full markdown report =====
export function markdownReport(meta: ReportMeta, runs: CaseRun[]): string {
  const out: string[] = [];
  out.push("# Suite report", "");
  out.push(`- When: ${meta.when}`, `- Model: ${meta.model}`, `- Prompt: ${meta.promptVersion}`, `- Chunks from the search: ${meta.retrieveCount}, full pages added: ${meta.expandPages}`, `- Efforts: ${meta.efforts.join(", ")}; runs per case: ${meta.runsPerCase}`, "");
  out.push("## Summary", "", "```", summaryTable(summarize(runs)), "```", "");
  out.push("PASS = every automatic check held. CHECK = a soft check or heuristic flagged something to read. FAIL = a hard check failed. Baseline cases (a rule not built yet) are shown but not counted. The automatic checks do not judge tone: read the answers.", "");

  // ===== PART 12: Stability section (when run more than once) =====
  // Stability across runs of the same case and effort.
  if (meta.runsPerCase > 1) {
    out.push("## Stability (same case, several runs)", "");
    const keys = [...new Set(runs.map((r) => `${r.effort}|${r.case.id}`))];
    const rows = keys.map((key) => {
      const group = runs.filter((r) => `${r.effort}|${r.case.id}` === key);
      const tally = (["PASS", "CHECK", "FAIL"] as const).map((v) => `${group.filter((g) => g.verdict === v).length} ${v}`).join(", ");
      return { key, tally, unstable: new Set(group.map((g) => g.verdict)).size > 1 };
    });
    for (const r of rows.filter((x) => x.unstable)) out.push(`- ${r.key.replace("|", " / ")}: ${r.tally}`);
    if (!rows.some((x) => x.unstable)) out.push("All cases gave the same verdict on every run.");
    out.push("");
  }

  // ===== PART 13: Case section: question, answer, sources, checks =====
  out.push("## Cases", "");
  for (const r of runs) {
    const o = r.observed;
    out.push(`### ${r.case.id}  [${r.verdict}]  effort ${r.effort}, run ${r.run}${r.case.group === "baseline" ? "  (baseline, not counted)" : ""}`, "");
    r.case.turns.forEach((t, i) => out.push(`- Visitor${r.case.turns.length > 1 ? ` (message ${i + 1})` : ""}: ${t}`));
    out.push(`- Read for: ${r.case.review}`);
    if (r.error) out.push(`- ERROR: ${r.error}`);
    if (o) {
      out.push(`- Kind: ${o.kind}${o.rewriteLanguage ? `; rewrite language: ${o.rewriteLanguage}${o.rewriteFallback ? " (fallback)" : ""}` : ""}${o.rewriteCategory ? `; rewrite category: ${o.rewriteCategory}` : ""}; disclaimer shown: ${o.showDisclaimer}`);
      out.push("", "> " + o.answer.replace(/\n/g, "\n> "), "");
      out.push(`- Sources: ${o.sources.map((s) => s.title).join(" | ") || "(none)"}`);
      out.push(`- Chunks cited: ${o.citedIds.join(", ") || "(none)"}; chunks sent: ${o.sentChunks.length}`);
      if (o.followUps.length) out.push(`- Follow-up suggestions: ${o.followUps.join(" | ")}`);
    }
    out.push(`- Time ${sec(r.timing.totalMs)}; tokens ${r.timing.inputTokens} in, ${r.timing.outputTokens} out (${r.timing.thinkingTokens} reasoning)`);
    const flagged = r.checks.filter((c) => c.verdict !== "PASS");
    if (flagged.length) {
      out.push("- Flags:");
      for (const c of flagged) out.push(`  - ${c.verdict}: ${c.name} (${c.detail})`);
    } else out.push("- Flags: none");
    out.push("");
  }
  return out.join("\n");
}
