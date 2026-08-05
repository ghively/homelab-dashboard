import { NextRequest, NextResponse } from "next/server";
import { mutateAdapter } from "@/lib/adapter-aggregator";
import { initAdapters } from "@/lib/adapter-runtime";

initAdapters();

// POST /api/mutate — body: { adapter: "radarr", action: "search-movie", args: { movieId: 123 } }
// POST only, deliberately: a write action must never be a GET (caching,
// prefetching, and link-crawling can all trigger a GET with no user intent
// behind it — a mutation firing from any of that would be a real incident).
export async function POST(req: NextRequest) {
  let body: { adapter?: string; action?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const { adapter, action, args } = body;
  if (!adapter || !action) {
    return NextResponse.json({ success: false, message: "adapter and action are required." }, { status: 400 });
  }

  const result = await mutateAdapter(adapter, action, args ?? {});
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
