import { NextRequest, NextResponse } from "next/server";
import { queryWorld, worldSummary } from "@/lib/adapter-aggregator";
import { initAdapters } from "@/lib/adapter-runtime";
import { WORLDS } from "@/lib/workspace-config";
import type { VisualStateValue } from "@/adapters/types";

initAdapters();

// GET /api/fleet — aggregate health across all 8 worlds (for landing page)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const state = (sp.get("state") as VisualStateValue) || "healthy";

  const worlds = await Promise.all(
    WORLDS.map(async (w) => {
      const results = await queryWorld(w.id, state);
      const summary = worldSummary(w.id, results);
      return {
        id: w.id,
        state: summary.state,
        healthy: summary.healthy,
        total: summary.total,
      };
    }),
  );

  const overallHealthy = worlds.reduce((a, w) => a + w.healthy, 0);
  const overallTotal = worlds.reduce((a, w) => a + w.total, 0);
  const worstStates = worlds.map((w) => w.state);
  const stateRank: Record<string, number> = {
    healthy: 0, loading: 1, empty: 1, stale: 2, warning: 3, denied: 4, critical: 5, offline: 6,
  };
  const overallState = worstStates.reduce(
    (worst, s) => (stateRank[s] > stateRank[worst] ? s : worst),
    "healthy" as VisualStateValue,
  );

  return NextResponse.json({
    worlds,
    overall: {
      state: overallState,
      healthy: overallHealthy,
      total: overallTotal,
      worldCount: worlds.length,
    },
  });
}
