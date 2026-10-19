/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/scripts/search.ts
 * PURPOSE : The command `npm run search -w @pwbot/api -- "question"`: tries
 *           the search alone (without the answer model) against the real
 *           database. The same question is run twice: the first includes
 *           loading the model, the second shows the normal speed together with
 *           the top 10 results.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports (tools this script uses)
 *    2. Main function of the script
 *    3. Read the question from the command line
 *    4. Load the secrets from .env.api
 *    5. Prepare the searcher
 *    6. Search twice and print the top 10 results of the second round
 *    7. Run the main function
 * IF ASKED TO CHANGE:
 *    - Change the number of results shown or the width of the piece text (PART
 *      6)
 * ============================================================================ */

// ===== PART 1: Imports (tools this script uses) =====
/**
 * Try retrieval by hand, against the real database and the real embedding model.
 *   npm run search -w @pwbot/api -- "How much does the treatment cost?"
 * It runs the same question twice: the first run includes loading the model, the second shows the normal speed.
 * Reads SUPABASE_URL and SUPABASE_API_KEY from .env.api at the repo root. Writes nothing.
 */
import { resolve } from "node:path";
import { createE5Embedder } from "@pwbot/embed";
import { loadEnvFile } from "../env";
import { createRetriever, loadDbConfig, RetrievalError } from "../retrieval";

// ===== PART 2: Main function of the script =====
async function main(): Promise<void> {

  // ===== PART 3: Read the question from the command line =====
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('usage: npm run search -w @pwbot/api -- "your question"');
    process.exit(2);
  }

  // ===== PART 4: Load the secrets from .env.api =====
  // npm runs this from apps/api, so the repo root is two folders up.
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));

  // ===== PART 5: Prepare the searcher =====
  let retriever;
  try {
    retriever = createRetriever({ db: loadDbConfig(), embedder: createE5Embedder() });
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  try {

    // ===== PART 6: Search twice and print the top 10 results of the second round =====
    for (const run of ["first run (loads the model)", "second run (normal speed)"]) {
      const t0 = Date.now();
      const hits = await retriever.search(question, 10);
      const ms = Date.now() - t0;
      console.log(`\n${run}: ${ms} ms`);
      if (run.startsWith("second")) {
        for (const [i, h] of hits.entries()) {
          console.log(`${i + 1}. ${h.id.padEnd(16)} ${h.similarity.toFixed(4)}  ${h.text.replace(/\s+/g, " ").slice(0, 90)}`);
        }
      }
    }
  } catch (e) {
    console.error(`PROBLEM: ${e instanceof RetrievalError ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ===== PART 7: Run the main function =====
void main();
