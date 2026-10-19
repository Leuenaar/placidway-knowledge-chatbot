/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/components/Composer.tsx
 * TUJUAN  : Kotak input pesan. Enter mengirim, Shift+Enter baris baru. Batas
 *           panjang sama dengan API. Satu baris catatan di bawah kotak
 *           menyebut ini AI dan bukan saran medis, tempat orang melihat tepat
 *           sebelum mengetik.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Tinggi maksimal kotak input
 *    3. Status dan penunjuk kotak input
 *    4. Menyesuaikan tinggi kotak
 *    5. Kirim pesan
 *    6. Penangan form
 *    7. Penangan tombol: Enter kirim, Shift+Enter baris baru
 *    8. Tampilan: kotak, tombol Send, penghitung, catatan AI
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah catatan di bawah kotak: cari 'AI assistant. Answers come
 *      from' (BAGIAN 8)
 *    - Mengubah placeholder: cari 'Type your question' (BAGIAN 8)
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/**
 * The message input. Enter sends, Shift+Enter adds a new line. The length limit matches
 * the API, so users see the limit before the server has to reject anything. A one-line
 * note under the box says this is an AI and not medical advice: the place where people
 * look right before they type, which is where disclaimers are actually read.
 */
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@pwbot/shared";
import { SendIcon } from "./Icons";

// ===== BAGIAN 2: Tinggi maksimal kotak input =====
const MAX_TEXTAREA_HEIGHT_PX = 140;

// ===== BAGIAN 3: Status dan penunjuk kotak input =====
export function Composer({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ===== BAGIAN 4: Menyesuaikan tinggi kotak =====
  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }

  // ===== BAGIAN 5: Kirim pesan =====
  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
    // Reset the height after React has cleared the text.
    requestAnimationFrame(resize);
  }

  // ===== BAGIAN 6: Penangan form =====
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  // ===== BAGIAN 7: Penangan tombol: Enter kirim, Shift+Enter baris baru =====
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing is true while an IME (Arabic, Chinese, Japanese) is still building a word.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  // ===== BAGIAN 8: Tampilan: kotak, tombol Send, penghitung, catatan AI =====
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
