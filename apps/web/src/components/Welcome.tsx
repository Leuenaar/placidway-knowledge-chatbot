/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/components/Welcome.tsx
 * PURPOSE : First screen before the first message. It states three things
 *           before the visitor types: this is an AI, it covers only 7 pages,
 *           and what it cannot do. The topic cards answer 'what may I ask?'
 *           and send a real question when touched.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. List of topic cards (label and question)
 *    3. Welcome component
 * IF ASKED TO CHANGE:
 *    - Change or add the topic cards: edit TOPICS (PART 2)
 *    - Change the welcome text: search for 'Ask about the ITC' (PART 3)
 * ============================================================================ */

// ===== PART 1: Imports =====
/**
 * First screen, shown until the first message. It says three things before the user types
 * anything: what this is (an AI), what it covers (7 pages), and what it cannot do. The topic
 * cards answer the "what can I even ask?" question and send a real question when tapped.
 */
import { QUOTE_URL } from "@pwbot/shared";
import markUrl from "../assets/placidway-mark.png";

// ===== PART 2: List of topic cards (label and question) =====
const TOPICS = [
  { label: "Cost", question: "How much does the treatment cost?" },
  { label: "Included", question: "What is included in the package?" },
  { label: "Length", question: "How long is the program?" },
  { label: "Afterwards", question: "What happens after the program?" },
];

// ===== PART 3: Welcome component =====
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
