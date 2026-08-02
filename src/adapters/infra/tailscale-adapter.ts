// Tailscale adapter — mesh node inventory from the local tailscaled LocalAPI.
//
// tailscaled exposes its status over a unix socket, not TCP, so this uses
// undici's Agent with a socketPath rather than a URL host. That is also why
// there is no credential here: access to the socket *is* the credential, and
// the dashboard process already runs as the socket's owner.
//
// Gated on TAILSCALE_SOCKET so a host without tailscaled simply does not
// register the adapter instead of failing on every refresh.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Edge, Item, Metric, Node, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { ADAPTER_TIMEOUT_MS, failureResult, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";

const TAILSCALE_SOCKET = process.env.TAILSCALE_SOCKET || "";

interface TsPeer {
  HostName?: string;
  DNSName?: string;
  OS?: string;
  Online?: boolean;
  ExitNode?: boolean;
  ExitNodeOption?: boolean;
  TailscaleIPs?: string[];
  LastSeen?: string;
  RxBytes?: number;
  TxBytes?: number;
  PrimaryRoutes?: string[];
}

interface TsStatus {
  Version?: string;
  BackendState?: string;
  TailscaleIPs?: string[];
  Self?: TsPeer;
  Peer?: Record<string, TsPeer>;
  MagicDNSSuffix?: string;
}

async function readLocalApi(socketPath: string): Promise<TsStatus> {
  // Imported lazily and by name so the module graph stays server-only; undici
  // is already a direct dependency of this project.
  const { Agent, request } = await import("undici");
  const dispatcher = new Agent({
    connect: { socketPath },
    headersTimeout: ADAPTER_TIMEOUT_MS,
    bodyTimeout: ADAPTER_TIMEOUT_MS,
  });
  try {
    const res = await request("http://local-tailscaled.sock/localapi/v0/status", {
      dispatcher,
      headers: { Host: "local-tailscaled.sock" },
    });
    if (res.statusCode !== 200) {
      throw new Error(`tailscaled LocalAPI returned HTTP ${res.statusCode}`);
    }
    return (await res.body.json()) as TsStatus;
  } finally {
    await dispatcher.close().catch(() => {});
  }
}

function peerLabel(p: TsPeer): string {
  return p.HostName || p.DNSName?.split(".")[0] || "node";
}

class TailscaleAdapter implements DataAdapter {
  readonly name = "tailscale";
  readonly description = "Tailscale — mesh node inventory and connectivity.";
  readonly category = "network" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, TAILSCALE_SOCKET || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!TAILSCALE_SOCKET) {
      return notConfiguredResult(this.name, "Tailscale — Mesh Network", "TAILSCALE_SOCKET");
    }

    const start = Date.now();
    try {
      const status = await readLocalApi(TAILSCALE_SOCKET);
      const peers = Object.values(status.Peer ?? {});
      const online = peers.filter((p) => p.Online);
      const offline = peers.filter((p) => !p.Online);
      const exitNodes = peers.filter((p) => p.ExitNodeOption || p.ExitNode);
      const subnetRouters = peers.filter((p) => (p.PrimaryRoutes ?? []).length > 0);
      const running = status.BackendState === "Running";

      const metrics: Metric[] = [
        { label: "Backend", value: status.BackendState ?? "unknown", state: running ? "healthy" : "critical" },
        { label: "Nodes Online", value: `${online.length}/${peers.length}` },
        { label: "Offline", value: offline.length, state: offline.length ? "warning" : "healthy" },
        { label: "Exit Nodes", value: exitNodes.length },
        { label: "Subnet Routers", value: subnetRouters.length },
        { label: "Version", value: (status.Version ?? "unknown").split("-")[0]! },
      ];

      // Self first, then online peers, then offline — the node graph and the
      // item list read worst-last so the healthy mesh is legible at a glance.
      const ordered = [...online, ...offline];

      const items: Item[] = [
        ...(status.Self
          ? [
              {
                id: "self",
                label: `${peerLabel(status.Self)} (this host)`,
                subtitle: `${status.Self.OS ?? ""} • ${(status.Self.TailscaleIPs ?? []).join(", ")}`,
                value: status.Self.Online ? "online" : "offline",
                state: (status.Self.Online ? "healthy" : "offline") as "healthy" | "offline",
              },
            ]
          : []),
        ...ordered.map((p) => ({
          id: `peer:${peerLabel(p)}`,
          label: peerLabel(p),
          subtitle: [
            p.OS,
            (p.TailscaleIPs ?? [])[0],
            p.Online ? "online" : p.LastSeen ? `last seen ${p.LastSeen.slice(0, 10)}` : "offline",
          ]
            .filter(Boolean)
            .join(" • "),
          value: p.Online ? "online" : "offline",
          state: (p.Online ? "healthy" : "offline") as "healthy" | "offline",
        })),
      ];

      // A star topology centred on this host: that is what the LocalAPI can
      // actually attest to. Peer-to-peer paths between *other* nodes are not
      // observable from here, so no edge is drawn between them.
      const radius = 150;
      const nodes: Node[] = [
        { id: "self", label: status.Self ? peerLabel(status.Self) : "self", x: 250, y: 200, state: "healthy" },
        ...ordered.map((p, i) => {
          const angle = (2 * Math.PI * i) / Math.max(1, ordered.length);
          return {
            id: `peer:${peerLabel(p)}`,
            label: peerLabel(p),
            x: Math.round(250 + radius * Math.cos(angle)),
            y: Math.round(200 + radius * Math.sin(angle)),
            state: (p.Online ? "healthy" : "offline") as "healthy" | "offline",
          };
        }),
      ];
      const edges: Edge[] = ordered.map((p) => ({
        source: "self",
        target: `peer:${peerLabel(p)}`,
        state: (p.Online ? "healthy" : "offline") as "healthy" | "offline",
      }));

      return {
        title: "Tailscale — Mesh Network",
        subtitle: `${online.length}/${peers.length} peers online • backend ${status.BackendState ?? "?"}`,
        state: !running ? "critical" : "healthy",
        freshness: makeFreshness(this.name, TAILSCALE_SOCKET, start),
        metrics,
        items,
        nodes,
        edges,
        summary: `tailscaled ${status.BackendState ?? "?"}; ${online.length} of ${peers.length} peers online, ${exitNodes.length} exit node(s), ${subnetRouters.length} subnet router(s).`,
      };
    } catch (err) {
      return failureResult(this.name, "Tailscale — Mesh Network", TAILSCALE_SOCKET, err, start);
    }
  }
}

const adapter = new TailscaleAdapter();
export { adapter as default };
