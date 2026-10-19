/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/components/Welcome.tsx
 * TUJUAN  : Layar pertama sebelum pesan pertama. Menyatakan tiga hal sebelum
 *           pengunjung mengetik: ini AI, ini hanya mencakup 7 halaman, dan
 *           apa yang tidak bisa dilakukan. Kartu topik menjawab 'apa yang
 *           boleh saya tanya?' dan mengirim pertanyaan nyata saat disentuh.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Daftar kartu topik (label dan pertanyaan)
 *    3. Komponen sambutan
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah atau menambah kartu topik: edit TOPICS (BAGIAN 2)
 *    - Mengubah teks sambutan: cari 'Ask about the ITC' (BAGIAN 3)
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/**
 * First screen, shown until the first message. It says three things before the user types
 * anything: what this is (an AI), what it covers (7 pages), and what it cannot do. The topic
 * cards answer the "what can I even ask?" question and send a real question when tapped.
 */
import { QUOTE_URL } from "@pwbot/shared";
import markUrl from "../assets/placidway-mark.png";

// ===== BAGIAN 2: Daftar kartu topik (label dan pertanyaan) =====
const TOPICS = [
  { label: "Cost", question: "How much does the treatment cost?" },
  { label: "Included", question: "What is included in the package?" },
  { label: "Length", question: "How long is the program?" },
  { label: "Afterwards", question: "What happens after the program?" },
];

// ===== BAGIAN 3: Komponen sambutan =====
export function Welcome({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <img className="welcome-mark" src={markUrl} alt="" width={56} height={56} />
      <h2 id="welcome-title">Ask about the ITC Immunity Therapy Center</h2>
      <p className="welcome-lead">I answer only from 7 PlacidWay pages about this clinic in Tijuana and alternative medicine prices.</p>
      <p className="welcome-lead">I'm an AI, so I can't give medical advice or book appointments.</p>

      <div className="topics">
        {TOPICS.map((topic) => (
          <button key={topic.question} type="button" className="topic" disabled={disabled} onClick={() => onPick(topic.question)}>
            <span className="topic-label" aria-hidden="true">
              {topic.label}
            </span>
            <span className="topic-question">{topic.question}</span>
          </button>
        ))}
      </div>

      <p className="welcome-alt">
        Prefer to talk to a person?{" "}
        <a href={QUOTE_URL} target="_blank" rel="noopener noreferrer">
          Request a free quote
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </section>
  );
}
