/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/leads/index.ts
 * TUJUAN  : Pintu keluar modul leads (kartu kontak).
 * ============================================================================ */

export { LEAD_RETENTION_DAYS, createLeadStore, createMemoryLeadStore, listLeads, purgeOldLeads, startLeadPurgeSchedule, type LeadRow, type LeadStore, type NewLead } from "./store";
export { createLeadService, type LeadInput, type LeadService } from "./service";
