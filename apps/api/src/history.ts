/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/history.ts
 * PURPOSE : Conversation history in the memory of the server process (never in
 *           the database, because visitors can type health data). It also
 *           keeps per-session flags: care mode, the disclaimer was shown, the
 *           lead card was offered, the last language.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Data type of one chat turn
 *    2. Flags per session (care, disclaimer, lead, language)
 *    3. Options and contract of the history storage
 *    4. In-memory implementation: message limit, expiry, usage order
 * IF ASKED TO CHANGE:
 *    - Number of remembered messages (12), expiry time (1 hour), maximum
 *      sessions (1000) (PART 4)
 *    - Add a new per-session flag (PART 2)
 * ============================================================================ */

// ===== PART 1: Data type of one chat turn =====
/**
 * Conversation history, kept in the memory of the server process only. Nothing is written to the database, because
 * visitors may type personal health details. A restart forgets everything, which is the intended behaviour.
 *
 * Limits keep memory bounded: a session keeps its last few messages, expires after an hour without a new message,
 * and when too many sessions exist the oldest one is dropped.
 */
export interface Turn {
  role: "visitor" | "assistant";
  text: string;
}

// ===== PART 2: Flags per session (care, disclaimer, lead, language) =====
/** Small per-session facts the server decides with. Forgotten together with the turns. */
export interface SessionFlags {
  /** A crisis message was seen in this session. Stays on until the session ends (see the README, "care mode"). */
  care: boolean;
  /** The full disclaimer was already shown in this session. */
  disclaimerShown: boolean;
  /** The lead card (name and email for a quote) was already offered in this session. It is offered at most once. */
  leadOffered?: boolean;
  /** Language of the latest message, so even an error message can use it. */
  languageCode?: string;
  languageName?: string;
}

// ===== PART 3: Options and contract of the history storage =====
export interface HistoryOptions {
  maxMessages?: number;
  ttlMs?: number;
  maxSessions?: number;
  /** Replaceable in tests. */
  now?: () => number;
}

export interface HistoryStore {
  get(sessionId: string): Turn[];
  /** Record one exchange: what the visitor wrote and what the bot answered. */
  add(sessionId: string, visitorText: string, assistantText: string): void;
  /**
   * Give a session the earlier turns the browser sent, but only when the server has none for it (restart, expiry).
   * Returns true when the turns were taken. Never touches the flags. At most maxMessages are kept.
   */
  seed(sessionId: string, turns: Turn[]): boolean;
  /** The flags of a session (all off for an unknown or expired one). */
  flags(sessionId: string): SessionFlags;
  /** Change some flags. Creates the session if it does not exist yet. */
  setFlags(sessionId: string, change: Partial<SessionFlags>): void;
}

// ===== PART 4: In-memory implementation: message limit, expiry, usage order =====
export function createHistoryStore({ maxMessages = 12, ttlMs = 60 * 60 * 1000, maxSessions = 1000, now = Date.now }: HistoryOptions = {}): HistoryStore {
  interface Session {
    turns: Turn[];
    flags: SessionFlags;
    touched: number;
  }
  const sessions = new Map<string, Session>();

  const live = (id: string) => {
    const s = sessions.get(id);
    if (!s) return undefined;
    if (now() - s.touched > ttlMs) {
      sessions.delete(id);
      return undefined;
    }
    return s;
  };

  /** The live session, or a new one (after dropping expired ones, and the oldest if the store is full). */
  const ensure = (id: string): Session => {
    let s = live(id);
    if (!s) {
      // Drop expired sessions first, then the oldest one if still full. Map keeps insertion order.
      for (const [k, v] of sessions) if (now() - v.touched > ttlMs) sessions.delete(k);
      while (sessions.size >= maxSessions) {
        const oldest = sessions.keys().next().value;
        if (oldest === undefined) break;
        sessions.delete(oldest);
      }
      s = { turns: [], flags: { care: false, disclaimerShown: false }, touched: now() };
    }
    return s;
  };

  /** Mark the session as just used. Re-inserting makes the map order follow the last activity (the oldest entry is the least recently used). */
  const touch = (id: string, s: Session) => {
    s.touched = now();
    sessions.delete(id);
    sessions.set(id, s);
  };

  return {
    get: (id) => [...(live(id)?.turns ?? [])],
    add(id, visitorText, assistantText) {
      const s = ensure(id);
      s.turns.push({ role: "visitor", text: visitorText }, { role: "assistant", text: assistantText });
      if (s.turns.length > maxMessages) s.turns.splice(0, s.turns.length - maxMessages);
      touch(id, s);
    },
    seed(id, turns) {
      if (turns.length === 0 || (live(id)?.turns.length ?? 0) > 0) return false;
      const s = ensure(id);
      s.turns = turns.slice(-maxMessages).map((t) => ({ role: t.role, text: t.text }));
      touch(id, s);
      return true;
    },
    flags: (id) => ({ ...(live(id)?.flags ?? { care: false, disclaimerShown: false }) }),
    setFlags(id, change) {
      const s = ensure(id);
      s.flags = { ...s.flags, ...change };
      touch(id, s);
    },
  };
}
