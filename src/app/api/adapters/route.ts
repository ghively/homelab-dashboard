import { NextRequest, NextResponse } from "next/server";
import {
  queryAdapter,
  queryWorld,
  worldSummary,
  ADAPTER_INVENTORY,
} from "@/lib/adapter-aggregator";
import { initAdapters } from "@/lib/adapter-runtime";
import { WORLDS, matchRecipe, type WorldId } from "@/lib/workspace-config";
import type { VisualStateValue } from "@/adapters/types";

initAdapters();

// GET /api/adapters — list all adapters with world mappings
// GET /api/adapters?world=media — list adapters for a world
// GET /api/adapters?query=how+connects — NL recipe match
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const world = sp.get("world") as WorldId | null;
  const query = sp.get("query");
  const adapter = sp.get("adapter");
  const state = (sp.get("state") as VisualStateValue) || "healthy";

  if (query) {
    const recipe = matchRecipe(query);
    return NextResponse.json({ recipe, query });
  }

  if (adapter) {
    const result = await queryAdapter(adapter, state);
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
