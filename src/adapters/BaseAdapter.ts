import type { AdapterConfig, AdapterResult, AdapterState } from "./types";
import { ADAPTER_TIMEOUT_MS } from "@/lib/adapter-http";

export abstract class BaseAdapter {
  readonly name: string;
  protected config: AdapterConfig;

  constructor(name: string, config: Partial<AdapterConfig> = {}) {
    this.name = name;
    this.config = {
      enabled: true,
      refreshIntervalMs: 30000,
      timeoutMs: ADAPTER_TIMEOUT_MS,
      retryAttempts: 3,
      ...config,
    };
  }

  protected abstract fetchData(): Promise<unknown>;

  async fetch(): Promise<AdapterResult> {
    if (!this.config.enabled) {
      return {
        adapter: this.name,
        success: false,
        timestamp: new Date().toISOString(),
        data: null,
        error: "Adapter is disabled",
        state: "denied",
        latencyMs: 0,
      };
    }

    const start = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const data = await Promise.race([
          this.fetchData(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), this.config.timeoutMs)
          ),
        ]);

        const latencyMs = Date.now() - start;
        return {
          adapter: this.name,
          success: true,
          timestamp: new Date().toISOString(),
          data,
          error: undefined,
          state: this.deriveState(data),
          latencyMs,
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.config.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    return {
      adapter: this.name,
      success: false,
      timestamp: new Date().toISOString(),
      data: null,
      error: lastError?.message ?? "Unknown error",
      state: "critical",
      latencyMs: Date.now() - start,
    };
  }

  protected deriveState(data: unknown): AdapterState {
    if (!data || typeof data !== "object") return "empty";
    const d = data as { healthy?: unknown; warning?: unknown };
    if (d.healthy === false) return "critical";
    if (d.warning) return "warning";
    return "healthy";
  }
}