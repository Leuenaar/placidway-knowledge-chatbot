/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/suite/run.ts
 * PURPOSE : Run the cases one by one through a bot and collect everything the
 *           checks and the report need.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Type: options for running the suite
 *    2. Main function: loop over effort level, round, case
 *    3. Send each case message to the bot (earlier messages become history)
 *    4. Collect the result of the last message, then run the checks
 *    5. Save the result and report to the terminal
 *    6. Re-export of the line printing helper
 * IF ASKED TO CHANGE:
 *    - Change the data recorded for each case: edit the observed object (PART
 *      4)
 * ============================================================================ */

/** Runs the cases through a bot, one at a time, and collects what the checks and the report need. */
import { CASES, type Case } from "./cases";
import { runChecks, type Observed } from "./checks";
import type { Harness } from "./harness";
import { lineFor, makeRun, type CaseRun } from "./report";

// ===== PART 1: Type: options for running the suite =====
export interface RunOptions {
  /** Builds the bot for one effort level (a separate answer client per level). */
  makeHarness: (effort: string) => Harness;
  efforts: string[];
  runs: number;
  cases?: readonly Case[];
  onResult?: (run: CaseRun, index: number, total: number) => void;
  now?: () => number;
}

// ===== PART 2: Main function: loop over effort level, round, case =====
export async function runSuite({ makeHarness, efforts, runs, cases = CASES, onResult = () => {}, now = Date.now }: RunOptions): Promise<CaseRun[]> {
  const results: CaseRun[] = [];
  const total = efforts.length * runs * cases.length;
  let index = 0;
  for (const effort of efforts) {
    const harness = makeHarness(effort);
    for (let run = 1; run <= runs; run++) {
      for (const c of cases) {
        index++;
        const session = `suite-${effort}-${run}-${c.id}`;
        let timing = { totalMs: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
        let result: CaseRun;
        try {
          let last: Awaited<ReturnType<Harness["bot"]["reply"]>> | undefined;

          // ===== PART 3: Send each case message to the bot (earlier messages become history) =====
          for (const turn of c.turns) {
            harness.take();
            const t0 = now();
            last = await harness.bot.reply(session, turn);
            const probe = harness.take();
            timing = { totalMs: now() - t0, inputTokens: probe.inputTokens, outputTokens: probe.outputTokens, thinkingTokens: probe.thinkingTokens };
            if (turn === c.turns[c.turns.length - 1]) {
              if (last.status !== 200) throw new Error(`the bot answered with status ${last.status}: ${last.body.answer}`);

              // ===== PART 4: Collect the result of the last message, then run the checks =====
              const observed: Observed = {
                answer: last.body.answer,
                kind: last.body.kind,
                sources: last.body.sources,
                quoteUrl: last.body.quote_url,
                showDisclaimer: last.body.show_disclaimer,
                offerLead: last.body.offer_lead,
                followUps: last.body.follow_ups,
                sentChunks: probe.chunks,
                citedIds: probe.cited,
                ...(probe.rewrite ? { rewriteLanguage: probe.rewrite.language, rewriteFallback: probe.rewrite.fallback, rewriteCategory: probe.rewrite.category } : {}),
              };
              result = makeRun(c, effort, run, timing, observed, undefined, runChecks(c, observed));
            }
          }
          result ??= makeRun(c, effort, run, timing, undefined, "the case has no messages");
        } catch (e) {
          result = makeRun(c, effort, run, timing, undefined, e instanceof Error ? e.message : String(e));
        }

        // ===== PART 5: Save the result and report to the terminal =====
        results.push(result);
        onResult(result, index, total);
      }
    }
  }
  return results;
}

// ===== PART 6: Re-export of the line printing helper =====
export { lineFor };
