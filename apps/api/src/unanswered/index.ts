/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/unanswered/index.ts
 * PURPOSE : Exit door of the unanswered module (log of unanswered questions).
 * ============================================================================ */

export { MAX_QUESTION_LENGTH, maskPersonalData, questionForLog } from "./mask";
export { PURGE_INTERVAL_MS, REASONS, createUnansweredLog, listRecent, purgeOld, startPurgeSchedule, type Reason, type UnansweredLog, type UnansweredRow } from "./log";
