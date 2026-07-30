import { buildSystemPrompt } from "@/lib/prompt-library";
import { promptOptions } from "@/lib/prompt-options";
import { NextRequest } from "next/server";
import OpenAI from "openai";

let client: OpenAI | null = null;
function getClient() {
  if (!client) {
    client = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return client;
}

const model = process.env.OPENAI_MODEL || "deepseek-v4-pro";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    const systemPrompt = buildSystemPrompt(promptOptions);

    const response = await getClient().chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...messages,
      ],
      stream: true,
    });

    return new Response(response.toReadableStream(), {
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
