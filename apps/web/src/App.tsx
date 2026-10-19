/* ============================================================================
 * PETA FILE
 * FILE    : apps/web/src/App.tsx
 * TUJUAN  : Layar obrolan. Memegang status percakapan dan bicara dengan API;
 *           komponen lain hanya menggambar. Obrolan juga disimpan di
 *           sessionStorage tab (storage.ts) sehingga reload menampilkannya
 *           lagi dengan id sesi yang sama. Tiap pertanyaan membawa pertukaran
 *           terakhir sebagai cadangan bila server lupa sesi. Obrolan dengan
 *           balasan krisis tidak pernah disimpan. 'New chat' menghapusnya.
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Impor
 *    2. Konstanta: balasan lebih tinggi dari 80% layar digulir ke awalnya
 *    3. Status obrolan (pesan, sesi, sibuk, mode) dan penunjuk
 *    4. Menyimpan obrolan ke tab dan mengecek mode server
 *    5. Menggulir ke isi terbaru (balasan panjang digulir ke awalnya)
 *    6. Pembuat id pesan
 *    7. ask: mengirim satu pertanyaan dan menambahkan balasan
 *    8. pick: kartu topik atau saran lanjutan dipilih
 *    9. retry: kirim ulang pertanyaan setelah error
 *    10. Mencatat hasil kartu kontak pada pesan
 *    11. newChat: hapus obrolan dan mulai sesi baru
 *    12. Tampilan: header, sambutan, daftar pesan, kotak input
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah cara layar menggulir: BAGIAN 5
 *    - Mengubah apa yang terjadi saat 'New chat': BAGIAN 10
 *    - Mengubah susunan layar: BAGIAN 11
 * ============================================================================ */

// ===== BAGIAN 1: Impor =====
/**
 * Chat screen. It owns the conversation state and talks to the API; the components
 * only draw what they are given.
 *
 * The chat is also kept in this tab's sessionStorage (see storage.ts), so a reload shows it again with the same
 * session id. Every question carries the last exchanges, which the server uses only if it has forgotten the session
 * (restart, an hour of silence). A chat with a crisis reply is never kept. "New chat" erases it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHealth, sendMessage } from "./api";
import { Composer } from "./components/Composer";
import { Header } from "./components/Header";
import { MessageRow } from "./components/MessageRow";
import { Typing } from "./components/Typing";
import { Welcome } from "./components/Welcome";
import { createSessionId } from "./ids";
import { buildHistory, clearChat, loadChat, saveChat } from "./storage";
import type { ChatMessage, LeadOutcome } from "./types";

// ===== BAGIAN 2: Konstanta: balasan lebih tinggi dari 80% layar digulir ke awalnya =====
/** A reply taller than this share of the visible area is scrolled to its start, not its end. */
const TALL_REPLY_SHARE = 0.8;

