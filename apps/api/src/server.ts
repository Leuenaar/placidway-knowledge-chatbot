/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/server.ts
 * PURPOSE : Entry point of the API server. It reads the settings (.env.api),
 *           chooses mock mode (sample answers) or live mode (real answers),
 *           assembles all the parts of the bot, then starts the server. If the
 *           live settings are wrong or half-set, the server deliberately
 *           refuses to start.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Basic settings: the port and the list of keys for live mode
 *    2. Main function: read the settings, choose mock or live
 *    3. Live mode: assemble the database, the model, the usage limits
 *    4. Warm up the embedding model and check the database
 *    5. Automatic deletion schedule, lead storage, lead limit
 *    6. Start the server and print the limits note
 *    7. If the start fails: stop with a clear message
 * IF ASKED TO CHANGE:
 *    - Default server port (PART 1)
 *    - Timeout of the rewrite step (12 seconds) and the translation (30
 *      seconds) (PART 3)
 *    - Limit on sending the contact card (5 per hour, 20 per day) (PART 5)
 *    - Message shown when the server starts (PART 6)
 * ============================================================================ */

/**
 * Entry point of the API server. It reads the settings, picks the live bot or the mock bot, and starts listening;
 * all behaviour lives in app.ts and the bots so tests can start the app without a fixed port.
 *
 * Settings come from the environment or from .env.api at the repo root (see .env.api.example):
 *   - none of the live settings set          -> mock mode (canned replies, the UI shows its demo banner)
 *   - the live settings set and valid        -> live mode
 *   - some set but wrong or incomplete       -> the server refuses to start and says what to fix, so a mistake
 *                                               can never silently serve canned answers as if they were real.
 */
import { resolve } from "node:path";
import { createE5Embedder } from "@pwbot/embed";
import { createApp } from "./app";
import { type ModelClient, buildSystemPrompt, createAnswerer, createAnthropicClient, createSmallTalker, loadAnthropicConfig, loadRules, withEffort } from "./answer";
import { loadEnvFile } from "./env";
import { createHistoryStore } from "./history";
import { createLocalizer } from "./i18n";
import { createLeadService, createLeadStore, startLeadPurgeSchedule } from "./leads";
import { createLimiter, loadLimitsConfig, meterClient } from "./limits";
import { createLiveBot } from "./live/bot";
import { createRetriever, loadDbConfig, loadExpandPages, loadRetrieveCount } from "./retrieval";
import { createRewriter } from "./rewrite";
import { createUnansweredLog, startPurgeSchedule } from "./unanswered";

// ===== PART 1: Basic settings: the port and the list of keys for live mode =====
const DEFAULT_PORT = 3001;
const LIVE_SETTINGS = ["SUPABASE_URL", "SUPABASE_API_KEY", "ANTHROPIC_API_KEY"];

// ===== PART 2: Main function: read the settings, choose mock or live =====
async function main(): Promise<void> {
  // npm runs this from apps/api, so the repo root is two folders up.
  loadEnvFile(resolve(process.cwd(), "../../.env.api"));
  const parsedPort = Number(process.env.PORT);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;

  const anyLive = LIVE_SETTINGS.some((k) => process.env[k]);
  if (!anyLive) {
    createApp().listen(port, () => console.log(`API (mock mode: canned replies) listening on http://localhost:${port}`));
    return;
  }

  try {

    // ===== PART 3: Live mode: assemble the database, the model, the usage limits =====
    const db = loadDbConfig();
    const retriever = createRetriever({ db, embedder: createE5Embedder() });
    const anthropic = loadAnthropicConfig();
    // Limits: per visitor address, per day over everybody (in tokens), and chats at the same time. Every model call reports its tokens to the budget.
    const limits = loadLimitsConfig();
    const limiter = createLimiter(limits);
    const metered = (client: ModelClient) => meterClient(client, (n) => limiter.addTokens(n));
    // The rule files are read now: a missing or empty file stops the server here instead of failing in a chat.
    const answerer = createAnswerer(metered(createAnthropicClient(anthropic)), buildSystemPrompt(loadRules()));
    // The rewrite step is a small task with its own effort setting and a shorter timeout (it falls back if it is slow).
    const smallClient = metered(createAnthropicClient(withEffort(anthropic, anthropic.rewriteEffort), { timeoutMs: 12_000 }));
    const rewriter = createRewriter(smallClient);
    // Small talk and the translation of fixed texts (languages beyond the five hand-written ones) are small tasks of the same kind.
    const smallTalker = createSmallTalker(smallClient);
    const localizer = createLocalizer({ client: metered(createAnthropicClient(withEffort(anthropic, anthropic.rewriteEffort), { timeoutMs: 30_000 })) });

    // ===== PART 4: Warm up the embedding model and check the database =====
    // Load the embedding model and check the database now, so the first visitor does not wait about 20 seconds
    // and a wrong key shows up at startup instead of in a chat.
    console.log("Loading the embedding model and checking the database...");
    const t0 = Date.now();
    await retriever.search("startup check", 1);
    console.log(`Ready in ${Date.now() - t0} ms.`);

    // ===== PART 5: Automatic deletion schedule, lead storage, lead limit =====
    // Unanswered questions are kept for 30 days: the cleanup runs now and then once a day.
    startPurgeSchedule({ db });
    // Leads (name and email left on purpose, nice-to-have N4) are kept for 90 days. The chat and the lead form share one history store, so a session in care mode can never leave a lead.
    startLeadPurgeSchedule({ db });
    const history = createHistoryStore();
    const leads = createLeadService({ store: createLeadStore({ db }), isCare: (sessionId) => history.flags(sessionId).care, languageOf: (sessionId) => history.flags(sessionId).languageCode });
    // The lead form has its own small limit (5 per hour and 20 per day for each address); it never calls the model, so no token budget applies.
    const leadLimiter = createLimiter({ perWindow: 5, windowMs: 60 * 60 * 1000, perDay: 20, dailyTokens: Number.MAX_SAFE_INTEGER, maxConcurrent: 4 });

    // ===== PART 6: Start the server and print the limits note =====
    createApp({ bot: createLiveBot({ retriever, answerer, rewriter, localizer, smallTalker, unanswered: createUnansweredLog({ db }), history, resultCount: loadRetrieveCount(), expandPages: loadExpandPages() }), mode: "live", limiter, leads, leadLimiter, trustProxy: limits.trustProxy }).listen(port, () => {
      console.log(`API (LIVE mode) listening on http://localhost:${port}`);
      console.log(`Limits: ${limits.perWindow} messages per 10 minutes and ${limits.perDay} per day for each visitor address, ${limits.dailyTokens} model tokens per day in total, ${limits.maxConcurrent} chats at the same time.`);
      if (limits.trustProxy === 0) console.log("NOTE: TRUST_PROXY is not set, so visitors are told apart by the address that connects to this server. Behind nginx or another proxy set TRUST_PROXY=1, otherwise every visitor shares one limit.");
    });
  } catch (e) {

    // ===== PART 7: If the start fails: stop with a clear message =====
    console.error(`PROBLEM: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

void main();
