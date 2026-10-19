/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/components/MessageRow.tsx
 * TUJUAN  : Satu pesan dalam percakapan. Pesan pengunjung adalah satu
 *           gelembung di kanan. Pesan asisten adalah gelembung di kiri
 *           diikuti hal-hal yang menempel padanya: disclaimer (bila server
 *           bilang waktunya), sumber, tombol penawaran, kartu kontak, dan
 *           pada balasan terbaru saja saran pertanyaan lanjutan. Semuanya
 *           digerakkan oleh field API.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Komponen MessageRow dan propertinya
 *    3. Pesan pengunjung (gelembung kanan)
 *    4. Pesan asisten: gelembung, tombol coba lagi, disclaimer, sumber, tombol penawaran, kartu kontak, saran lanjutan
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah teks tombol penawaran: cari 'Request a free quote' (BAGIAN 4)
 *    - Mengubah tombol coba lagi: cari 'Try again' (BAGIAN 4)
 *    - Mengubah kapan kartu kontak tampil: cari 'offer_lead' (BAGIAN 4)
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/**
 * One message in the conversation. A user message is a single bubble on the right.
 * An assistant message is a bubble on the left, followed by the things that belong to it:
 * the disclaimer (when the server says it is due), the sources, a quote button and, on the
 * latest reply only, suggested follow-up questions. All of them are driven by API fields.
 */
import { DISCLAIMER_TEXT } from "@pwbot/shared";
import markUrl from "../assets/placidway-mark.png";
import type { ChatMessage, LeadOutcome } from "../types";
import { FollowUps } from "./FollowUps";
import { LeadCard } from "./LeadCard";
import { ExternalIcon } from "./Icons";
import { RichText } from "./RichText";
import { SourcesList } from "./SourcesList";

// ===== BAGIAN 2: Komponen MessageRow dan propertinya =====
export function MessageRow({
  message,
  isLatest,
  busy,
  onPick,
  onRetry,
  sessionId,
  onLead,
}: {
  message: ChatMessage;
  /** True for the newest message. Only then are follow-ups and the retry button offered. */
  isLatest: boolean;
  busy: boolean;
  onPick: (text: string) => void;
  onRetry: (messageId: string) => void;
  sessionId: string;
  /** The contact card of this message was sent or declined. */
  onLead: (messageId: string, outcome: LeadOutcome) => void;
}) {

  // ===== BAGIAN 3: Pesan pengunjung (gelembung kanan) =====
  const { role, text, response } = message;

  if (role === "user") {
    return (
      <div className="row row-user" data-message-id={message.id}>
        <div className="bubble bubble-user">
          <span className="sr-only">You:</span>
          {/* The user's own words are shown exactly as typed: no bold, no lists. */}
          <div className="text">
            <p dir="auto" className="plain">
              {text}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ===== BAGIAN 4: Pesan asisten: gelembung, tombol coba lagi, disclaimer, sumber, tombol penawaran, kartu kontak, saran lanjutan =====
  const isAlert = response?.kind === "error" || response?.kind === "rate_limited";

  return (
    <div className="row row-assistant" data-message-id={message.id}>
      <img className="avatar" src={markUrl} alt="" width={32} height={32} />
      <div className="col">
        <div className={`bubble bubble-assistant${isAlert ? " bubble-alert" : ""}`}>
          <span className="sr-only">Assistant:</span>
          <div className="text">
            <RichText text={text} />
          </div>
          {isAlert && isLatest && (
            <button type="button" className="retry" disabled={busy} onClick={() => onRetry(message.id)}>
              Try again
            </button>
          )}
        </div>

        {response?.show_disclaimer && (
          <p className="note" role="note">
            {response.disclaimer_text || DISCLAIMER_TEXT}
          </p>
        )}

        {response && <SourcesList sources={response.sources} />}

        {response?.quote_url && (
          <a className="cta" href={response.quote_url} target="_blank" rel="noopener noreferrer">
            Request a free quote
            <ExternalIcon />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}

        {response?.offer_lead && response.lead_texts && (
          <LeadCard
            texts={response.lead_texts}
            sessionId={sessionId}
            outcome={message.lead}
            onOutcome={(outcome) => onLead(message.id, outcome)}
          />
        )}

        {isLatest && !busy && response && <FollowUps questions={response.follow_ups} onPick={onPick} disabled={busy} />}
      </div>
    </div>
  );
}
