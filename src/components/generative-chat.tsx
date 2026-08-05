"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Renderer } from "@openuidev/react-lang";
import { library } from "@/lib/library";
import { createToolProvider } from "@/lib/tools";
import { DecryptText } from "@/components/decrypt-text";

// Module-scope toolProvider — built once, shared by every Renderer instance.
// A new object per render would thrash the query manager (it keys memoization
// on provider identity). Null here would make Query() bail silently.
const toolProvider = createToolProvider();

// ── Types ────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** What the bubble shows, if different from `content` (sent to the model).
   *  Drill-down messages append the clicked entity's real data to `content`
   *  so the model can answer from it directly instead of re-querying and
   *  guessing which result matches — but that JSON has no business appearing
   *  in the transcript, so the bubble shows `display` instead. */
  display?: string;
}

export interface UseGenerativeChat {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (v: string) => void;
  sendMessage: (text?: string, context?: Record<string, unknown>) => void;
  /** Re-run generation for the assistant message at `assistantIndex`,
   *  discarding it and everything after, and resending the same messages
   *  up to (and including) the user message that prompted it. For "that
   *  came back wrong, try again" without retyping the question. */
  regenerate: (assistantIndex: number) => void;
  /** Edit the user message at `userIndex` to `newText` and resend it,
   *  discarding that message and everything after. Only meaningful for a
   *  plain user message (no drill-down context riding along). */
  editAndResend: (userIndex: number, newText: string) => void;
  stop: () => void;
  clear: () => void;
  isStreaming: boolean;
  streamedResponse: string;
  error: string | null;
  /** Tool/Mutation failures from the settled Renderer's onError — previously
   *  never wired up, so a failed mutation (a bad id, a service rejecting the
   *  request) was invisible: the button just did nothing, with no feedback
   *  anywhere. Separate from `error` (SSE/transport failures only). */
  toolError: string | null;
  setToolError: (msg: string | null) => void;
}

// ── Streaming chat hook ──────────────────────────────────────

/** Read a persisted conversation. Guarded for SSR (no `window`) and for a
 *  corrupt/foreign value in the slot (falls back to empty, never throws). */
