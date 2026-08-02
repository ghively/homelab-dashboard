// 1Password adapter — vault inventory via the `op` CLI service account.
//
// Real, non-interactive access to 1Password needs a service-account token in
// OP_SERVICE_ACCOUNT_TOKEN; `op` then answers `op vault list` / `op item list`
// without a human unlock. This adapter never fabricates vault statistics: with
// no token it reports `denied` naming the variable, and with a token it shells
// `op` and counts what `op` actually returns.
//
// Note the adapter name is "1password" to match the security world inventory.

import { execFile } from "node:child_process";
import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureForState } from "../fixtures";
import { getFixtureState } from "../registry";
import { ADAPTER_TIMEOUT_MS, makeFreshness } from "@/lib/adapter-http";

const OP_TOKEN = process.env.OP_SERVICE_ACCOUNT_TOKEN || "";

interface OpVault {
  id: string;
  name: string;
}

function runOp(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "op",
      [...args, "--format=json"],
      {
        timeout: timeoutMs,
        env: { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: OP_TOKEN },
        maxBuffer: 4 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || err.message || "").trim();
          reject(new Error(msg || "op invocation failed"));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

function freshness(start?: number): FreshnessInfo {
  return makeFreshness("1password", OP_TOKEN ? "op-cli:service-account" : "unconfigured", start);
}

export class OnePasswordAdapter implements DataAdapter {
  readonly name = "1password";
  readonly description = "1Password — vault inventory via the op CLI service account.";
  readonly category = "security" as const;

  async health(): Promise<FreshnessInfo> {
    return freshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureState = getFixtureState();
    if (fixtureState) return getFixtureForState(this.name, fixtureState);

    if (!OP_TOKEN) {
      return {
        title: "1Password",
        subtitle: "Service account token required",
        state: "denied",
        freshness: freshness(),
        metrics: [{ label: "Status", value: "TOKEN REQUIRED", state: "denied" }],
        summary:
          "Set OP_SERVICE_ACCOUNT_TOKEN so the op CLI can read vaults non-interactively. No statistics are shown without it.",
      };
    }

    const start = Date.now();
    try {
      const vaultsRaw = await runOp(["vault", "list"], ADAPTER_TIMEOUT_MS);
      const vaults = JSON.parse(vaultsRaw) as OpVault[];

      // Item count across vaults, best-effort within the time budget.
      let itemCount: number | null = null;
      try {
        const itemsRaw = await runOp(["item", "list"], ADAPTER_TIMEOUT_MS);
        itemCount = (JSON.parse(itemsRaw) as unknown[]).length;
      } catch {
        itemCount = null;
      }

      const metrics: Metric[] = [
        { label: "Vaults", value: vaults.length, state: "healthy" },
      ];
      if (itemCount !== null) metrics.push({ label: "Items", value: itemCount });

      const items: Item[] = vaults.slice(0, 25).map((v) => ({
        id: v.id,
        label: v.name,
        subtitle: v.id,
        state: "healthy" as const,
        group: "vaults",
      }));

      return {
        title: "1Password",
        subtitle: `${vaults.length} vault${vaults.length === 1 ? "" : "s"}${
          itemCount !== null ? ` • ${itemCount} items` : ""
        }`,
        state: "healthy",
        freshness: freshness(start),
        metrics,
        items,
        summary: `op service account can read ${vaults.length} vault(s)${
          itemCount !== null ? `, ${itemCount} items total` : ""
        }.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // op returns non-zero with an auth message when the token is bad/absent.
      const denied = /account|token|auth|sign.?in|unauthor/i.test(msg);
      return {
        title: "1Password",
        subtitle: denied ? "op rejected the service account token" : msg.slice(0, 160),
        state: denied ? "denied" : "offline",
        freshness: freshness(start),
        metrics: [{ label: "Status", value: denied ? "DENIED" : "ERROR", state: denied ? "denied" : "offline" }],
        summary: `1password: ${msg.slice(0, 160)}`,
      };
    }
  }
}

const adapter = new OnePasswordAdapter();
export { adapter as default };
