// Spoolman adapter — 3D printing filament inventory and usage tracking.
// Host: gh-media (Tailscale 100.116.139.100)
// API: REST (default 7912)

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const SPOOLMAN_URL =
  process.env.SPOOLMAN_URL || "http://100.116.139.100:7912";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "spoolman",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

interface Spool {
  id: number;
  filament: { name: string; manufacturer: string; material: string; color_hex: string };
  remaining_weight: number;
  used_weight: number;
  price: number;
  last_used: string;
  location: string;
}

class SpoolmanAdapter implements DataAdapter {
  readonly name = "spoolman";
  readonly description = "Spoolman — 3D printing filament inventory and usage tracking.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${SPOOLMAN_URL}/api/v1/spool`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return makeFreshness(SPOOLMAN_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      const [spoolsRes, vendorRes] = await Promise.all([
        fetch(`${SPOOLMAN_URL}/api/v1/spool`, { signal: AbortSignal.timeout(8000) }),
        fetch(`${SPOOLMAN_URL}/api/v1/vendor`, { signal: AbortSignal.timeout(8000) }),
      ]);

      if (!spoolsRes.ok) throw new Error(`HTTP ${spoolsRes.status}`);

      const spools = (await spoolsRes.json()) as Spool[];
      const vendors = vendorRes.ok ? ((await vendorRes.json()) as unknown[]) : [];

      const activeSpools = spools.filter((s) => s.remaining_weight > 0 && s.location);
      const usedUp = spools.filter((s) => s.remaining_weight <= 5);

      const byMaterial: Record<string, number> = {};
      for (const s of spools) {
        const mat = s.filament.material || "unknown";
        byMaterial[mat] = (byMaterial[mat] ?? 0) + 1;
      }

      const totalRemaining = spools.reduce((a, s) => a + s.remaining_weight, 0);
      const totalCost = spools.reduce((a, s) => a + (s.price || 0), 0);

      return {
        title: "Spoolman — Filament Inventory",
        subtitle: `${spools.length} spools • ${vendors.length} vendors • ${activeSpools.length} active`,
        state: usedUp.length > 3 ? "warning" : "healthy",
        freshness: makeFreshness(SPOOLMAN_URL),
        metrics: [
          { label: "Total Spools", value: spools.length, state: "healthy" },
          { label: "Active", value: activeSpools.length, state: "healthy" },
          { label: "Used Up", value: usedUp.length, state: usedUp.length > 3 ? "warning" : "healthy" },
          { label: "Vendors", value: vendors.length },
          { label: "Remaining (g)", value: Math.round(totalRemaining) },
          { label: "Total Cost", value: `$${totalCost.toFixed(0)}` },
        ],
        items: spools
          .sort((a, b) => new Date(b.last_used).getTime() - new Date(a.last_used).getTime())
          .slice(0, 12)
          .map((s) => ({
            id: String(s.id),
            label: s.filament.name,
            subtitle: `${s.filament.material} • ${s.filament.manufacturer} • ${Math.round(s.remaining_weight)}g remaining`,
            value: Math.round(s.remaining_weight),
            state: s.remaining_weight <= 5 ? "critical" : s.remaining_weight < 50 ? "warning" : "healthy",
            group: s.filament.material,
          })),
        facets: [
          {
            name: "Material",
            values: Object.entries(byMaterial).map(([label, count]) => ({ label, count })),
          },
        ],
      };
    } catch {
      return {
        title: "Spoolman — Filament Inventory",
        subtitle: "API unreachable",
        state: "offline",
        freshness: makeFreshness(SPOOLMAN_URL),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new SpoolmanAdapter();
export { adapter as default };
