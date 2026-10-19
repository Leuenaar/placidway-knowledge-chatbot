/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/suite/run.ts
 * TUJUAN  : Menjalankan kasus satu per satu lewat sebuah bot dan mengumpulkan
 *           semua yang dibutuhkan pemeriksaan dan laporan.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Tipe: opsi menjalankan suite
 *    2. Fungsi utama: loop tingkat usaha, putaran, kasus
 *    3. Kirim tiap pesan kasus ke bot (pesan sebelumnya ikut jadi riwayat)
 *    4. Kumpulkan hasil pesan terakhir lalu jalankan pemeriksaan
 *    5. Simpan hasil dan laporkan ke terminal
 *    6. Ekspor ulang pembantu cetak baris
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah data yang dicatat tiap kasus: edit objek observed (BAGIAN 4)
 * ============================================================================ */

/** Runs the cases through a bot, one at a time, and collects what the checks and the report need. */
import { CASES, type Case } from "./cases";
import { runChecks, type Observed } from "./checks";
import type { Harness } from "./harness";
import { lineFor, makeRun, type CaseRun } from "./report";

// ===== BAGIAN 1: Tipe: opsi menjalankan suite =====
export interface RunOptions {
  /** Builds the bot for one effort level (a separate answer client per level). */
  makeHarness: (effort: string) => Harness;
  efforts: string[];
  runs: number;
  cases?: readonly Case[];
  onResult?: (run: CaseRun, index: number, total: number) => void;
  now?: () => number;
}

// ===== BAGIAN 2: Fungsi utama: loop tingkat usaha, putaran, kasus =====
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

          // ===== BAGIAN 3: Kirim tiap pesan kasus ke bot (pesan sebelumnya ikut jadi riwayat) =====
          for (const turn of c.turns) {
            harness.take();
            const t0 = now();
            last = await harness.bot.reply(session, turn);
            const probe = harness.take();
            timing = { totalMs: now() - t0, inputTokens: probe.inputTokens, outputTokens: probe.outputTokens, thinkingTokens: probe.thinkingTokens };
            if (turn === c.turns[c.turns.length - 1]) {
              if (last.status !== 200) throw new Error(`the bot answered with status ${last.status}: ${last.body.answer}`);

              // ===== BAGIAN 4: Kumpulkan hasil pesan terakhir lalu jalankan pemeriksaan =====
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

        // ===== BAGIAN 5: Simpan hasil dan laporkan ke terminal =====
        results.push(result);
        onResult(result, index, total);
      }
    }
  }
  return results;
}

// ===== BAGIAN 6: Ekspor ulang pembantu cetak baris =====
export { lineFor };