function loadPersisted(storageKey: string | undefined): ChatMessage[] {
  if (!storageKey || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * `storageKey` persists the conversation to localStorage (undefined = no
 * persistence, in-memory only, the prior behavior). Every message this app
 * has ever generated lived only in React state — closing the tab, a hard
 * refresh, or any unrecoverable render error wiped the whole conversation
 * with nothing to fall back to. This does not explain why the composer would
 * disappear while the tab stays open, but it means that whatever the actual
 * cause turns out to be, a reload recovers the conversation instead of
 * starting over blank.
 */
export function useGenerativeChat(storageKey?: string): UseGenerativeChat {
  // Always starts empty — server and client's first render must match, or
  // React discards the server-rendered markup and re-renders client-side
  // (a hydration mismatch, with its own console warning and a visible
  // flash). Loading straight into useState's initializer would do exactly
  // that: the server has no `window` and always produces [], but the client
  // pass would read localStorage and could produce a populated array on that
  // very first render. Loading in an effect below (client-only, runs after
  // hydration) keeps the first paint identical on both sides.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Real state, not a ref: on mount this and `messages` are set together in
  // the same effect, so React batches them into one re-render. A ref would
  // flip to true synchronously mid-effect, before the batched setMessages
  // applies — the persist-effect below (same commit, same flush) would then
  // see hydrated=true paired with the still-stale empty `messages`, and
  // briefly write [] over a real saved conversation before the correct
  // value landed a tick later. As state, the persist-effect simply doesn't
  // run at all until BOTH are applied together, so there's nothing to race.
  const [hydrated, setHydrated] = useState(false);

  // One-time load, right after mount. Wrapped rather than called directly:
  // this sets state, and calling a state-setting function synchronously in
  // an effect body is what react-hooks flags as a cascading-render risk —
  // same pattern used for the identical reason in dashboard.tsx's
  // useWorldData(). The scheduling is equivalent either way.
  useEffect(() => {
    void (async () => {
      const loaded = loadPersisted(storageKey);
      if (loaded.length > 0) setMessages(loaded);
      setHydrated(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change. try/catch: a full or disabled localStorage
  // should degrade to "conversation won't survive a reload", not throw.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined" || !hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // quota exceeded or storage disabled — silently in-memory-only for this session
    }
  }, [messages, storageKey, hydrated]);

  // Shared by sendMessage, regenerate, and editAndResend: given the full
  // messages array ENDING in the user message to answer, replace it in
  // state, then POST + stream the reply. The three callers differ only in
  // how they build that array (append a new message; truncate back to a
  // prior user message; truncate and replace one) — the fetch/stream/error
  // handling is identical either way, so it lives here once.
  const runGeneration = useCallback(
    (nextMessages: ChatMessage[]) => {
      setMessages(nextMessages);
      setInputValue("");
      setError(null);
      setStreamedResponse("");
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(body || `HTTP ${res.status}`);
          }
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let buffer = "";
          let accumulated = "";

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              // Handle both SSE ("data: {...}") and NDJSON ({...}) formats
              const payload = trimmed.startsWith("data:")
                ? trimmed.slice(5).trim()
                : trimmed;
              if (!payload || payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload);
                const delta: string =
                  json?.choices?.[0]?.delta?.content ?? "";
                if (delta) {
                  accumulated += delta;
                  setStreamedResponse(accumulated);
                }
              } catch {
                // Partial JSON across chunk boundary — skip, next iteration completes it
              }
            }
          }

          // A stream can complete with nothing in `content`: some models put
          // everything in `reasoning_content` (which is deliberately ignored
          // here), and a refusal or filter can end the stream empty. Pushing
          // that as a message renders a blank bubble with no explanation, which
          // is indistinguishable from a UI bug. Surface it as an error instead.
          if (!accumulated.trim()) {
            setError(
              "The model returned no dashboard code. Try rephrasing, or naming the adapters you want.",
            );
            setStreamedResponse("");
            return;
          }

          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: accumulated },
          ]);
          setStreamedResponse("");
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Stream failed");
        })
        .finally(() => {
          setIsStreaming(false);
          abortRef.current = null;
        });
    },
    [],
  );

  const sendMessage = useCallback(
    (text?: string, context?: Record<string, unknown>) => {
      const query = (text ?? inputValue).trim();
      if (!query || isStreaming) return;

      // Drill-down (a click's entity data) rides along in `content`, which is
      // what reaches the model; `display` keeps the bubble reading as the
      // plain "Show details for X" the user actually saw happen.
      const hasContext = context && Object.keys(context).length > 0;
      const userMsg: ChatMessage = hasContext
        ? { role: "user", content: `${query}\n\n[Data already fetched for this entity — use it directly, do not call Query() again: ${JSON.stringify(context)}]`, display: query }
        : { role: "user", content: query };
      runGeneration([...messages, userMsg]);
    },
    [inputValue, isStreaming, messages, runGeneration],
  );

  const regenerate = useCallback(
    (assistantIndex: number) => {
      if (isStreaming) return;
      const truncated = messages.slice(0, assistantIndex);
      const last = truncated[truncated.length - 1];
      if (!last || last.role !== "user") return;
      runGeneration(truncated);
    },
    [messages, isStreaming, runGeneration],
  );

  const editAndResend = useCallback(
    (userIndex: number, newText: string) => {
      if (isStreaming) return;
      const trimmed = newText.trim();
      if (!trimmed) return;
      const before = messages.slice(0, userIndex);
      runGeneration([...before, { role: "user", content: trimmed }]);
    },
    [messages, isStreaming, runGeneration],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setStreamedResponse("");
    setError(null);
    setToolError(null);
    if (storageKey && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // storage disabled — nothing to clean up
      }
    }
  }, [storageKey]);

  return {
    messages,
    inputValue,
    setInputValue,
    sendMessage,
    regenerate,
    editAndResend,
    stop,
    clear,
    isStreaming,
    streamedResponse,
    error,
    toolError,
    setToolError,
  };
}

// ── Streaming render ─────────────────────────────────────────

