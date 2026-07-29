import { BaseAdapter } from "./BaseAdapter";
import type { AdapterConfig } from "./types";

export interface WatchtowerConfig extends AdapterConfig {
  hosts: string[];
  apiKey?: string;
}

interface WatchtowerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: string;
  updated?: string;
  update_available?: boolean;
  host?: string;
}

export class WatchtowerAdapter extends BaseAdapter {
  private hosts: string[];
  private apiKey?: string;

  constructor(config: WatchtowerConfig) {
    super("watchtower", config);
    this.hosts = config.hosts;
    this.apiKey = config.apiKey;
  }

  protected async fetchData(): Promise<any> {
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      const allContainers: WatchtowerContainer[] = [];
      const hostStatus: Record<string, any> = {};

      for (const host of this.hosts) {
        try {
          const response = await fetch(`http://${host}:8080/v1/containers`, { headers });
          if (!response.ok) {
            hostStatus[host] = { error: response.statusText, healthy: false };
            continue;
          }

          const containers: WatchtowerContainer[] = await response.json();
          allContainers.push(
            ...containers.map((c) => ({
              ...c,
              host,
            }))
          );
          hostStatus[host] = {
            containerCount: containers.length,
            healthy: true,
          };
        } catch (err) {
          hostStatus[host] = {
            error: (err as Error).message,
            healthy: false,
          };
        }
      }

      const updateAvailable = allContainers.filter((c) => c.update_available);
      const running = allContainers.filter((c) => c.state === "running");
      const stopped = allContainers.filter((c) => c.state !== "running");

      const byImage: Record<string, number> = {};
      for (const c of allContainers) {
        const img = c.image.split(":")[0];
        byImage[img] = (byImage[img] || 0) + 1;
      }

      return {
        totalContainers: allContainers.length,
        runningContainers: running.length,
        stoppedContainers: stopped.length,
        updatesAvailable: updateAvailable.length,
        hostCount: this.hosts.length,
        healthyHosts: Object.values(hostStatus).filter((h: any) => h.healthy).length,
        hostStatus,
        byImage,
        updateCandidates: updateAvailable.map((c) => ({
          id: c.id,
          name: c.name,
          image: c.image,
          host: c.host,
          status: c.status,
        })),
        recentUpdates: allContainers
          .filter((c) => c.updated)
          .sort((a, b) => new Date(b.updated!).getTime() - new Date(a.updated!).getTime())
          .slice(0, 10)
          .map((c) => ({
            name: c.name,
            image: c.image,
            updated: c.updated,
            host: c.host,
          })),
        healthy: updateAvailable.length === 0 && running.length > 0,
        warning: updateAvailable.length > 0 ? `${updateAvailable.length} updates available` : undefined,
      };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }
}