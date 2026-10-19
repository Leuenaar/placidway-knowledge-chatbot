/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/scripts/purge.ts
 * PURPOSE : The command `npm run purge`: deletes the unanswered-question
 *           records older than 30 days, once, and reports the count. The
 *           server does the same by itself at start and once a day.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports (tools this script uses)
 *    2. Main function of the script
 *    3. Load the secrets from .env.api
 *    4. Delete old rows and report the count
 *    5. Run the main function
 * IF ASKED TO CHANGE:
 *    - Change the message about the deletion result (PART 4)
 * ============================================================================ */

// ===== PART 1: Imports (tools this script uses) =====
/**
 * Deletes unanswered-questions rows older than 30 days, once, and says how many.
 *   npm run purge
 * (The server does the same by itself at start and once a day.) Reads .env.api at the repo root.
 */
import { resolve } from "node:path";
import { loadEnvFile } from "../env";
import { loadDbConfig } from "../retrieval";
import { purgeOld } from "../unanswered";

// ===== PART 2: Main function of the script =====
async function main(): Promise<void> {

  // ===== PART 3: Load the secrets from .env.api =====
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));
  try {

    // ===== PART 4: Delete old rows and report the count =====
    const n = await purgeOld({ db: loadDbConfig() });
    if (n === undefined) {
      console.error("PROBLEM: the purge did not work (see the message above)");
      process.exit(1);
    }
    console.log(`Deleted ${n} row(s) older than 30 days.`);
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ===== PART 5: Run the main function =====
void main();
