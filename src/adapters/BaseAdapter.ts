import type { AdapterConfig, AdapterResult, AdapterState } from "./types";

export abstract class BaseAdapter {
  readonly name: string;
  protected config: AdapterConfig;

  constructor(name: string, config: Partial<AdapterConfig> = {}) {
    this.name = name;
    this.config = {
      enabled: true,
      refreshIntervalMs: 30000,
      timeoutMs: 5000,
      retryAttempts: 3,
      ...config,
    };
  }

  protected abstract fetchData(): Promise<any>;

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

  protected deriveState(data: any): AdapterState {
    if (!data) return "empty";
    if (data.healthy === false) return "critical";
    if (data.warning) return "warning";
    return "healthy";
  }
}