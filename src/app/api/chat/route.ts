import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Drop SSE chunks that carry only reasoning, and forward everything else
 * verbatim.
 *
 * Buffered by line because a chunk boundary can land mid-JSON: parsing
 * whatever bytes happen to arrive would corrupt the stream. Anything that does
 * not parse is passed through untouched rather than dropped — this filter must
 * never be the reason a response goes missing.
 */
function stripReasoning(body: ReadableStream<Uint8Array> | null): ReadableStream<Uint8Array> | null {
  if (!body) return body;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      // The last element is whatever precedes the next newline — hold it back
      // until the rest of the line arrives.
      buffer = lines.pop() ?? "";

      let out = "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          out += line + "\n";
          continue;
        }
        const payload = line.slice(6);
        if (payload === "[DONE]") {
          out += line + "\n";
          continue;
        }
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta;
          if (delta && typeof delta === "object") {
            // A chunk with reasoning but no content has nothing the UI can
            // use. Chunks carrying role, finish_reason or usage are kept.
            const hasContent = typeof delta.content === "string" && delta.content.length > 0;
            const hasReasoning =
              typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0;
            if (hasReasoning && !hasContent) continue;
            if (hasReasoning) delete delta.reasoning_content;
            out += "data: " + JSON.stringify(parsed) + "\n";
            continue;
          }
        } catch {
          // Not JSON we understand — forward it unchanged.
        }
        out += line + "\n";
      }
      if (out) controller.enqueue(encoder.encode(out));
    },
    flush(controller) {
      if (buffer) controller.enqueue(encoder.encode(buffer));
    },
  });

  return body.pipeThrough(transform);
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    const [{ promptLibrary }, { promptOptions }] = await Promise.all([
      import("@/lib/prompt-library"),
      import("@/lib/prompt-options"),
    ]);

    const systemPrompt = promptLibrary.prompt(promptOptions);
    const baseURL = process.env.OPENAI_BASE_URL || "http://gh-arm:4000/v1";
    const apiKey = process.env.OPENAI_API_KEY || "sk-none";
    const model = process.env.OPENAI_MODEL || "deepseek-v4-flash";

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages,
        ],
        stream: true,
        // Measured, not assumed. deepseek-v4-flash is a reasoning model, and on
        // this task it spent 25,560 characters of reasoning to produce 3,976
        // characters of dashboard — six tokens of thinking per token of output,
        // all of it latency the user waits through.
        //
        // Disabling thinking took completion tokens from 25 to 9 on a control
        // prompt and reasoning to zero. `reasoning_effort: "low"` was tested
        // first and made it WORSE (204 characters of reasoning against 80 at
        // the default), so it is deliberately not used.
        //
        // The task does not need deliberation: the system prompt already
        // specifies the component library exhaustively, so this is closer to
        // transcription than to problem solving.
        thinking: { type: "disabled" },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return new Response(JSON.stringify({ error: text }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Strip reasoning before it reaches the browser.
    //
    // The route used to forward `response.body` untouched, so a single
    // dashboard shipped 2.7 MB over 8,866 SSE chunks — the overwhelming
    // majority of it `reasoning_content` that the client parses and then
    // discards. On a phone that is real bandwidth, real memory and real
    // battery spent on text nothing will ever display. `thinking: disabled`
    // above should keep reasoning empty, but this stays as a belt-and-braces
    // guarantee: if the provider ignores the flag, or a future model emits
    // reasoning anyway, the payload does not silently balloon again.
    return new Response(stripReasoning(response.body), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
