/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/app.ts
 * TUJUAN  : Lapisan HTTP: daftar jalur (/api/health, /api/chat, /api/lead),
 *           pemeriksaan bentuk permintaan dengan zod, batas pemakaian, dan
 *           penanganan error supaya selalu keluar JSON, bukan halaman HTML.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Aturan bentuk permintaan chat (history dari browser dicek ketat)
 *    2. Aturan bentuk permintaan lead (nama, email, centang persetujuan)
 *    3. Opsi aplikasi (bot, mode, batas, lead)
 *    4. Membuat aplikasi dan jalur /api/health
 *    5. Jalur POST /api/chat: validasi, batas pemakaian, panggil bot
 *    6. Jalur POST /api/lead: validasi, batas, simpan lead
 *    7. Jalur tak dikenal dan penanganan error
 * KALAU DIMINTA MENGUBAH:
 *    - Panjang maksimum pesan atau aturan history (BAGIAN 1)
 *    - Aturan nama dan email pada kartu kontak (BAGIAN 2)
 *    - Batas ukuran isi permintaan (64kb) (BAGIAN 4)
 *    - Teks error yang dilihat pengunjung (BAGIAN 7)
 * ============================================================================ */

/**
 * HTTP layer of the API: routes, request validation and error handling.
 *
 * The reply logic is behind the `bot` object. Today it is the mock bot; when the real
 * pipeline exists it replaces the mock without changing the routes or the contract.
 */
import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";
import { MAX_HISTORY_ANSWER_LENGTH, MAX_HISTORY_ENTRIES, MAX_LEAD_EMAIL_LENGTH, MAX_LEAD_NAME_LENGTH, MAX_MESSAGE_LENGTH, type HealthResponse } from "@pwbot/shared";
import type { Bot } from "./bot";
import { looksLikeCrisis } from "./crisis";
import { createLeadService, createMemoryLeadStore, type LeadService } from "./leads";
import { limitText, type Limiter } from "./limits";
import { createMockBot } from "./mock/bot";
import { errorResponse } from "./responses";

// ===== BAGIAN 1: Aturan bentuk permintaan chat (history dari browser dicek ketat) =====
/**
 * The chat the browser remembers. Strict on purpose: it must alternate visitor / assistant starting with the visitor, a visitor
 * entry is as short as a message may be, an assistant entry is capped. Anything else is a broken or hostile client: 400.
 */
const historySchema = z
  .array(
    z.object({
      role: z.enum(["visitor", "assistant"]),
      text: z.string().min(1).max(MAX_HISTORY_ANSWER_LENGTH),
    }),
  )
  .max(MAX_HISTORY_ENTRIES)
  .refine((h) => h.every((e, i) => e.role === (i % 2 === 0 ? "visitor" : "assistant")) && h.length % 2 === 0, "history must alternate, visitor first")
  .refine((h) => h.every((e) => e.role !== "visitor" || e.text.length <= MAX_MESSAGE_LENGTH), "visitor entry too long");

const chatRequestSchema = z.object({
  session_id: z.string().uuid(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  history: historySchema.optional(),
});

// ===== BAGIAN 2: Aturan bentuk permintaan lead (nama, email, centang persetujuan) =====
/**
 * A lead: the name and email a visitor chose to leave. Strict on purpose: the box must be ticked (the literal true), the name is plain
 * text without control characters, the email must look like an email. Anything else is a broken or hostile client: 400.
 */
const NO_CONTROL_CHARS = /^[^\u0000-\u001f\u007f<>]*$/;
const leadRequestSchema = z.object({
  session_id: z.string().uuid(),
  name: z.string().trim().min(1).max(MAX_LEAD_NAME_LENGTH).regex(NO_CONTROL_CHARS),
  email: z.string().trim().min(3).max(MAX_LEAD_EMAIL_LENGTH).email(),
  consent: z.literal(true),
  language: z.string().trim().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/).optional(),
  website: z.string().max(200).optional(),
}).strict();

// ===== BAGIAN 3: Opsi aplikasi (bot, mode, batas, lead) =====
export interface AppOptions {
  /** The reply logic. Default: the mock bot (canned replies), a fresh one per app so tests stay isolated. */
  bot?: Bot;
  /** What /api/health reports, so the UI can show its demo banner only when the answers are canned. */
  mode?: HealthResponse["mode"];
  /** Rate limit, daily token budget and concurrency. Default: none (tests, mock mode). */
  limiter?: Limiter;
  /** Keeps the leads. Default: in memory (mock mode and tests), gone when the process ends. */
  leads?: LeadService;
  /** Its own, smaller limit for POST /api/lead. Default: none. */
  leadLimiter?: Limiter;
  /** How many proxies sit in front of the server, so the visitor's address is read correctly (nginx = 1). Default 0. */
  trustProxy?: number;
}

