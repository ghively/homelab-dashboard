import { BaseAdapter } from "./BaseAdapter";
import type { AdapterConfig } from "./types";

export interface WazuhConfig extends AdapterConfig {
  managerUrl: string;
  username: string;
  password: string;
}

interface WazuhResponse {
  total_items: number;
  items: any[];
}

export class WazuhAdapter extends BaseAdapter {
  private managerUrl: string;
  private authHeader: string;

  constructor(config: WazuhConfig) {
    super("wazuh", config);
    this.managerUrl = config.managerUrl;
    this.authHeader = `Basic ${btoa(`${config.username}:${config.password}`)}`;
  }

  protected async fetchData(): Promise<any> {
    const endpoints = [
      { name: "agents", path: "/agents/summary/status" },
      { name: "alerts", path: "/alerts/summary/agents" },
      { name: "events", path: "/events/summary" },
    ];

    const results = await Promise.allSettled(
      endpoints.map(async ({ name, path }) => {
        const response = await fetch(`${this.managerUrl}${path}`, {
          headers: { Authorization: this.authHeader },
        });
        if (!response.ok) throw new Error(`Wazuh ${name} failed: ${response.statusText}`);
        const data = await response.json() as WazuhResponse;
        return { [name]: (data as any).data || data };
      })
    );

    return results.reduce((acc, result, i) => {
      if (result.status === "fulfilled") {
        acc[endpoints[i].name] = result.value;
      } else {
        acc[endpoints[i].name] = { error: result.reason.message, healthy: false };
      }
      return acc;
    }, {} as Record<string, any>);
  }
}