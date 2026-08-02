// Garage S3 object storage adapter — cluster status and bucket inventory.
//
// Uses the Garage *admin* API, not the S3 data API. The S3 endpoint requires
// SigV4 request signing, which is why the previous version — which held S3
// access/secret keys and never used them — returned a hardcoded bucket list
// and object counts that the dashboard rendered as live data.
//
// Admin API: GET /v1/status, GET /v1/bucket?list, both bearer-authenticated
// with the admin token (garage.toml `admin.admin_token`).

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";
import { ADAPTER_TIMEOUT_MS } from "@/lib/adapter-http";

const GARAGE_ADMIN_URL = process.env.GARAGE_ADMIN_URL || "";
const GARAGE_ADMIN_TOKEN = process.env.GARAGE_ADMIN_TOKEN || "";

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "garage-s3",
    source: GARAGE_ADMIN_URL || "unconfigured",
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

interface GarageNode {
  id?: string;
  hostname?: string;
  isUp?: boolean;
  role?: { capacity?: number | null; zone?: string } | null;
}

interface GarageStatus {
  layoutVersion?: number;
  nodes?: GarageNode[];
}

interface GarageBucket {
  id?: string;
  globalAliases?: string[];
}

class GarageS3Adapter implements DataAdapter {
  readonly name = "garage-s3";
  readonly description = "Garage S3 object storage — cluster nodes and buckets.";
  readonly category = "ops" as const;

  private headers(): Record<string, string> {
    return GARAGE_ADMIN_TOKEN ? { Authorization: `Bearer ${GARAGE_ADMIN_TOKEN}` } : {};
  }

  async health(): Promise<FreshnessInfo> {
    if (GARAGE_ADMIN_URL) {
      try {
        await fetch(`${GARAGE_ADMIN_URL}/v1/status`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
        });
      } catch {
        // Unreachable — freshness still records the endpoint queried.
      }
    }
    return makeFreshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    if (!GARAGE_ADMIN_URL || !GARAGE_ADMIN_TOKEN) {
      return {
        title: "Garage S3",
        subtitle: "Admin API not configured",
        state: "empty",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary:
          "Set GARAGE_ADMIN_URL and GARAGE_ADMIN_TOKEN. S3 access keys alone cannot query cluster state.",
      };
    }

    try {
      const [statusRes, bucketsRes] = await Promise.all([
        fetch(`${GARAGE_ADMIN_URL}/v1/status`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
        }),
        fetch(`${GARAGE_ADMIN_URL}/v1/bucket?list`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
        }),
      ]);
      if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);

      const status = (await statusRes.json()) as GarageStatus;
      const nodes = status.nodes ?? [];
      const up = nodes.filter((n) => n.isUp);
      const buckets: GarageBucket[] = bucketsRes.ok ? await bucketsRes.json() : [];

      const capacity = nodes.reduce((a, n) => a + (n.role?.capacity ?? 0), 0);

      const metrics: Metric[] = [
        { label: "Nodes", value: nodes.length, state: "healthy" },
        {
          label: "Nodes Up",
          value: up.length,
          state: up.length === nodes.length ? "healthy" : "warning",
        },
      ];
      if (bucketsRes.ok) {
        metrics.push({ label: "Buckets", value: buckets.length, state: "healthy" });
      }
      if (capacity > 0) {
        metrics.push({ label: "Capacity", value: `${(capacity / 1e12).toFixed(1)} TB` });
      }
      if (status.layoutVersion != null) {
        metrics.push({ label: "Layout Version", value: status.layoutVersion });
      }

      const items: Item[] = [
        ...nodes.map((n, i) => ({
          id: n.id ?? `node-${i}`,
          label: n.hostname ?? n.id?.slice(0, 12) ?? `node ${i}`,
          subtitle: [n.isUp ? "up" : "down", n.role?.zone].filter(Boolean).join(" • "),
          state: n.isUp ? ("healthy" as const) : ("critical" as const),
          group: "nodes",
        })),
        ...buckets.map((b, i) => ({
          id: b.id ?? `bucket-${i}`,
          label: b.globalAliases?.[0] ?? b.id?.slice(0, 16) ?? `bucket ${i}`,
          subtitle: b.id ? b.id.slice(0, 16) : "",
          state: "healthy" as const,
          group: "buckets",
        })),
      ];

      const allUp = nodes.length > 0 && up.length === nodes.length;
      return {
        title: "Garage S3 — Object Storage",
        subtitle: `${up.length}/${nodes.length} nodes up • ${buckets.length} buckets`,
        state: allUp ? "healthy" : "warning",
        freshness: makeFreshness(),
        metrics,
        items,
        summary: `${up.length} of ${nodes.length} nodes up`,
      };
    } catch {
      return {
        title: "Garage S3 — Object Storage",
        subtitle: "Admin API unreachable",
        state: "offline",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new GarageS3Adapter();
export { adapter as default };
