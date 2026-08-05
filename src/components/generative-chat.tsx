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

interface UseGenerativeChat {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (v: string) => void;
  sendMessage: (text?: string, context?: Record<string, unknown>) => void;
  stop: () => void;
  clear: () => void;
  isStreaming: boolean;
  streamedResponse: string;
  error: string | null;
}

// ── Streaming chat hook ──────────────────────────────────────

export function useGenerativeChat(): UseGenerativeChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      const priorMessages = [...messages, userMsg];
      setMessages(priorMessages);
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
          messages: priorMessages.map((m) => ({ role: m.role, content: m.content })),
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
    [inputValue, isStreaming, messages],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setStreamedResponse("");
    setError(null);
  }, []);

  return {
    messages,
    inputValue,
    setInputValue,
    sendMessage,
    stop,
    clear,
    isStreaming,
    streamedResponse,
    error,
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
 */
export function GenerativeChat({ subtitle }: { subtitle?: string }) {
  const chat = useGenerativeChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const empty = chat.messages.length === 0 && !chat.isStreaming;

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
            {chat.messages.map((msg, i) => (
              <article key={i} className={`chat-msg chat-msg-${msg.role}`}>
                <div className="chat-msg-role">
                  {msg.role === "user" ? "You" : "Visual OS"}
                </div>
                {msg.role === "assistant" ? (
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
                    />
                  </div>
                ) : (
                  <div className="chat-msg-text">{msg.display ?? msg.content}</div>
                )}
              </article>
            ))}

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