/**
 * The dashboard mid-generation.
 *
 * The WebGL DecryptReveal is gone — it alone among the seven components has no
 * no-content branch, so with HTML-in-Canvas disabled it had nothing to
 * scramble. The DOM DecryptText covers the same idea for text, and while a
 * response is streaming the honest signal is simply that tokens are arriving,
 * which the role indicator already carries.
 *
 * Kept as its own component because the streaming Renderer takes different
 * props from the settled one — isStreaming, and no onAction, since a partial
 * tree has nothing stable to click.
 */
function StreamingRender({ response }: { response: string }) {
  return (
    <Renderer
      response={response}
      library={library}
      toolProvider={toolProvider}
      isStreaming={true}
    />
  );
}

// ── GenerativeChat component ─────────────────────────────────

/**
 * The home page, laid out as a conversation.
 *
 * Two states, one component. With no messages the composer sits centred in the
 * page under a title — the whole screen is an invitation to type, which is the
 * point of a product whose entire interface is generated from a sentence. Once
 * a conversation starts the composer docks to the bottom and the thread takes
 * the space, because from then on the content is what matters.
 *
 * Generated dashboards render inline in the thread as real components, not as
 * code blocks or images: a panel in the transcript is the same live panel a
 * world view would show, drill-down and all.
 *
 * `chat` is owned by the caller (via useGenerativeChat()), not created here.
 * It used to be created here, which meant the conversation lived and died
 * with this component's mount — navigating to any other world (clicking
 * "Media" in the sidebar to check something, say) unmounted it, and coming
 * back to Home started a blank conversation with no warning that anything
 * had been lost. The hook now lives in the page-level component that never
 * unmounts across world navigation; this component just renders it.
 */
