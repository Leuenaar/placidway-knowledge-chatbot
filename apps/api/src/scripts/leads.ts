/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/scripts/leads.ts
 * PURPOSE : The command `npm run leads`: lists the contacts (name and email)
 *           of visitors who agreed to be contacted about a quote, newest
 *           first. With `-- purge` it deletes contacts older than 90 days.
 *           This is personal data, printed only in the owner's terminal.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports (tools this script uses)
 *    2. Main function of the script
 *    3. Load the secrets from .env.api
 *    4. Purge mode: delete old contacts now
 *    5. List mode: show the newest contacts
 *    6. Run the main function
 * IF ASKED TO CHANGE:
 *    - Change the format of the contact line that is shown (PART 5)
 *    - Change how long contacts are kept (90 days): see LEAD_RETENTION_DAYS in
 *      leads/store.ts and the purge function in db/migrations/004_leads.sql
 *      (PART 4)
 * ============================================================================ */

// ===== PART 1: Imports (tools this script uses) =====
/**
 * Shows the leads (name and email left by visitors who agreed to be contacted about a quote), newest first.
 *   npm run leads            newest 50
 *   npm run leads -- 200     newest 200 (at most 500)
 *   npm run leads -- purge   delete leads older than 90 days now (the server also does this once a day)
 * Reads SUPABASE_URL and SUPABASE_API_KEY from .env.api at the repo root. This is personal data: it is printed only in your own terminal.
 */
import { resolve } from "node:path";
import { loadEnvFile } from "../env";
import { LEAD_RETENTION_DAYS, listLeads, purgeOldLeads } from "../leads";
import { loadDbConfig } from "../retrieval";

// ===== PART 2: Main function of the script =====
async function main(): Promise<void> {

  // ===== PART 3: Load the secrets from .env.api =====
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));
  try {
    const db = loadDbConfig();

    // ===== PART 4: Purge mode: delete old contacts now =====
    if (process.argv[2] === "purge") {
      const n = await purgeOldLeads({ db });
      if (n === undefined) {
        console.error("PROBLEM: the purge did not work (see the message above). Has migration 004 been run?");
        process.exit(1);
      }
      console.log(`Deleted ${n} lead(s) older than ${LEAD_RETENTION_DAYS} days.`);
      return;
    }

    // ===== PART 5: List mode: show the newest contacts =====
    const limit = Number(process.argv[2] ?? 50);
    const rows = await listLeads({ db }, Number.isFinite(limit) ? limit : 50);
    console.log(`${rows.length} lead(s) shown.\n`);
    for (const r of rows) console.log(`${r.created_at.slice(0, 19).replace("T", " ")}  ${(r.language ?? "-").padEnd(3)}  ${r.name}  <${r.email}>  (consent ${r.consent_version})`);
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)} (has migration 004 been run?)`);
    process.exit(1);
  }
}

// ===== PART 6: Run the main function =====
void main();