// ===== BAGIAN 4: Membuat aplikasi dan jalur /api/health =====
export function createApp(options: AppOptions = {}) {
  const app = express();
  const bot: Bot = options.bot ?? createMockBot();
  const mode = options.mode ?? "mock";
  const limiter = options.limiter;
  const leads = options.leads ?? createLeadService({ store: createMemoryLeadStore() });
  const leadLimiter = options.leadLimiter;
  if (options.trustProxy) app.set("trust proxy", options.trustProxy);

  // Messages are short, so a small body limit rejects abuse early. Room for the browser's copy of the chat: 6 questions (500 characters)
  // and 6 answers (2000 characters), each character up to 3 bytes in JSON, comes to about 45 KB.
  app.use(express.json({ limit: "64kb" }));

  app.get("/api/health", (_req, res) => {
    const body: HealthResponse = { status: "ok", mode };
    res.json(body);
  });

  // ===== BAGIAN 5: Jalur POST /api/chat: validasi, batas pemakaian, panggil bot =====
  app.post("/api/chat", async (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json(
          errorResponse(
            "error",
            `Your message could not be read. Please send between 1 and ${MAX_MESSAGE_LENGTH} characters.`,
          ),
        );
      return;
    }

    // Limits come after validation and before any paid call. A message that looks like a crisis message is let through (its own small caps apply).
    let release = () => {};
    if (limiter) {
      const admission = limiter.admit(req.ip, { crisis: looksLikeCrisis(parsed.data.message) });
      if (!admission.ok) {
        res.set("Retry-After", String(admission.retryAfterSec));
        try {
          const refused = bot.limited
            ? await bot.limited(parsed.data.session_id, parsed.data.message, admission.reason)
            : { status: 429, body: errorResponse("rate_limited", limitText("en", admission.reason)) };
          res.status(429).json(refused.body);
        } catch {
          res.status(429).json(errorResponse("rate_limited", limitText("en", admission.reason)));
        }
        return;
      }
      release = admission.release;
    }

    try {
      const result = await bot.reply(parsed.data.session_id, parsed.data.message, parsed.data.history);
      res.status(result.status).json(result.body);
    } catch (e) {
      // A bot should answer with an error reply itself; this is the last safety net, so a crash never becomes an HTML page.
      console.error(`[chat] unexpected: ${e instanceof Error ? e.message : String(e)}`);
      res.status(500).json(errorResponse("error", "Something went wrong on our side. Please try again."));
    } finally {
      release();
    }
  });

  // ===== BAGIAN 6: Jalur POST /api/lead: validasi, batas, simpan lead =====
  app.post("/api/lead", async (req, res) => {
    const parsed = leadRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false });
      return;
    }
    let release = () => {};
    if (leadLimiter) {
      const admission = leadLimiter.admit(req.ip, { crisis: false });
      if (!admission.ok) {
        res.set("Retry-After", String(admission.retryAfterSec));
        res.status(429).json({ ok: false });
        return;
      }
      release = admission.release;
    }
    try {
      const d = parsed.data;
      const result = await leads.submit({ sessionId: d.session_id, name: d.name, email: d.email, language: d.language, website: d.website });
      res.status(result.status).json(result.body);
    } catch {
      // Nothing about the visitor goes into the log, not even the error text.
      console.error("[lead] unexpected error");
      res.status(500).json({ ok: false });
    } finally {
      release();
    }
  });

  // ===== BAGIAN 7: Jalur tak dikenal dan penanganan error =====
  app.use("/api", (_req, res) => {
    res.status(404).json(errorResponse("error", "This endpoint does not exist."));
  });

  // Body parser failures (broken JSON, oversized body) arrive here. They must return the
  // same JSON shape as every other reply instead of Express's default HTML error page.
  const onError: ErrorRequestHandler = (err: unknown, req, res, _next) => {
    const type = (err as { type?: string } | null)?.type;
    if (req.path === "/api/lead") {
      // The lead form has its own, tiny reply shape; it never gets a chat reply and never logs the body.
      const status = type === "entity.parse.failed" ? 400 : type === "entity.too.large" ? 413 : 500;
      if (status === 500) console.error("[lead] unexpected error");
      res.status(status).json({ ok: false });
      return;
    }
    if (type === "entity.parse.failed") {
      res.status(400).json(errorResponse("error", "The request was not valid JSON."));
      return;
    }
    if (type === "entity.too.large") {
      res.status(413).json(errorResponse("error", "The request was too large."));
      return;
    }
    console.error(err);
    res.status(500).json(errorResponse("error", "Something went wrong on our side. Please try again."));
  };
  app.use(onError);

  return app;
}
