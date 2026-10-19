/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/scripts/unanswered.ts
 * PURPOSE : The command `npm run unanswered`: shows the log of unanswered
 *           questions (newest first) with the count per reason. Read only, it
 *           changes nothing.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports (tools this script uses)
 *    2. Main function of the script
 *    3. Load the secrets from .env.api
 *    4. Fetch the newest rows and count per reason
 *    5. Print one line per record
 *    6. Run the main function
 * IF ASKED TO CHANGE:
 *    - Change the columns shown in the list (PART 5)
 *    - Change the default number of rows (50) (PART 4)
 * ============================================================================ */

// ===== PART 1: Imports (tools this script uses) =====
/**
 * Shows the unanswered-questions log: the newest rows and the count per reason.
 *   npm run unanswered            newest 50
 *   npm run unanswered -- 200     newest 200 (at most 500)
 * Reads SUPABASE_URL and SUPABASE_API_KEY from .env.api at the repo root. Only reads.
 */
import { resolve } from "node:path";
import { loadEnvFile } from "../env";
import { loadDbConfig } from "../retrieval";
import { listRecent } from "../unanswered";

// ===== PART 2: Main function of the script =====
async function main(): Promise<void> {

  // ===== PART 3: Load the secrets from .env.api =====
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));
  const limit = Number(process.argv[2] ?? 50);
  try {

    // ===== PART 4: Fetch the newest rows and count per reason =====
    const rows = await listRecent({ db: loadDbConfig() }, Number.isFinite(limit) ? limit : 50);
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    console.log(`${rows.length} row(s) shown. Per reason: ${[...counts].map(([k, v]) => `${k} ${v}`).join(", ") || "none"}\n`);

    // ===== PART 5: Print one line per record =====
    for (const r of rows) console.log(`${r.created_at.slice(0, 19).replace("T", " ")}  ${r.reason.padEnd(16)}  ${(r.session_id ?? "-").slice(0, 8)}  ${r.question}`);
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ===== PART 6: Run the main function =====
void main();
