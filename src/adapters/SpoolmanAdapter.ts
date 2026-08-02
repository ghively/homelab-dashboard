import { BaseAdapter } from "./BaseAdapter";
import type { AdapterConfig } from "./types";

export interface SpoolmanConfig extends AdapterConfig {
  host: string;
  apiKey?: string;
}

interface SpoolResponse {
  id: number;
  filament: {
    name: string;
    manufacturer: string;
    material: string;
    color_hex: string;
  };
  remaining_weight: number;
  used_weight: number;
  price: number;
  first_used: string;
  last_used: string;
  location: string;
}

export class SpoolmanAdapter extends BaseAdapter {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: SpoolmanConfig) {
    super("spoolman", config);
    this.baseUrl = `http://${config.host}:7912/api/v1`;
    this.apiKey = config.apiKey;
  }

  protected async fetchData(): Promise<unknown> {
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      const [spoolsResponse, vendorResponse] = await Promise.all([
        fetch(`${this.baseUrl}/spool`, { headers }),
        fetch(`${this.baseUrl}/vendor`, { headers }),
      ]);

      if (!spoolsResponse.ok) {
        throw new Error(`Spoolman API failed: ${spoolsResponse.statusText}`);
      }

      const spools: SpoolResponse[] = spoolsResponse.ok ? await spoolsResponse.json() : [];
      const vendors: unknown[] = vendorResponse.ok ? await vendorResponse.json() : [];

      const activeSpools = spools.filter((s) => s.remaining_weight > 0 && s.location);
      const usedUp = spools.filter((s) => s.remaining_weight <= 5);

      const byMaterial: Record<string, number> = {};
      const byManufacturer: Record<string, number> = {};

      for (const spool of spools) {
        const mat = spool.filament.material || "unknown";
        const mfg = spool.filament.manufacturer || "unknown";

        byMaterial[mat] = (byMaterial[mat] || 0) + spool.used_weight;
        byManufacturer[mfg] = (byManufacturer[mfg] || 0) + spool.used_weight;
      }

      return {
        totalSpools: spools.length,
        activeSpools: activeSpools.length,
        usedUp: usedUp.length,
        totalFilamentUsed: spools.reduce((acc, s) => acc + s.used_weight, 0),
        totalFilamentRemaining: spools.reduce((acc, s) => acc + s.remaining_weight, 0),
        totalCost: spools.reduce((acc, s) => acc + (s.price || 0), 0),
        vendorCount: vendors.length,
        byMaterial,
        byManufacturer,
        recent: spools
          .sort((a, b) => new Date(b.last_used).getTime() - new Date(a.last_used).getTime())
          .slice(0, 10)
          .map((s) => ({
            id: s.id,
            material: s.filament.material,
            color: s.filament.color_hex,
            manufacturer: s.filament.manufacturer,
            remaining: s.remaining_weight,
            lastUsed: s.last_used,
            location: s.location,
          })),
        healthy: spools.length > 0,
      };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }
}