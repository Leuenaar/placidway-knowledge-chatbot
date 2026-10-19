# PlacidWay Website Knowledge Chatbot

> A chat assistant that answers visitor questions about one clinic using **only seven PlacidWay pages**, shows where every answer came from, and says so honestly when the pages do not know.

| | |
| --- | --- |
| **Clinic covered** | ITC Immunity Therapy Center, Tijuana |
| **Live demo** | https://pcw.leuenaar.my.id (running since 19 October 2026) |
| **Stack** | TypeScript monorepo, Express API, React + Vite web app, Supabase (Postgres + pgvector), a local multilingual embedding model, Claude Haiku 5.5 for the language steps |
| **Checks** | 379 automated tests, a real-model suite of 38 conversations (37 passed every automatic check, 1 soft flag, 0 failed), checks against the public URL |
| **Built by** | Harva Heru, with AI-directed development (see [How this was built](#how-this-was-built)) |

Every factual answer carries links to the pages it came from. When the pages do not say, the bot says so and points to the free quote form.
It does not give medical advice, does not book appointments, and does not invent prices.

## Contents

1. [Quick start](#quick-start)
2. [Architecture](#architecture)
3. [Tools and models used](#tools-and-models-used)
4. [How an answer is made](#how-an-answer-is-made)
5. [Features in detail](#features-in-detail)
6. [Deployment](#deployment)
7. [Tests and results](#tests-and-results)
8. [Decisions worth knowing](#decisions-worth-knowing)
9. [Known limitations](#known-limitations)
10. [How this was built](#how-this-was-built)

---

## Quick start

### 1. What you need

| Need | Why |
| --- | --- |
| Node.js 20 or newer (22 is used on the server) and npm | Runs everything |
| A Supabase project | Database with the pgvector extension |
| An Anthropic API key | Model that writes the answers (Claude Haiku 5.5) |
| About 120 MB of free disk | The embedding model is downloaded once (q8 build) |
| The raw page text (`data/raw/*.txt`) | Only for re-running ingestion. It is PlacidWay text, so it is **not** in the repository |

### 2. Install

```bash
npm install            # once, at the repository root (installs all workspaces)
```

If the `onnxruntime-node` download is blocked on your network, `npm install --ignore-scripts` is enough for the CPU build used here.

### 3. Database (Supabase)

All SQL lives in `db/migrations/`. In the Supabase dashboard open *SQL Editor, New query*, paste each file whole and press Run, in this order.
Every file is safe to run twice.

| Order | File | What it does |
| --- | --- | --- |
| 1 | `001_security_baseline_and_kb_tables.sql` | `vector` extension, tables `pages`, `chunks`, `unanswered_questions`, the 30 day purge function, and the security wall (RLS on, nothing for `anon` or `authenticated`) |
| 2 | `002_lock_rls_auto_enable.sql` | Locks the Supabase helper `rls_auto_enable()` (Supabase only) |
| 3 | `003_match_chunks.sql` | Search function `match_chunks` (cosine similarity, callable only with the server key) |
| 4 | `004_leads.sql` | Table `leads` and the 90 day purge function (contact card) |

Then run `check_001_summary.sql` and `check_004_leads.sql`: every row must say `OK`. Details and the other checks are in `db/migrations/README.md`.

### 4. Settings (secrets stay out of the repository)

Copy the three example files and fill them in. Real `.env*` files are git-ignored.

| Copy | To | Holds |
| --- | --- | --- |
| `.env.api.example` | `.env.api` | `SUPABASE_URL`, `SUPABASE_API_KEY` (secret key, server only), `ANTHROPIC_API_KEY`, and optional settings: model, effort, retrieval size, limits, `TRUST_PROXY` |
| `.env.ingest.example` | `.env.ingest` | `SUPABASE_URL`, `SUPABASE_INGEST_KEY` (a secret key used only by `load` and `refresh`) |
| `.env.example` | `.env` | Only `PORT` (default 3001), if you need to change it |

`ANTHROPIC_WORKSPACE_ID` is needed only for Anthropic API keys that are not tied to one workspace; the API then asks for the workspace id in a header.

### 5. Fill the knowledge base (ingestion)

Put the seven raw text files in `data/raw/` (`01_clinic_profile.txt` ... `07_price_comparison.txt`), then:

```bash
npm run ingest:clean      # data/raw -> data/cleaned   (rules R1 to R10, report of everything removed)
npm run ingest:chunk      # data/cleaned -> data/chunks (rules C1 to C9, 149 chunks)
npm run ingest:embed      # data/chunks -> data/embeddings/vectors.json (first run downloads the model)
npm run ingest:eval       # 22 questions in four languages: where does the right chunk rank?
npm run ingest:load       # writes pages, chunks and vectors to Supabase and counts them back
```

`npm run ingest:load -- --dry-run` checks everything without writing. Later, when the website changes, `npm run ingest:refresh` shows a plan and
`npm run ingest:refresh -- --apply` loads only the pages that changed. Full details: `apps/ingest/README.md`.

### 6. Run it

```bash
npm run dev               # API on :3001 and web on :5173
```

Open http://localhost:5173. Without `.env.api` the server starts in **mock mode** (canned replies, a "Demo mode" banner). With `SUPABASE_URL`,
`SUPABASE_API_KEY` and `ANTHROPIC_API_KEY` it starts in **live mode**. If only some of them are set, the server refuses to start and says what is
missing: it never falls back to canned replies by accident. Live start loads the embedding model and checks the database first (about 20 seconds).

### 7. Useful commands

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Typecheck every package |
| `npm test` | All unit and contract tests (API, ingest, web, embed) |
| `npm run build` | Typecheck and build the web app into `apps/web/dist` |
| `npm run ask -- "How much does it cost?"` | One question end to end from the terminal: answer, sources, chunks sent and cited, timing, tokens |
| `npm run search -- "..."` | Retrieval only: the closest chunks to a question |
| `npm run suite` | About 38 test conversations against the real models; writes `suite-report.md` (options: `--efforts`, `--runs`, `--only`, `--lang`, `--out`) |
| `node scripts/check.mjs` | Checks against a running server (default: the live URL): edge-case messages, a parallel burst, the rate limit, health. Options: `--base`, `--only`, `--skip` |
| `npm run unanswered` | The unanswered-question log: newest rows and the count per reason |
| `npm run leads` | The contact-card leads (`-- 200` for more, `-- purge` to delete old ones now) |
| `npm run purge` | Delete unanswered-question rows older than 30 days now |

---

## Architecture

```
                                  Browser (React + Vite)
                                  chat, sources, contact card
                                            |  HTTPS  /api/chat  /api/lead  /api/health
                                            v
   nginx (TLS, static files, proxy)  ->  API server (Express, Node, tsx)
                                            |
        +-----------------------------------+-------------------------------------------+
        |                                   |                                           |
   limits/ (rate, budget)              live/bot.ts (the pipeline)                  leads/, unanswered/
        |                                   |                                           |
        |            rewrite (Haiku) -> branch -> retrieval -> answer (Haiku) -> checks  |
        |                                   |                                           |
        v                                   v                                           v
   in memory only          embedding model (e5, local CPU)                       Supabase Postgres
                                            |                          pages, chunks (vector 384), unanswered_questions, leads
                                            +---- match_chunks (cosine) ------------------^
```

### Repository map

```
apps/
  api/        Express server, the whole answer pipeline, scripts (ask, search, suite, leads, ...), answer rules
  web/        React + Vite chat screen (chat, sources, follow-ups, contact card, session storage)
  ingest/     clean, chunk, embed, load, eval, refresh commands for the seven pages
packages/
  shared/     The API contract: types, limits, the seven allowed source pages, disclaimer text
  embed/      The embedding model wrapper, used by both ingest and the API so questions and chunks match
db/
  migrations/ ALL SQL: numbered migrations 001 to 004 and the read-only check files
scripts/
  check.mjs   Checks against the public URL (edge cases, parallel burst, rate limit), plus typecheck, tests and a refresh plan
docs/
  suite-report.md   Full answers of the latest real-model suite run (19 October 2026)
test-answers.md     The bot's answers to the 8 official test questions
WRITEUP.md          Half-page write-up: what to improve next and the known limitations
```

Why separate packages: the web app and the server can be changed, tested and deployed alone, and the contract in `shared` makes any mismatch fail at
typecheck time instead of in the browser. Every source file starts with a **file map** (what the file is for, its numbered parts, and "if asked to
change X, look at part N") and numbered `BAGIAN n` ("part n") banners, so a part can be found by searching the text `BAGIAN`. The file maps are
written in Indonesian, the owner's working language; the code and its other comments are English.

### Data model (Supabase)

| Table | Holds | Notes |
| --- | --- | --- |
| `pages` | The 7 source pages, type, cleaned-text hash | The hash lets Refresh find changed pages |
| `chunks` | About 149 chunks with a stable id (for example `P2-price-1`), kind, section, text, 384-number vector | The model cites these ids; the server turns them into links |
| `unanswered_questions` | Questions the bot could not answer, with the reason | No IP address. Deleted after 30 days |
| `leads` | Name, email, language, consent version, time | Only if the visitor asks to be contacted. Deleted after 90 days |

**Security wall (migration 001).** The browser never talks to the database. Row Level Security is on for every table with **no policies**, nothing is
granted to `anon` or `authenticated`, and only the API server (secret key, role `service_role`) can read or write. A read-only audit
(`check_001_audit.sql`) proves it.

### API contract

| Endpoint | Takes | Returns |
| --- | --- | --- |
| `POST /api/chat` | `{ session_id, message, history? }`. `message` is 1 to 500 characters; `history` is optional (see [Follow-up questions after a reload](#follow-up-questions-after-a-reload)) | `answer`, `kind`, `sources[]`, `show_disclaimer`, `quote_url`, `offer_lead`, `follow_ups[]` (up to 3, chosen by the server from a fixed list) and, when relevant, `disclaimer_text` and `lead_texts` |
| `POST /api/lead` | The contact card (see [Contact card](#contact-card-lead-capture)) | `{ "ok": true }` or `{ "ok": false }` |
| `GET /api/health` | nothing | The mode (`mock` or `live`) |

`kind` is one of `answer`, `not_in_content`, `price_not_listed`, `out_of_scope`, `medical_declined`, `crisis`, `small_talk`, `rate_limited`, `error`.
Errors use the same JSON shape (status 400, 429 or 500). Types: `packages/shared/src/index.ts`.

---

## Tools and models used

| Layer | Tool or model | Used for |
| --- | --- | --- |
| Answer model | **Claude Haiku 5.5** (`claude-haiku-5-5`) through the Anthropic Messages API, called with plain `fetch` (no SDK) | Writes the answer from the chunks (effort `medium`), rewrites the question into a search query (effort `low`), small talk, one-time translation of fixed texts for other languages |
| Embedding model | **multilingual-e5-small**, ONNX build `Xenova/multilingual-e5-small`, `q8`, 384 dimensions, about 100 languages, run on the CPU of the server with `@huggingface/transformers` 4.3.1 | Turns chunks and questions into vectors. No page or question text leaves the machine for this step |
| Database | **Supabase**: Postgres with the **pgvector** extension, reached through PostgREST with plain `fetch` | Pages, chunks, vectors, search function, logs, leads |
| API server | Node.js 22, **Express** 4, **zod** 3 (request validation), **tsx** (runs TypeScript directly) | `/api/chat`, `/api/lead`, `/api/health`, limits, bot |
| Web app | **React** 18, **Vite** 6, TypeScript, hand-written CSS | Chat screen. No UI framework, no Markdown library (model text is rendered safely) |
| Language | TypeScript everywhere, npm workspaces | One language, shared types |
| Tests | Node's built-in test runner (`node --test`), real HTTP against the real app, a real local Postgres + pgvector for the live simulation | See [Tests and results](#tests-and-results) |
| Hosting | One Ubuntu 22.04 VPS: **nginx**, **certbot** (HTTPS, auto-renew), **systemd**, **ufw** (22, 80, 443) | Public URL |
| Page text | Exported by a person, kept in `data/raw/` (git-ignored) | Source of the knowledge base |

**Chosen not to use, and why:** Python, LangChain or LlamaIndex, Chroma or Pinecone, Streamlit or Chainlit. Each adds a layer that has to be
explained, and none fits a single TypeScript codebase. Pgvector inside the database that already holds the pages is one less service to run. A vector
index is not used on purpose: with about 150 rows an exact scan is instant and always returns the true nearest chunks.

---

## How an answer is made

`apps/api/src/live/bot.ts` runs these steps for each message.

1. **Rewrite** (`rewrite/`). A small model call turns the message into a standalone English search query using the earlier turns, names the language
   to answer in (a code that the server turns into a name, so no free text from the model reaches the answer prompt), gives a category (`in_scope`,
   `out_of_scope`, `medical`, `small_talk`, `crisis`) and a `wants_quote` flag. If this step fails, the visitor's own words are searched.
2. **Branch** (decided by the server, see the table below).
3. **Retrieve** (`retrieval/`). The search runs twice, for the rewritten English question **and** for the visitor's own words, and the two lists are
   merged by reciprocal rank fusion, so one drifting rewrite cannot hide the right page. A page whose title holds a word no other title has
   (adenocarcinoma, adrenal, anal, videos...) and that the question uses is read in full first, and the remaining slots go to the pages with the most
   hits (`RETRIEVE_COUNT` default 8, `EXPAND_PAGES` default 2). If the visitor writes a dollar amount ("I heard it costs $50"), the chunks that really
   contain that figure are looked up (whole-figure match, so $50 never matches $500) and added, so the model can see where the figure truly appears.
4. **Answer** (`answer/`). The model gets the chunks, recent turns, the reply language and the visitor's message, and returns JSON: the answer text
   and the ids of the chunks it used. The rules for how it speaks are plain text files in `apps/api/rules/` (language and pushback, scope and medical,
   grounding, voice and prices, claims about results), joined into the prompt at start; a missing file stops the server. A one-line reminder ends
   every request.
5. **Check** (server code, not the model). Ids that were not in the chunks are dropped. Source links come from the fixed list of seven pages. An answer
   that cites nothing is replaced by a fixed text. The disclaimer is shown once per session, decided by code. Follow-up suggestions come from a fixed
   table.

| Message | What happens | Kind |
| --- | --- | --- |
| Says they want to hurt themselves or not live (category `crisis`, **or** a keyword match in five languages; either is enough) | Fixed text in the visitor's language. No search, no model answer, no sources, no quote link, no suggestions. Care mode starts | `crisis` |
| Greeting, thanks, "are you a bot?" | Short reply from a small model call. Nothing is searched | `small_talk` |
| Asks for a medical judgement ("is it safe for my diabetes?") | Answered under the medical rules: never safe or unsafe, the doctor is named, page cautions are passed on. No review or patient-story chunks. Full disclaimer once. No quote button | `medical_declined` |
| Unrelated (weather, booking) | The model's decline with the quote link. If the pages can still help (for booking: the consultation link) that grounded answer is shown with sources | `out_of_scope` |
| About the clinic | Searched, answered, checked | `answer` / `not_in_content` |

**Care mode** starts after a crisis message and lasts until the session ends (one hour of silence). Later questions are still answered correctly, but
briefly and calmly, with no quote button, no suggestions and no contact card. A crisis is deliberately narrow (intent to harm oneself or not wanting to
live); fear of an illness is distress, not crisis, and gets one empathic sentence on the normal path. The crisis text has no phone number (numbers
differ by country and go stale): it points to the local emergency number and to findahelpline.com.

**Fixed texts in the visitor's language** (`i18n/`): crisis, disclaimer, fallbacks, error, rate-limit text, contact-card texts and follow-up questions
exist as hand-written tables for English, Indonesian, Turkish, Spanish and Arabic. For any other language the English set is translated once by the
model and kept in memory; if that fails, or a translated crisis text loses the findahelpline.com address, English is used.

---

## Features in detail

### Unanswered-question log

*Code: `unanswered/`.* Questions the bot could not answer are noted in `unanswered_questions` (question, reason, time, session id) to find gaps in the
content. Reasons: `not_in_content`, `price_not_listed`, `out_of_scope`, `medical_declined`.

- **Not stored:** IP address; crisis messages, small talk, errors and every message in a care-mode session.
- **Masked before saving:** email addresses, phone-like numbers, and runs of six or more digits. Names and free-text health details are **not**
  removed, which is why rows are deleted after 30 days (at server start, once a day, and with `npm run purge`).
- **Never in the way:** the write happens after the reply is built, is never waited for, and a failure shows only in the server log, without the question.
- **No admin page on purpose:** `npm run unanswered` prints the log.

### Follow-up questions after a reload

*Code: `history.ts`, `apps/web/src/storage.ts`.* The server keeps conversation history in the memory of its own process: the last 12 messages per
session, forgotten after an hour, at most 1000 sessions. The chat screen also keeps the chat in the tab's `sessionStorage` and sends its last 6
exchanges (`history`) with every question. The server uses that copy **only** when it has no history of its own for the session (after a restart or
an hour of silence), so "And what about Turkey?" still works after a reload, with no account.

- `sessionStorage` belongs to one tab and disappears when the tab closes. A chat containing a crisis reply is never kept.
- The copy is treated as untrusted: at most 12 entries, strictly alternating, 500 characters per visitor entry and 2000 per bot entry, otherwise
  status 400 before any model call. It never changes care mode or the disclaimer flag.

### Rate limits and the daily budget

*Code: `limits/`.* Every model call costs money, so `/api/chat` is guarded in live mode. Checked in this order, before any paid call:

| Limit | Default | Setting |
| --- | --- | --- |
| Tokens used today over all visitors (UTC day) | 5,000,000 | `DAILY_TOKEN_BUDGET` |
| Messages per visitor address per UTC day | 100 | `RATE_LIMIT_PER_DAY` |
| Messages per visitor address in a sliding 10 minutes | 15 | `RATE_LIMIT_PER_10_MIN` |
| Chats being answered at the same time | 8 | `MAX_CONCURRENT_CHATS` |

A refused message gets status 429, a `Retry-After` header and `kind: "rate_limited"` with a fixed text in the visitor's language that never goes
through the model. **A crisis message is never refused**: the keyword net runs first and needs no model, with its own small caps (5 per address per 10
minutes, 200 per day) so it cannot drain the budget. Visitors are told apart by a salted hash of the network address that exists only in server memory.
**Behind nginx set `TRUST_PROXY=1`**, otherwise every visitor shares one limit. Counters live in memory, so a restart starts the day again at zero;
the real hard stop is a monthly spend limit in the Anthropic Console.

### Contact card (lead capture)

*Code: `leads/`.* When a visitor asks for a personal quote or to be contacted, the bot answers as usual and also shows a small card: name, email, one
consent box, "Send" and "No, thanks". The rewrite step sets `wants_quote`; the server decides the rest: **once per session**, **never in care mode**,
**never with a medical reply**.

- `POST /api/lead` is checked strictly: name 1 to 100 characters with no control characters or `<>`, email up to 254, consent exactly `true`, unknown
  fields refused with 400.
- A hidden field `website` is bait for bots: if it is filled the reply is "ok" and nothing is stored.
- The endpoint has its own limit (5 per hour, 20 per day per address) and calls no model.
- **Stored:** name, email, language, consent version, time. **Not stored:** IP, session id, chat text. Names and emails never reach the server log.
  Rows are deleted after 90 days. The browser keeps only whether the card was sent or declined.
- **Honest limit:** nothing is emailed; leads are only stored (`npm run leads`).

### Languages

The visitor writes in any language and gets the answer in it. Search works across languages because the embedding model is multilingual and the
rewrite step searches in English as well. Hand-written fixed texts exist for English, Indonesian, Turkish, Spanish and Arabic (English and Indonesian
were reviewed by the owner; Turkish, Spanish and Arabic were not reviewed by a native speaker). The labels of the web page itself (buttons, welcome
cards) are still English.

### The chat screen

*Code: `apps/web`.* Designed from research on trust, citations, chat patterns and accessibility:

- **Welcome screen with four topic cards** so visitors see the scope; they send a real question in one tap.
- **Says it is an AI in three places:** the header label, the welcome text, and a one-line note under the input. The full disclaimer appears once per
  session when the server says so.
- **Sources are named cards** ("Package page", "Price list") that open in a new tab and link only to the seven allowed pages.
- **A person is always one click away:** "Free quote" in the header and on every "not in the pages" reply.
- **Waiting:** three dots at once; after about 6 seconds a plain line says the pages are being checked. **Errors** sit on the failed reply with "Try again".
- **Accessibility:** live region for new messages, labelled input, 44 px touch targets, contrast checked in light and dark, reflow at 320 px,
  reduced-motion support.
- **Reply text is rendered safely:** only **bold** and "- " lists are understood, so model output can never inject HTML.

---

## Deployment

The live site runs on one Ubuntu 22.04 VPS.

| Piece | Setup |
| --- | --- |
| Web | nginx serves `apps/web/dist` (built with `npm run build`) and proxies `/api` to `127.0.0.1:3001` (`proxy_read_timeout 60s`, `client_max_body_size 64k`) |
| API | systemd unit `pwbot.service`: user `pwbot`, working directory `/opt/pwbot/app/apps/api`, `node --import tsx src/server.ts`, `Restart=always`, `NoNewPrivileges`, `PrivateTmp`, `PORT=3001` |
| Secrets | `/opt/pwbot/app/.env.api`, mode 600, owned by `pwbot`, with `TRUST_PROXY=1` |
| HTTPS | certbot with automatic renewal |
| Firewall | ufw allows 22, 80 and 443 only |
| SSH | Key login only: password login is off (`PasswordAuthentication no`) and root may log in with a key only (`PermitRootLogin prohibit-password`), set in `/etc/ssh/sshd_config.d/00-hardening.conf` |
| Brute-force protection | fail2ban on the `sshd` jail: 5 failed logins within 10 minutes ban the address for 1 hour |
| Updates | Operating system security updates applied and the server rebooted on 19 October 2026; the bot and nginx start again on their own after a reboot |

The unit file and the nginx configuration live on the server and are not part of this repository.

Redeploy:

```bash
scp pw-full.zip root@SERVER:/tmp/
unzip -oq /tmp/pw-full.zip -d /opt/pwbot/app && chown -R pwbot:pwbot /opt/pwbot/app
su -s /bin/bash pwbot -c "export PATH=/usr/local/bin:\$PATH; cd /opt/pwbot/app && npm ci && npm run build"
systemctl restart pwbot
curl https://YOUR-DOMAIN/api/health        # wait about 25 seconds after the restart
```

---

## Tests and results

| Kind | What it proves |
| --- | --- |
| Unit and contract tests (`npm test`) | 379 tests, all passing on the author's machine. The API tests start the real Express app on a random port and send real HTTP requests. The 28 gates that need the real page text run only when `data/raw/` is present, so a fresh clone still passes `npm test` |
| Ingestion gates on the real pages | Nothing lost or added in cleaning and chunking, every `$` amount is kept exactly once, ids and hashes are stable, two runs give identical files |
| Live simulation | Real Postgres with pgvector and the 149 real chunks; stand-ins only for the model and PostgREST HTTP. 343 requests covering migrations run twice, RLS, purge, limits, history, crisis, care mode, the contact card. It was run in the author's sandbox; **the script is not included in this repository** |
| `npm run suite` (real models) | Latest run on 19 October 2026 (prompt v2.3): **38 conversations, 37 passed every automatic check, 1 soft flag (a long answer), 0 failed**; median 3.7 seconds, longest 8.4 seconds. It covers the 8 official test questions with this clinic's data, extra traps (hidden question, identity, prompt injection, fear, crisis, care mode, disclaimer once, follow-up in another country, lead offer) and the key questions again in Indonesian, Turkish, Spanish and Arabic. Automatic checks: every dollar amount and duration must appear in the chunks the model was given, required prices present, sources exist, right language, no leaked prompt text. Every full answer is written to `suite-report.md` for a person to read; the automatic checks do not judge tone. The report of the 19 October 2026 run is kept in `docs/suite-report.md` |
| Answers to the 8 official questions | `test-answers.md`, copied without editing from the 19 October 2026 suite report |
| Refresh against the live database | `npm run ingest:refresh` (plan only) on 19 October 2026: 7 of 7 pages unchanged, nothing written. `--apply` has not been run against the live project |
| Checks against the public URL | 19 October 2026, repeatable with `node scripts/check.mjs`: a 600 character message is refused with status 400; German and Portuguese questions are answered in the visitor's language with sources; a prompt-injection request is refused without leaking instructions; the "$50" trap is corrected with the real price; 8 parallel chats all returned status 200 with the correct price; further messages get status 429 with a `Retry-After` header; `/api/health` stays `live` afterwards |

---

## Decisions worth knowing

- **The server, not the model, builds the links.** The model returns chunk ids; the server attaches the URL from a fixed list of seven pages. An
  invented URL cannot get through.
- **The decisions that matter are code, not prompt:** crisis handling, the disclaimer, care mode, the contact card, follow-up suggestions and rate
  limits are decided by the server.
- **No streaming.** The full answer is checked before it is shown, which cannot be done on a half-written answer.
- **Answer rules are text files** (`apps/api/rules/`), so how the bot speaks can be changed without touching code. (The first plan stored them as rows
  in the database; plain files turned out simpler to review and version.)
- **Effort settings were compared** (low, medium, high). Answers use `medium`; `high` was rejected (token errors and no better). The rewrite step uses `low`.
- **The chat survives a reload, in the tab only.** No accounts, nothing about the chat stored in the database.
- **Leads are the one thing kept about a person, and only if they ask for it** (see above).
- **The raw page text is never committed** (it belongs to PlacidWay). `data/` is git-ignored.

---

## Known limitations

Listed by how much they would matter in real use.

| Severity | Limitation |
| --- | --- |
| Medium | Rate-limit counters and conversation history are in server memory and reset on restart. It is a single server with no monitoring and no redundancy. Visitors behind one office or phone network share an address and a limit. |
| Medium | Crisis keywords do not catch every wording and cover five languages; other languages rely on the rewrite step alone. This is not a crisis service, and its text says it is an AI assistant. |
| Medium | Leads are stored, not emailed. Someone has to look at them. |
| Medium | For a general question that names no cancer type, the three package pages are near-duplicates, so the search can pick any of them and the source card may show, for example, the anal cancer package. The answer is correct only as far as the three packages share the same terms. |
| Low | The medical reply text can still mention the free quote while its button is hidden for medical replies. |
| Low | Server hardening was done on 19 October 2026 (see Deployment). Still open: a non-root admin user, automatic security updates (unattended-upgrades), and a restore test from backup. |
| Low | Model answers vary between runs. The suite reports soft flags (long answers, a price named twice) that move between runs, and the model has no fixed temperature. Questions that make the model reason at length can take 6 to 9 seconds. |
| Unreviewed | The Turkish, Spanish and Arabic fixed texts were written by AI and not reviewed by a native speaker. The labels of the web page (buttons, welcome cards) are English only. |

**Not tested yet:**

- Heavy load: only 8 parallel chats were tried, plus a burst past the rate limit. No stress test with many parallel messages or very long conversations.
- `ingest:refresh --apply` against the live Supabase project, and fetching the pages automatically from the server (the page text is exported by a person).
- Restoring the server or the database from a backup.
- A seven-day uptime record for the public URL.
- Any message written by someone other than the author and the AI assistant.
- A person reading answers is still needed: automatic checks cannot judge tone.

---

## How this was built

This is AI-directed development. The owner (Harva Heru) set the goals, made the design decisions, reviewed the results and ran the tests on his own
machine and server; the AI assistant (Claude) wrote the code and the documents under that direction. Every design step was proposed and approved
before it was built, and every checkpoint was tested before it was handed over. Where something was not verified, this README says so.
