import { BaseAdapter } from "./BaseAdapter";
import type { AdapterResult, AdapterState } from "./types";
import axios from "axios";

/**
 * Home Assistant adapter - entities, devices, rooms, energy data
 */
export class HomeAssistantAdapter extends BaseAdapter {
  private baseUrl: string;
  private token: string;

  constructor(
    baseUrl: string = process.env.HOME_ASSISTANT_BASE_URL || "http://192.168.0.50:8123",
    token: string = process.env.HOME_ASSISTANT_TOKEN || ""
  ) {
    super("home-assistant");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  protected async fetchData(): Promise<any> {
    if (!this.token) {
      throw new Error("HOME_ASSISTANT_TOKEN not configured");
    }

    const client = axios.create({
      baseURL: `${this.baseUrl}/api`,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      timeout: this.config.timeoutMs,
    });

    // Fetch entities
    const statesResponse = await client.get("/states");
    const entities = statesResponse.data;

    // Fetch devices
    const devicesResponse = await client.get("/devices");
    const devices = devicesResponse.data?.devices || [];

    // Fetch areas/rooms
    const areasResponse = await client.get("/areas");
    const areas = areasResponse.data?.areas || [];

    // Entity categorization
    const entityCategories = {
      lights: entities.filter((e: any) =>
        e.entity_id.startsWith("light.")
      ).length,
      switches: entities.filter((e: any) =>
        e.entity_id.startsWith("switch.")
      ).length,
      sensors: entities.filter((e: any) =>
        e.entity_id.startsWith("sensor.") || e.entity_id.startsWith("binary_sensor.")
      ).length,
      climate: entities.filter((e: any) =>
        e.entity_id.startsWith("climate.")
      ).length,
      media_players: entities.filter((e: any) =>
        e.entity_id.startsWith("media_player.")
      ).length,
    };

    return {
      healthy: true,
      entities: entities.length,
      devices: devices.length,
      rooms: areas.length,
      categories: entityCategories,
      sampleEntities: entities.slice(0, 10).map((e: any) => ({
        id: e.entity_id,
        state: e.state,
        attributes: {
          friendly_name: e.attributes?.friendly_name,
        },
      })),
    };
  }

  protected override deriveState(data: any): AdapterState {
    if (!data) return "offline";
    if (!data.healthy) return "critical";
    if (data.entities === 0) return "warning";
    return "healthy";
  }
}