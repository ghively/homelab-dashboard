import { BaseAdapter } from "./BaseAdapter";
import type { AdapterConfig } from "./types";

export interface CaddyConfig extends AdapterConfig {
  host: string;
  adminPort?: number;
}

interface CaddyResponse {
  version: string;
}

export class CaddyAdapter extends BaseAdapter {
  private baseUrl: string;

  constructor(config: CaddyConfig) {
    super("caddy", config);
    this.baseUrl = `http://${config.host}:${config.adminPort || 2019}`;
  }

  protected async fetchData(): Promise<any> {
    try {
      const [versionResponse, configResponse, metricsResponse] = await Promise.all([
        fetch(`${this.baseUrl}/version`),
        fetch(`${this.baseUrl}/config/`),
        fetch(`${this.baseUrl}/metrics`),
      ]);

      if (!versionResponse.ok) {
        throw new Error(`Caddy API failed: ${versionResponse.statusText}`);
      }

      const version = await versionResponse.json() as CaddyResponse;
      const config = configResponse.ok ? await configResponse.json() : {};
      const metrics = metricsResponse.ok ? await metricsResponse.json() : {};

      const servers: any[] = [];
      if (config.apps && config.apps.http) {
        const serversMap = config.apps.http.servers || {};
        const serverKeys = Object.keys(serversMap);
        for (const serverName of serverKeys) {
          const serverData = serversMap[serverName] as any;
          servers.push({
            name: serverName,
            listen: serverData.listen || [],
            protocols: serverData.protocols || [],
            routes: serverData.routes?.length || 0,
            tls: serverData.tls_connection_policies?.length || 0,
          });
        }
      }

      return {
        version: version.version,
        servers,
        metrics,
        healthy: true,
      };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }
}