export function GenerativeChat({ chat, subtitle }: { chat: UseGenerativeChat; subtitle?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const empty = chat.messages.length === 0 && !chat.isStreaming;
  // Which message index (if any) is mid-edit, and its draft text — local UI
  // state, not part of the hook: nothing outside this component cares while
  // it's being typed, only once "Resend" commits it via editAndResend.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  // Which message index was just copied, to flash "Copied" briefly instead
  // of leaving a permanently-changed label with no way to tell it happened.
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyMessage = useCallback((index: number, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 1500);
    }).catch(() => {
      // Clipboard API unavailable/denied — no fallback needed, this is a
      // convenience action, not a critical path.
    });
  }, []);

  const startEdit = useCallback((index: number, text: string) => {
    setEditingIndex(index);
    setEditText(text);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditText("");
  }, []);

  const commitEdit = useCallback(
    (index: number) => {
      chat.editAndResend(index, editText);
      setEditingIndex(null);
      setEditText("");
    },
    [chat, editText],
  );

  // Follow the stream. Only when already near the bottom, so scrolling up to
  // read an earlier panel is not yanked back every time a token lands.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [chat.streamedResponse, chat.messages.length]);

  // The textarea grows with its content instead of scrolling internally, up to
  // a cap — a one-line box makes people write one-line prompts.
  const autoSize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(autoSize, [chat.inputValue, autoSize]);

  const composer = (
    <div className={`chat-composer${chat.isStreaming ? " is-streaming" : ""}`}>
      <textarea
        ref={inputRef}
        rows={1}
        value={chat.inputValue}
        onChange={(e) => chat.setInputValue(e.target.value)}
        placeholder="Describe the dashboard you want to see…"
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter is a newline. Standard for chat inputs,
          // and the reason the textarea needs to auto-size at all.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!chat.isStreaming) chat.sendMessage();
          }
        }}
        aria-label="Describe the dashboard you want to see"
      />
      <div className="chat-composer-bar">
        <div className="chat-composer-hint">
          <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
        </div>
        {chat.isStreaming ? (
          <button className="chat-send is-stop" onClick={chat.stop} aria-label="Stop generating">
            <span className="chat-stop-glyph" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button
            className="chat-send"
            onClick={() => chat.sendMessage()}
            disabled={!chat.inputValue.trim()}
            aria-label="Send"
          >
            Generate <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={`chat-shell${empty ? " is-empty" : ""}`}>
      <div className="chat-scroll" ref={scrollRef}>
        {empty ? (
          <div className="chat-welcome">
            <div className="chat-welcome-mark" aria-hidden="true">◉</div>
            <h1>
              <DecryptText text="What do you want to see?" duration={1100} />
            </h1>
            <p className="chat-welcome-sub">
              {subtitle ?? "Describe a dashboard in plain language and it is generated live."}
            </p>

            {composer}

          </div>
        ) : (
          <div className="chat-thread">
            {chat.messages.map((msg, i) => {
              // A drill-down message's `display` is a synthesized "Show
              // details for X" — there's no typed text behind it to hand
              // back into a textarea, so editing only applies to a message
              // the user actually wrote themselves.
              const isEditableUser = msg.role === "user" && msg.display == null;
              const isEditing = editingIndex === i;
              return (
                <article key={i} className={`chat-msg chat-msg-${msg.role}`}>
                  <div className="chat-msg-role">
                    {msg.role === "user" ? "You" : "Visual OS"}
                  </div>
                  {isEditing ? (
                    <div className="chat-edit">
                      <textarea
                        className="chat-edit-textarea"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (editText.trim()) commitEdit(i);
                          } else if (e.key === "Escape") {
                            cancelEdit();
                          }
                        }}
                        autoFocus
                        rows={2}
                      />
                      <div className="chat-edit-actions">
                        <button className="chat-msg-action" onClick={cancelEdit}>Cancel</button>
                        <button
                          className="chat-msg-action is-primary"
                          onClick={() => commitEdit(i)}
                          disabled={!editText.trim()}
                        >
                          Resend
                        </button>
                      </div>
                    </div>
                  ) : msg.role === "assistant" ? (
                    <div className="chat-rendered">
                      <Renderer
                        response={msg.content}
                        library={library}
                        toolProvider={toolProvider}
                        isStreaming={false}
                        // Drill-down: clicking a row/card/node sends its label
                        // back as a follow-up, along with whatever data that
                        // component already had for it (event.params — see
                        // entityParams() in visual/components/index.tsx), so
                        // the model can answer from real data instead of
                        // re-querying and guessing which result matches. Only
                        // on settled messages — a live stream is still arriving.
                        onAction={(event) => chat.sendMessage(event.humanFriendlyMessage, event.params)}
                        // A failed Mutation() (a bad id, a service rejecting the
                        // request) used to be invisible — the button just did
                        // nothing, no feedback anywhere. onError fires with []
                        // once resolved, so this clears itself the same way it
                        // set itself, not just on the next send.
                        onError={(errors) => chat.setToolError(errors.length ? errors.map((e) => e.message).join("; ") : null)}
                      />
                    </div>
                  ) : (
                    <div className="chat-msg-text">{msg.display ?? msg.content}</div>
                  )}
                  {!isEditing && (
                    <div className="chat-msg-actions">
                      <button
                        className="chat-msg-action"
                        onClick={() => copyMessage(i, msg.display ?? msg.content)}
                      >
                        {copiedIndex === i ? "Copied" : "Copy"}
                      </button>
                      {isEditableUser && (
                        <button
                          className="chat-msg-action"
                          onClick={() => startEdit(i, msg.display ?? msg.content)}
                          disabled={chat.isStreaming}
                        >
                          Edit
                        </button>
                      )}
                      {msg.role === "assistant" && (
                        <button
                          className="chat-msg-action"
                          onClick={() => chat.regenerate(i)}
                          disabled={chat.isStreaming}
                        >
                          Regenerate
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}

            {chat.isStreaming && (
              <article className="chat-msg chat-msg-assistant">
                <div className="chat-msg-role">
                  Visual OS
                  <span className="chat-streaming-dot" aria-hidden="true" />
                </div>
                <div className="chat-rendered">
                  <StreamingRender response={chat.streamedResponse} />
                </div>
              </article>
            )}
          </div>
        )}

        {chat.error && <div className="chat-error">{chat.error}</div>}
        {chat.toolError && <div className="chat-error">{chat.toolError}</div>}
      </div>

      {/* Docked composer, only once a conversation exists. In the empty state
          the same element lives inside the welcome block instead, so it reads
          as the centre of the page rather than as a footer. */}
      {!empty && (
        <div className="chat-dock">
          {composer}
          <button className="chat-clear" onClick={chat.clear}>
            New dashboard
          </button>
        </div>
      )}
    </div>
  );
}
