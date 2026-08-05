import { NextRequest, NextResponse } from "next/server";
import {
  queryAdapter,
  queryWorld,
  worldSummary,
  ADAPTER_INVENTORY,
} from "@/lib/adapter-aggregator";
import { initAdapters } from "@/lib/adapter-runtime";
import { WORLDS, type WorldId } from "@/lib/workspace-config";
import type { VisualStateValue } from "@/adapters/types";

initAdapters();

// Query params queryAdapter() already handles by name — everything else on
// the request becomes a `filters` entry (e.g. ?genre=Horror), so a new filter
// an adapter wants to accept needs no change here, only in the adapter and
// the model-facing tool schema in tools.ts.
const RESERVED_PARAMS = new Set(["world", "adapter", "state", "view"]);

// GET /api/adapters — list all adapters with world mappings
// GET /api/adapters?world=media — list adapters for a world
// GET /api/adapters?adapter=emby — query a single adapter
// GET /api/adapters?adapter=emby&view=sessions — select a named query
// GET /api/adapters?adapter=emby&view=by-genre&genre=Horror — named query + filters
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const world = sp.get("world") as WorldId | null;
  const adapter = sp.get("adapter");
  // No ?state= means "show me live data". A ?state= value is an explicit
  // request for that fixture, used by the state exerciser.
  const state = (sp.get("state") as VisualStateValue | null) ?? null;
  const view = sp.get("view") ?? undefined;
  const filters: Record<string, string> = {};
  for (const [key, value] of sp.entries()) {
    if (!RESERVED_PARAMS.has(key)) filters[key] = value;
  }

  if (adapter) {
    const result = await queryAdapter(adapter, state, view, Object.keys(filters).length ? filters : undefined);
    if (!result) {
      return NextResponse.json({ error: "Adapter not found" }, { status: 404 });
    }
    return NextResponse.json({ adapter, result });
  }

  if (world) {
    const worldConfig = WORLDS.find((w) => w.id === world);
    if (!worldConfig) {
      return NextResponse.json({ error: "Unknown world" }, { status: 404 });
    }
    const results = await queryWorld(world, state);
    const summary = worldSummary(world, results);
    return NextResponse.json({ world, config: worldConfig, summary, results });
  }

  return NextResponse.json({ adapters: ADAPTER_INVENTORY, worlds: WORLDS });
}
