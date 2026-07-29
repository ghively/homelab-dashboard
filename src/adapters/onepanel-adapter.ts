// 1Panel server management adapter
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string[];
  cpu: number;
  memory: number;
}

interface SystemInfo {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    usage: number;
  };
}

export class OnePanelAdapter implements DataAdapter {
  readonly name = "1panel";
  readonly description = "1Panel server management and monitoring";
  readonly category = "ops" as const;

  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string = process.env.ONEPANEL_BASE_URL || "http://localhost:10086", apiKey: string = process.env.ONEPANEL_API_KEY || "") {
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
      };
    }

    try {
      await fetch(`${this.baseUrl}/api/v1/system/info`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return {
      adapter: this.name,
      source: this.baseUrl,
      queriedAt: new Date().toISOString(),
      stalenessSeconds: 0,
      cacheHit: false,
    };
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return getFixtureForState(this.name, fixtureState);
    }

    const start = Date.now();
    try {
      const [systemResponse, containersResponse] = await Promise.all([
        fetch(`${this.baseUrl}/api/v1/system/info`, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(10000),
        }),
        fetch(`${this.baseUrl}/api/v1/containers`, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      if (!systemResponse.ok) {
        throw new Error(`1Panel API error: ${systemResponse.status}`);
      }

      const systemData = await systemResponse.json();
      const containersData = containersResponse.ok ? await containersResponse.json() : { data: [] };

      const system: SystemInfo = systemData.data || {};
      const containers: ContainerInfo[] = containersData.data || [];

      const runningContainers = containers.filter((c) => c.status === "running");
      const stoppedContainers = containers.filter((c) => c.status === "exited");

      return {
        title: "1Panel Server",
        subtitle: "Server management and monitoring",
        state: system.cpu && system.memory ? "healthy" : "offline",
        metrics: [
          { label: "CPU Usage", value: `${(system.cpu?.usage || 0).toFixed(1)}%`, unit: "%", state: system.cpu?.usage && system.cpu.usage > 90 ? "warning" : "healthy" },
          { label: "Memory", value: `${(system.memory?.usage || 0).toFixed(1)}%`, unit: "%", state: system.memory?.usage && system.memory.usage > 90 ? "warning" : "healthy" },
          { label: "Disk", value: `${(system.disk?.usage || 0).toFixed(1)}%`, unit: "%", state: system.disk?.usage && system.disk.usage > 90 ? "warning" : "healthy" },
          { label: "Containers", value: containers.length },
          { label: "Running", value: runningContainers.length },
          { label: "Stopped", value: stoppedContainers.length },
        ],
        items: containers.map((c) => ({
          id: c.id,
          label: c.name,
          subtitle: c.image,
          value: c.status,
          state: c.status === "running" ? "healthy" : c.status === "exited" ? "warning" : "offline",
        })),
        source: this.name,
        fetchedAt: new Date().toISOString(),
        ageMs: Date.now() - start,
        staleMs: 30000, // 30 seconds
      };
    } catch (error) {
      return {
        title: "1Panel Server",
        subtitle: "Failed to fetch data",
        state: "offline",
        metrics: [{ label: "Status", value: "ERROR", state: "offline" }],
        source: this.name,
        fetchedAt: new Date().toISOString(),
        ageMs: Date.now() - start,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }
}