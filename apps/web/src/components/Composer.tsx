/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/components/Composer.tsx
 * PURPOSE : The message input box. Enter sends, Shift+Enter adds a new line.
 *           The length limit is the same as the API. A note line under the box
 *           says this is an AI and not medical advice, where people look just
 *           before typing.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. Maximum height of the input box
 *    3. State and pointers of the input box
 *    4. Adjust the box height
 *    5. Send a message
 *    6. Form handler
 *    7. Key handler: Enter sends, Shift+Enter adds a new line
 *    8. View: box, Send button, counter, AI note
 * IF ASKED TO CHANGE:
 *    - Change the note under the box: search for 'AI assistant. Answers come
 *      from' (PART 8)
 *    - Change the placeholder: search for 'Type your question' (PART 8)
 * ============================================================================ */

// ===== PART 1: Imports =====
/**
 * The message input. Enter sends, Shift+Enter adds a new line. The length limit matches
 * the API, so users see the limit before the server has to reject anything. A one-line
 * note under the box says this is an AI and not medical advice: the place where people
 * look right before they type, which is where disclaimers are actually read.
 */
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@pwbot/shared";
import { SendIcon } from "./Icons";

// ===== PART 2: Maximum height of the input box =====
const MAX_TEXTAREA_HEIGHT_PX = 140;

// ===== PART 3: State and pointers of the input box =====
export function Composer({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ===== PART 4: Adjust the box height =====
  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }

  // ===== PART 5: Send a message =====
  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
    // Reset the height after React has cleared the text.
    requestAnimationFrame(resize);
  }

  // ===== PART 6: Form handler =====
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  // ===== PART 7: Key handler: Enter sends, Shift+Enter adds a new line =====
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing is true while an IME (Arabic, Chinese, Japanese) is still building a word.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  // ===== PART 8: View: box, Send button, counter, AI note =====
  const nearLimit = value.length >= MAX_MESSAGE_LENGTH * 0.8;

  return (
    <section className="composer-wrap" aria-label="Write a message">
      <div className="composer-inner">
        <form className="composer" onSubmit={handleSubmit}>
          <label htmlFor="message-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="message-input"
            ref={textareaRef}
            rows={1}
            dir="auto"
            value={value}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Type your question"
            aria-describedby="composer-note"
            onChange={(event) => {
              setValue(event.target.value);
              resize();
            }}
            onKeyDown={handleKeyDown}
          />
          <button type="submit" className="send" disabled={busy || value.trim().length === 0}>
            <span className="btn-label">Send</span>
            <SendIcon />
          </button>
          {nearLimit && (
            <span className="counter" aria-live="polite">
              {value.length}/{MAX_MESSAGE_LENGTH}
            </span>
          )}
        </form>
        <p id="composer-note" className="composer-note">
          AI assistant. Answers come from PlacidWay pages and are not medical advice.
        </p>
      </div>
    </section>
  );
}
