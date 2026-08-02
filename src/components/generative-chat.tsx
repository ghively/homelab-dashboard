"use client";

import { useState, useRef, useCallback } from "react";
import { Renderer } from "@openuidev/react-lang";
import { library } from "@/lib/library";
import { createToolProvider } from "@/lib/tools";

// Module-scope toolProvider — built once, shared by every Renderer instance.
// A new object per render would thrash the query manager (it keys memoization
// on provider identity). Null here would make Query() bail silently.
const toolProvider = createToolProvider();

// ── Types ────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseGenerativeChat {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (v: string) => void;
  sendMessage: (text?: string) => void;
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
    (text?: string) => {
      const query = (text ?? inputValue).trim();
      if (!query || isStreaming) return;

      const userMsg: ChatMessage = { role: "user", content: query };
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

// ── Suggestion prompts ───────────────────────────────────────

const SUGGESTIONS = [
  "Show pipeline health",
  "Show fleet status overview",
  "Display media server activity",
  "Show network topology",
];

// ── GenerativeChat component ─────────────────────────────────

export function GenerativeChat() {
  const chat = useGenerativeChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="dash-generative-chat">
      {/* Conversation history */}
      {chat.messages.length > 0 && (
        <div className="dash-chat-history" ref={scrollRef}>
          {chat.messages.map((msg, i) => (
            <div
              key={i}
              className={`dash-chat-msg dash-chat-msg-${msg.role}`}
            >
              <div className="dash-chat-msg-role">
                {msg.role === "user" ? "You" : "Assistant"}
              </div>
              {msg.role === "assistant" ? (
                <div className="dash-chat-rendered">
                  <Renderer
                    response={msg.content}
                    library={library}
                    toolProvider={toolProvider}
                    isStreaming={false}
                    // Drill-down: clicking a row/card/node sends its label back
                    // as a follow-up so the model can answer with a detail view.
                    // Only on settled messages — a live stream is still arriving.
                    onAction={(event) => chat.sendMessage(event.humanFriendlyMessage)}
                  />
                </div>
              ) : (
                <div className="dash-chat-text">{msg.content}</div>
              )}
            </div>
          ))}

          {/* Live streaming response */}
          {chat.isStreaming && (
            <div className="dash-chat-msg dash-chat-msg-assistant">
              <div className="dash-chat-msg-role">
                Assistant
                <span className="dash-chat-streaming-dot" />
              </div>
              <div className="dash-chat-rendered">
                <Renderer
                  response={chat.streamedResponse}
                  library={library}
                  toolProvider={toolProvider}
                  isStreaming={true}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {chat.error && (
        <div className="dash-chat-error">{chat.error}</div>
      )}

      {/* Input row */}
      <div className="dash-ai-input-wrap">
        <input
          type="text"
          value={chat.inputValue}
          onChange={(e) => chat.setInputValue(e.target.value)}
          placeholder="Ask in natural language: 'Show me how gh-vps connects to caddy'"
          onKeyDown={(e) => {
            if (e.key === "Enter") chat.sendMessage();
          }}
          disabled={chat.isStreaming}
        />
        {chat.isStreaming ? (
          <button onClick={chat.stop} className="dash-chat-stop-btn">
            Stop
          </button>
        ) : (
          <button onClick={() => chat.sendMessage()}>Send →</button>
        )}
      </div>

      {/* Suggestion chips */}
      {chat.messages.length === 0 && (
        <div className="dash-chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="dash-tag"
              onClick={() => chat.sendMessage(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {chat.messages.length > 0 && (
        <button className="dash-chat-clear" onClick={chat.clear}>
          Clear conversation
        </button>
      )}
    </div>
  );
}
