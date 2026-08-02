import { BaseAdapter } from "./BaseAdapter";
import type { AdapterState } from "./types";
import mqtt, { MqttClient, IClientOptions } from "mqtt";

/**
 * MQTT adapter - pub/sub messaging for IoT and automation
 */
export class MQTTAdapter extends BaseAdapter {
  private brokerUrl: string;
  private clientId: string;
  private username?: string;
  private password?: string;
  private client: MqttClient | null = null;
  private messageCount = 0;
  private subscribedTopics = new Set<string>();

  constructor(
    brokerUrl: string = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883",
    options: { clientId?: string; username?: string; password?: string } = {}
  ) {
    super("mqtt");
    this.brokerUrl = brokerUrl;
    this.clientId = options.clientId || `homelab-dashboard-${Date.now()}`;
    this.username = options.username;
    this.password = options.password;
  }

  protected async fetchData(): Promise<unknown> {
    if (!this.client || !this.client.connected) {
      throw new Error("MQTT client not connected");
    }

    return {
      healthy: true,
      connected: this.client.connected,
      brokerUrl: this.brokerUrl,
      subscribedTopics: Array.from(this.subscribedTopics),
      messageCount: this.messageCount,
    };
  }

  protected override deriveState(data: unknown): AdapterState {
    const d = (data ?? {}) as { connected?: unknown };
    if (!data) return "offline";
    if (!d.connected) return "critical";
    return "healthy";
  }

  /**
   * Subscribe to topics and start tracking messages
   */
  async initialize(topics: string[] = ["homeassistant/#", "stat/#", "tele/#"]): Promise<void> {
    if (!this.username && process.env.MQTT_USERNAME) {
      this.username = process.env.MQTT_USERNAME;
    }
    if (!this.password && process.env.MQTT_PASSWORD) {
      this.password = process.env.MQTT_PASSWORD;
    }

    const opts: IClientOptions = {
      clientId: this.clientId,
      clean: true,
      connectTimeout: this.config.timeoutMs,
      reconnectPeriod: 5000,
    };

    if (this.username) {
      opts.username = this.username;
    }
    if (this.password) {
      opts.password = this.password;
    }

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.brokerUrl, opts);

      this.client.on("connect", () => {
        // Subscribe to topics
        topics.forEach(topic => {
          this.client!.subscribe(topic, (err) => {
            if (!err) {
              this.subscribedTopics.add(topic);
            }
          });
        });
        resolve();
      });

      this.client.on("message", () => {
        this.messageCount++;
      });

      this.client.on("error", (err) => {
        reject(new Error(`MQTT connection error: ${err.message}`));
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.subscribedTopics.clear();
      this.messageCount = 0;
    }
  }
}