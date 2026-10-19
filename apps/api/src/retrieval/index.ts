/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/retrieval/index.ts
 * PURPOSE : Exit door of the retrieval module (search for page pieces).
 * ============================================================================ */

export { dollarAmounts, normalizeNumbers } from "./amounts";
export { DEFAULT_EXPAND_PAGES, DEFAULT_RETRIEVE_COUNT, loadDbConfig, loadExpandPages, loadRetrieveCount, RetrievalError, type DbConfig } from "./config";
export { fuseHits, gatherChunks, mergeHitsAndPages, pickPages, titlePages, type GatherOptions } from "./expand";
export { createRetriever, DEFAULT_RESULTS, MAX_RESULTS, MIN_RESULTS, type RetrievedChunk, type Retriever } from "./retriever";
