/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/leads/index.ts
 * PURPOSE : Exit door of the leads module (contact card).
 * ============================================================================ */

export { LEAD_RETENTION_DAYS, createLeadStore, createMemoryLeadStore, listLeads, purgeOldLeads, startLeadPurgeSchedule, type LeadRow, type LeadStore, type NewLead } from "./store";
export { createLeadService, type LeadInput, type LeadService } from "./service";
