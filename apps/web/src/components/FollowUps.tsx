/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/components/FollowUps.tsx
 * TUJUAN  : Saran pertanyaan berikutnya di bawah balasan terbaru. Langsung
 *           terkirim saat dipilih. Server memilihnya dari daftar tetap, jadi
 *           setiap saran adalah pertanyaan yang bisa dijawab bot.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Komponen saran lanjutan (chip pertanyaan)
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah judul 'Ask next': cari 'Ask next' (BAGIAN 1)
 * ============================================================================ */

// ===== BAGIAN 1: Komponen saran lanjutan (chip pertanyaan) =====
/**
 * Suggested next questions under the latest reply. They send immediately when chosen.
 * The server picks them from a fixed list, so each one is a question the bot can answer.
 */
export function FollowUps({
  questions,
  onPick,
  disabled,
}: {
  questions: string[];
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  if (questions.length === 0) return null;

  return (
    <div className="followups">
      <p className="followups-title">Ask next</p>
      <div className="chips">
        {questions.map((question) => (
          <button key={question} type="button" className="chip" dir="auto" disabled={disabled} onClick={() => onPick(question)}>
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
