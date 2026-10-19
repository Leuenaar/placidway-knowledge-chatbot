/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/answer/config.ts
 * TUJUAN  : Pengaturan model penulis jawaban: kunci API (hanya dari
 *           environment server), nama model, tingkat effort jawaban dan
 *           effort rewrite. Pesan error tidak pernah memuat kunci.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Jenis error khusus dan tingkat effort
 *    2. Bentuk pengaturan dan model bawaan
 *    3. Membaca pengaturan dari environment
 *    4. Salinan pengaturan dengan effort lain
 * KALAU DIMINTA MENGUBAH:
 *    - Model bawaan (DEFAULT_MODEL, atau ANTHROPIC_MODEL di .env.api) (BAGIAN
 *      2)
 *    - Effort jawaban (medium) dan effort rewrite (low) (BAGIAN 3)
 * ============================================================================ */

// ===== BAGIAN 1: Jenis error khusus dan tingkat effort =====
/**
 * Settings for the model that writes the answers. The key comes from the server environment only
 * (.env.api), never from the browser, and error messages never contain it.
 */
export class AnswerError extends Error {}

/** Levels of the API's output_config.effort setting (from the Anthropic docs, 2026-10-18). Lower = less internal reasoning, faster, cheaper. */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

// ===== BAGIAN 2: Bentuk pengaturan dan model bawaan =====
export interface AnthropicConfig {
  apiKey: string;
  model: string;
  /** Only for API keys that are not tied to one workspace: the API then requires the workspace id in a header. */
  workspaceId?: string;
  /** How much the model may think when it writes the answer. Undefined = leave the API's own default (medium for Haiku 5.5). */
  effort?: Effort;
  /** The same, for the small step that rewrites the visitor's message into a search query. Undefined = the API's default. */
  rewriteEffort?: Effort;
}

/** Verified against the Anthropic models page on 2026-10-18. Change it with ANTHROPIC_MODEL, no code edit needed. */
export const DEFAULT_MODEL = "claude-haiku-5-5";

// ===== BAGIAN 3: Membaca pengaturan dari environment =====
export function loadAnthropicConfig(env: Record<string, string | undefined> = process.env): AnthropicConfig {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AnswerError("ANTHROPIC_API_KEY is not set (see .env.api.example)");
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const workspaceId = env.ANTHROPIC_WORKSPACE_ID?.trim();
  // ANTHROPIC_EFFORT is for the answer, ANTHROPIC_REWRITE_EFFORT for the rewrite step. "default" sends nothing (the API's own default).
  const effort = parseEffort(env.ANTHROPIC_EFFORT, "medium", "ANTHROPIC_EFFORT");
  const rewriteEffort = parseEffort(env.ANTHROPIC_REWRITE_EFFORT, "low", "ANTHROPIC_REWRITE_EFFORT");
  return { apiKey, model, ...(workspaceId ? { workspaceId } : {}), ...(effort ? { effort } : {}), ...(rewriteEffort ? { rewriteEffort } : {}) };
}

function parseEffort(raw: string | undefined, fallback: Effort, name: string): Effort | undefined {
  const value = (raw?.trim() || fallback).toLowerCase();
  if (value === "default") return undefined;
  if (!(EFFORT_LEVELS as readonly string[]).includes(value)) {
    throw new AnswerError(`${name} must be one of ${EFFORT_LEVELS.join(", ")} or default (got "${value}")`);
  }
  return value as Effort;
}

// ===== BAGIAN 4: Salinan pengaturan dengan effort lain =====
/** The same settings with a different effort, for a second kind of call (the rewrite step). */
export function withEffort(config: AnthropicConfig, effort: Effort | undefined): AnthropicConfig {
  const { effort: _old, rewriteEffort: _rw, ...rest } = config;
  return effort ? { ...rest, effort } : rest;
}
