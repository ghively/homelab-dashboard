// Cloudflare DNS adapter - DNS records and configuration
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";

type HealthCheck = FreshnessInfo;

interface CloudflareDNSRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
  created_on: string;
  modified_on: string;
}

export class CloudflareDNSAdapter implements DataAdapter {
  readonly name = "cloudflare-dns";
  readonly description = "Cloudflare DNS records and configuration management";
  readonly category = "network" as const;

  private apiToken: string;
  private zoneId: string;

  // Defaults come from the environment. The previous defaults were the literal
  // strings "[REDACTED]", which made the module impossible to configure without
  // editing it — every request went out with a placeholder bearer token.
  constructor(
    apiToken: string = process.env.CLOUDFLARE_DNS_API_KEY || "",
    zoneId: string = process.env.CLOUDFLARE_DNS_ZONE_ID || "",
  ) {
    this.apiToken = apiToken;
    this.zoneId = zoneId;
  }

  async health(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}`, {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });

      return {
        adapter: this.name,
        source: "cloudflare-api",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: Math.floor((Date.now() - start) / 1000),
        cacheHit: false,
      };
    } catch (error) {
      return {
        adapter: this.name,
        source: "cloudflare-api",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: Math.floor((Date.now() - start) / 1000),
        cacheHit: false,
      };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return getFixtureForState(this.name, fixtureState);
    }

    const now = new Date().toISOString();
    const start = Date.now();
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records?per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status}`);
      }

      const data = await response.json();
      const records: CloudflareDNSRecord[] = data.result || [];

      const proxiedCount = records.filter((r) => r.proxied).length;
      const recordTypes = this.groupByType(records);

      return {
        title: "Cloudflare DNS",
        subtitle: `${records.length} DNS records managed`,
        state: "healthy",
        freshness: {
          adapter: this.name,
          source: "cloudflare-api",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics: [
          { label: "Records", value: records.length, state: "healthy" },
          { label: "Proxied", value: proxiedCount, state: "healthy" },
          { label: "DNS Only", value: records.length - proxiedCount, state: "healthy" },
          { label: "A Records", value: recordTypes.A || 0, state: "healthy" },
          { label: "CNAME", value: recordTypes.CNAME || 0, state: "healthy" },
          { label: "MX", value: recordTypes.MX || 0, state: "healthy" },
        ],
        items: records.map((r) => ({
          id: r.id,
          label: r.name,
          subtitle: `${r.type} → ${r.content}`,
          value: r.proxied ? "Proxied" : "DNS Only",
          state: r.proxied ? "healthy" : "empty",
        })),
      };
    } catch (error) {
      return {
        title: "Cloudflare DNS",
        subtitle: error instanceof Error ? error.message : "Unknown error",
        state: "critical",
        freshness: {
          adapter: this.name,
          source: "cloudflare-api",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics: [{ label: "Status", value: "ERROR", state: "critical" }],
      };
    }
  }

  private groupByType(records: CloudflareDNSRecord[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const record of records) {
      grouped[record.type] = (grouped[record.type] || 0) + 1;
    }
    return grouped;
  }
}

const adapter = new CloudflareDNSAdapter();
export { adapter as default };