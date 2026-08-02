// Pi-hole adapter - DNS sinkhole statistics
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";

interface _PiHoleSummary {
  queries: number;
  blocked: number;
  block_rate: number;
  domains_being_blocked: number;
  clients_ever_seen: number;
  status: "enabled" | "disabled";
}

export class PiHoleAdapter implements DataAdapter {
  readonly name = "pihole";
  readonly description = "Pi-hole DNS sinkhole statistics";
  readonly category = "network" as const;

  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string = process.env.PIHOLE_BASE_URL || "http://192.168.0.50", apiKey: string = process.env.PIHOLE_API_KEY || "") {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async health(): Promise<FreshnessInfo> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return {
        adapter: this.name,
        source: this.baseUrl,
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
        lastChange: undefined,
        version: undefined,
      };
    }

    try {
      const url = `${this.baseUrl}/admin/api.php?summary&auth=${this.apiKey}`;
      const _response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return {
        adapter: this.name,
        source: this.baseUrl,
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
        lastChange: undefined,
        version: undefined,
      };
    } catch {
      return {
        adapter: this.name,
        source: this.baseUrl,
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
        lastChange: undefined,
        version: undefined,
      };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return getFixtureForState(this.name, fixtureState);
    }

    try {
      const url = `${this.baseUrl}/admin/api.php?summary&auth=${this.apiKey}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

      if (!response.ok) {
        throw new Error(`Pi-hole API error: ${response.status}`);
      }

      const text = await response.text();
      const lines = text.split("\n").filter((l) => l.trim());
      const data: Record<string, string> = {};

      for (const line of lines) {
        const [key, value] = line.split("=");
        if (key && value) data[key] = value;
      }

      const queries = parseInt(data["queries"] || "0", 10);
      const blocked = parseInt(data["blocked"] || "0", 10);
      const blockRate = queries > 0 ? (blocked / queries) * 100 : 0;
      const status = data["status"] === "enabled" ? "enabled" : "disabled";

      const now = new Date().toISOString();

      return {
        title: "Pi-hole DNS Sinkhole",
        subtitle: status === "enabled" ? "Blocking enabled" : "Blocking disabled",
        state: status === "enabled" ? "healthy" : "warning",
        metrics: [
          { label: "Queries", value: queries },
          { label: "Blocked", value: blocked },
          { label: "Block Rate", value: `${blockRate.toFixed(2)}%`, unit: "%" },
          { label: "Domains", value: parseInt(data["domains_being_blocked"] || "0", 10) },
          { label: "Clients", value: parseInt(data["clients_ever_seen"] || "0", 10) },
          { label: "Status", value: status, state: status === "enabled" ? "healthy" : "warning" },
        ],
        freshness: {
          adapter: this.name,
          source: this.baseUrl,
          queriedAt: now,
          stalenessSeconds: 0,
          cacheHit: false,
        },
      };
    } catch {
      const now = new Date().toISOString();
      return {
        title: "Pi-hole DNS Sinkhole",
        subtitle: "Failed to fetch data",
        state: "offline",
        metrics: [{ label: "Status", value: "ERROR", state: "offline" }],
        freshness: {
          adapter: this.name,
          source: this.baseUrl,
          queriedAt: now,
          stalenessSeconds: 0,
          cacheHit: false,
        },
      };
    }
  }
}