// ===== BAGIAN 3: Status obrolan (pesan, sesi, sibuk, mode) dan penunjuk =====
export function App() {
  // Read once, on the first render: the chat of this tab before a reload, if there was one.
  const [restored] = useState(loadChat);
  const [sessionId, setSessionId] = useState(() => restored?.sessionId ?? createSessionId());
  const [messages, setMessages] = useState<ChatMessage[]>(() => restored?.messages ?? []);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"mock" | "live" | null>(null);

  // Ids continue after the restored ones (m1, m2, ...), so a new message never reuses one.
  const counter = useRef(Math.max(0, ...(restored?.messages ?? []).map((m) => Number(/^m(\d+)$/.exec(m.id)?.[1] ?? 0))));
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Bumped on "New chat". A reply that arrives after a reset belongs to the old chat and is dropped.
  const epoch = useRef(0);
  const scrollRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ===== BAGIAN 4: Menyimpan obrolan ke tab dan mengecek mode server =====
  // Keep the tab's copy up to date. saveChat erases it when the chat is empty or contains a crisis reply.
  useEffect(() => {
    saveChat(sessionId, messages);
  }, [sessionId, messages]);

  useEffect(() => {
    void fetchHealth().then((health) => setMode(health?.mode ?? null));
  }, []);

  // ===== BAGIAN 5: Menggulir ke isi terbaru (balasan panjang digulir ke awalnya) =====
  // Keep the newest content in view. A short reply is scrolled to its end. A long reply is
  // scrolled to its start, so the reader begins at the first line instead of the last.
  // Reduced-motion users get an instant jump.
  useEffect(() => {
    const area = scrollRef.current;
    const last = listRef.current?.lastElementChild;
    if (!area || !(last instanceof HTMLElement)) return;

    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const isTall = last.offsetHeight > area.clientHeight * TALL_REPLY_SHARE;
    if (last.classList.contains("row-assistant") && isTall && !last.querySelector(".typing")) {
      const top = area.scrollTop + (last.getBoundingClientRect().top - area.getBoundingClientRect().top) - 16;
      area.scrollTo({ top, behavior });
    } else {
      area.scrollTo({ top: area.scrollHeight, behavior });
    }
  }, [messages, busy]);

  // ===== BAGIAN 6: Pembuat id pesan =====
  const nextId = () => `m${++counter.current}`;

  // ===== BAGIAN 7: ask: mengirim satu pertanyaan dan menambahkan balasan =====
  /** Sends one question. `addUserMessage` is false when retrying, because the question is already shown. */
  const ask = useCallback(
    async (text: string, addUserMessage: boolean) => {
      if (busy) return;
      const startedInEpoch = epoch.current;
      // Ids are created here, not inside the state updaters, because React may run updaters twice.
      if (addUserMessage) {
        const userMessage: ChatMessage = { id: nextId(), role: "user", text };
        setMessages((current) => [...current, userMessage]);
      }
      setBusy(true);

      // The chat as it stood before this question (a retried question is not in it: its failed reply is skipped).
      const response = await sendMessage(sessionId, text, buildHistory(messagesRef.current));
      if (epoch.current !== startedInEpoch) return;

      const reply: ChatMessage = { id: nextId(), role: "assistant", text: response.answer, response };
      setMessages((current) => [...current, reply]);
      setBusy(false);
    },
    [busy, sessionId],
  );

  // ===== BAGIAN 8: pick: kartu topik atau saran lanjutan dipilih =====
  /** A topic card or follow-up was chosen. Its button disappears, so focus moves to the chat area. */
  function pick(text: string) {
    scrollRef.current?.focus({ preventScroll: true });
    void ask(text, true);
  }

  // ===== BAGIAN 9: retry: kirim ulang pertanyaan setelah error =====
  function retry(errorMessageId: string) {
    const index = messages.findIndex((m) => m.id === errorMessageId);
    const question = messages[index - 1];
    if (index < 1 || question?.role !== "user") return;
    setMessages((current) => current.filter((m) => m.id !== errorMessageId));
    void ask(question.text, false);
  }

  // ===== BAGIAN 10: Mencatat hasil kartu kontak pada pesan =====
  function setLeadOutcome(messageId: string, outcome: LeadOutcome) {
    setMessages((current) => current.map((m) => (m.id === messageId ? { ...m, lead: outcome } : m)));
  }

  // ===== BAGIAN 11: newChat: hapus obrolan dan mulai sesi baru =====
  function newChat() {
    epoch.current += 1;
    clearChat();
    setMessages([]);
    setSessionId(createSessionId());
    setBusy(false);
  }

  // ===== BAGIAN 12: Tampilan: header, sambutan, daftar pesan, kotak input =====
  const started = messages.length > 0;
  const latestId = messages[messages.length - 1]?.id;

  return (
    <div className="app">
      <Header mode={mode} onNewChat={newChat} canReset={started} />

      <main className="chat" ref={scrollRef} tabIndex={-1}>
        <div className="chat-inner">
          {!started && <Welcome onPick={pick} disabled={busy} />}

          {/* The live region exists from the start, so screen readers announce what is added to it. */}
          <div className="messages" ref={listRef} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                isLatest={message.id === latestId}
                busy={busy}
                onPick={pick}
                onRetry={retry}
                sessionId={sessionId}
                onLead={setLeadOutcome}
              />
            ))}
            {busy && <Typing />}
          </div>
        </div>
      </main>

      <Composer onSend={(text) => void ask(text, true)} busy={busy} />
    </div>
  );
}
