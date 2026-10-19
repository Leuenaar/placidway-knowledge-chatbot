/* ============================================================================
 * FILE MAP
 * FILE    : apps/web/src/App.tsx
 * PURPOSE : Chat screen. Holds the conversation state and talks to the API;
 *           the other components only draw. The chat is also saved in the
 *           tab's sessionStorage (storage.ts), so a reload shows it again with
 *           the same session id. Each question carries the last exchanges as a
 *           backup in case the server forgot the session. A chat with a crisis
 *           reply is never saved. 'New chat' deletes it.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Imports
 *    2. Constant: a reply taller than 80% of the screen is scrolled to its
 *       start
 *    3. Chat state (messages, session, busy, mode) and pointers
 *    4. Save the chat in the tab and check the server mode
 *    5. Scroll to the newest content (a long reply is scrolled to its start)
 *    6. Message id builder
 *    7. ask: send one question and add the reply
 *    8. pick: a topic card or a follow-up suggestion is chosen
 *    9. retry: send the question again after an error
 *    10. Record the contact card result on the message
 *    11. newChat: delete the chat and start a new session
 *    12. View: header, welcome, message list, input box
 * IF ASKED TO CHANGE:
 *    - Change how the screen scrolls: PART 5
 *    - Change what happens on 'New chat': PART 10
 *    - Change the screen layout: PART 11
 * ============================================================================ */

// ===== PART 1: Imports =====
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

// ===== PART 2: Constant: a reply taller than 80% of the screen is scrolled to its start =====
/** A reply taller than this share of the visible area is scrolled to its start, not its end. */
const TALL_REPLY_SHARE = 0.8;

// ===== PART 3: Chat state (messages, session, busy, mode) and pointers =====
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

  // ===== PART 4: Save the chat in the tab and check the server mode =====
  // Keep the tab's copy up to date. saveChat erases it when the chat is empty or contains a crisis reply.
  useEffect(() => {
    saveChat(sessionId, messages);
  }, [sessionId, messages]);

  useEffect(() => {
    void fetchHealth().then((health) => setMode(health?.mode ?? null));
  }, []);

  // ===== PART 5: Scroll to the newest content (a long reply is scrolled to its start) =====
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

  // ===== PART 6: Message id builder =====
  const nextId = () => `m${++counter.current}`;

  // ===== PART 7: ask: send one question and add the reply =====
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

  // ===== PART 8: pick: a topic card or a follow-up suggestion is chosen =====
  /** A topic card or follow-up was chosen. Its button disappears, so focus moves to the chat area. */
  function pick(text: string) {
    scrollRef.current?.focus({ preventScroll: true });
    void ask(text, true);
  }

  // ===== PART 9: retry: send the question again after an error =====
  function retry(errorMessageId: string) {
    const index = messages.findIndex((m) => m.id === errorMessageId);
    const question = messages[index - 1];
    if (index < 1 || question?.role !== "user") return;
    setMessages((current) => current.filter((m) => m.id !== errorMessageId));
    void ask(question.text, false);
  }

  // ===== PART 10: Record the contact card result on the message =====
  function setLeadOutcome(messageId: string, outcome: LeadOutcome) {
    setMessages((current) => current.map((m) => (m.id === messageId ? { ...m, lead: outcome } : m)));
  }

  // ===== PART 11: newChat: delete the chat and start a new session =====
  function newChat() {
    epoch.current += 1;
    clearChat();
    setMessages([]);
    setSessionId(createSessionId());
    setBusy(false);
  }

  // ===== PART 12: View: header, welcome, message list, input box =====
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
