/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/components/FollowUps.tsx
 * PURPOSE : Suggested next questions under the newest reply. They are sent as
 *           soon as they are chosen. The server picks them from a fixed list,
 *           so every suggestion is a question the bot can answer.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Follow-up suggestions component (question chips)
 * IF ASKED TO CHANGE:
 *    - Change the 'Ask next' heading: search for 'Ask next' (PART 1)
 * ============================================================================ */

// ===== PART 1: Follow-up suggestions component (question chips) =====
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
