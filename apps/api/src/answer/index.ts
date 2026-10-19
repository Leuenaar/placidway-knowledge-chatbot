/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/answer/index.ts
 * TUJUAN  : Pintu keluar modul answer: satu tempat untuk mengambil klien
 *           model, pembuat jawaban, prompt, aturan, dan pembicara obrolan
 *           ringan.
 * ============================================================================ */

export { createAnthropicClient, type Completion, type ModelClient } from "./anthropic";
export { AnswerError, DEFAULT_MODEL, EFFORT_LEVELS, loadAnthropicConfig, withEffort, type AnthropicConfig, type Effort } from "./config";
export { extractJson } from "./json";
export { createAnswerer, sourcesFor, type AnswerResult, type Answerer } from "./answerer";
export { CARE_NOTE, PROMPT_VERSION, REMINDER, buildSystemPrompt, buildUserMessage, type AnswerContext } from "./prompt";
export { DEFAULT_RULES_DIR, RULE_GROUPS, loadRules, type Rules } from "./rules";
export { formatConversation, neutralize } from "./text";
export { SMALL_TALK_SYSTEM, createSmallTalker, type SmallTalker } from "./small-talk";
