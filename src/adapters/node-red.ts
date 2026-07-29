import { BaseAdapter } from "./BaseAdapter";
import type { AdapterResult, AdapterState } from "./types";
import axios from "axios";

/**
 * Node-RED adapter - flow automation integration
 */
export class NodeRedAdapter extends BaseAdapter {
  private baseUrl: string;
  private token?: string;

  constructor(
    baseUrl: string = process.env.NODE_RED_BASE_URL || "http://localhost:1880",
    token?: string
  ) {
    super("node-red");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token || process.env.NODE_RED_TOKEN;
  }

  protected async fetchData(): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    if (this.token) {
      headers["Node-RED-API-Token"] = this.token;
    }

    const client = axios.create({
      baseURL: this.baseUrl,
      headers,
      timeout: this.config.timeoutMs,
    });

    // Fetch flows
    const flowsResponse = await client.get("/flows");
    const flows = Array.isArray(flowsResponse.data) ? flowsResponse.data : [];

    // Count nodes and tabs
    let nodeCount = 0;
    let tabCount = 0;

    flows.forEach((flow: any) => {
      if (flow.type === "tab") {
        tabCount++;
      }
      nodeCount++;
    });

    return {
      healthy: true,
      baseUrl: this.baseUrl,
      flows: flows.length,
      tabs: tabCount,
      nodes: nodeCount,
      activeFlows: flows.filter((f: any) => !f.disabled).length,
    };
  }

  protected override deriveState(data: any): AdapterState {
    if (!data) return "offline";
    if (!data.healthy) return "critical";
    if (data.flows === 0) return "warning";
    return "healthy";
  }
}