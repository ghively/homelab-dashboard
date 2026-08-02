// Spoolman (personal view) — filament actually on hand.
//
// Same service as the `spoolman` panel in the storage world, same SPOOLMAN_URL;
// the difference is the question. Storage asks "is the inventory service
// healthy"; this panel asks "do I have filament to print with tonight", so it
// leads with remaining weight, spools running low, and what was used last.
//
// Everything comes from the Spoolman REST API:
//   GET /api/v1/info      → version and build
//   GET /api/v1/spool     → every spool with its remaining weight
//   GET /api/v1/filament  → filament definitions
//   GET /api/v1/vendor    → vendors
//
// An empty database renders `empty`, not `healthy`. Spoolman here currently
// holds zero spools, and a personal panel claiming a healthy filament stock
// while the drawer is empty would be exactly the kind of comfortable lie this
// dashboard is being cleaned of.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import {
  ADAPTER_FANOUT_TIMEOUT_MS,
  failureResult,
  fetchJson,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";

const URL_ENV = "SPOOLMAN_URL";

/** Below this many grams a spool is not worth starting a long print on. */
const LOW_GRAMS = 200;
/** Below this it is effectively finished. */
const SPENT_GRAMS = 25;

interface SpoolFilament {
  name?: string;
  material?: string;
  vendor?: { name?: string };
  color_hex?: string;
}

interface Spool {
  id: number;
  filament?: SpoolFilament;
  remaining_weight?: number;
  used_weight?: number;
  location?: string;
  archived?: boolean;
  last_used?: string;
  price?: number;
}

interface SpoolmanInfo {
  version?: string;
  db_type?: string;
}

function grams(n: number | undefined): number {
  return Number.isFinite(n) ? (n as number) : 0;
}

function spoolLabel(s: Spool): string {
  const f = s.filament ?? {};
  return f.name || `${f.vendor?.name ?? ""} ${f.material ?? ""}`.trim() || `spool ${s.id}`;
}

export class SpoolmanPersonalAdapter implements DataAdapter {
  readonly name = "spoolman-personal";
  readonly description = "Spoolman — filament on hand for personal printing.";
  readonly category = "personal" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[URL_ENV] || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const configured = process.env[URL_ENV];
    if (!configured) return notConfiguredResult(this.name, "Spoolman", URL_ENV);

    const base = `${configured.replace(/\/$/, "")}/api/v1`;
    const start = Date.now();

    try {
      const spools = await fetchJson<Spool[]>(`${base}/spool`);

      const [info, filaments, vendors] = await Promise.all([
        fetchJson<SpoolmanInfo>(`${base}/info`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
        fetchJson<unknown[]>(`${base}/filament`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
        fetchJson<unknown[]>(`${base}/vendor`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
      ]);

      const active = spools.filter((s) => !s.archived);
      const usable = active.filter((s) => grams(s.remaining_weight) > SPENT_GRAMS);
      const low = usable.filter((s) => grams(s.remaining_weight) < LOW_GRAMS);
      const spent = active.filter((s) => grams(s.remaining_weight) <= SPENT_GRAMS);
      const totalRemaining = active.reduce((n, s) => n + grams(s.remaining_weight), 0);

      const materials = new Map<string, number>();
      for (const s of usable) {
        const m = s.filament?.material ?? "unknown";
        materials.set(m, (materials.get(m) ?? 0) + grams(s.remaining_weight));
      }

      const metrics: Metric[] = [
        { label: "Filament On Hand", value: Math.round(totalRemaining), unit: "g" },
        { label: "Usable Spools", value: usable.length, state: usable.length ? "healthy" : "empty" },
        { label: "Running Low", value: low.length, state: low.length ? "warning" : "healthy" },
        { label: "Spent", value: spent.length },
        ...(filaments ? [{ label: "Filament Types", value: filaments.length }] : []),
        ...(vendors ? [{ label: "Vendors", value: vendors.length }] : []),
        { label: "Version", value: info?.version ?? "unknown" },
      ];

      const items: Item[] = [
        ...usable
          .slice()
          .sort((a, b) => grams(a.remaining_weight) - grams(b.remaining_weight))
          .slice(0, 20)
          .map((s) => ({
            id: `spool:${s.id}`,
            label: spoolLabel(s),
            subtitle: [s.filament?.material, s.filament?.vendor?.name, s.location]
              .filter(Boolean)
              .join(" • "),
            value: `${Math.round(grams(s.remaining_weight))}g`,
            state: (grams(s.remaining_weight) < LOW_GRAMS ? "warning" : "healthy") as
              | "warning"
              | "healthy",
            group: "spools",
          })),
        ...[...materials.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([material, g]) => ({
            id: `material:${material}`,
            label: material,
            value: `${Math.round(g)}g`,
            state: "healthy" as const,
            group: "materials",
          })),
      ];

      // Nothing in the drawer is `empty` — the service is fine, the stock is not.
      const state: VisualQueryResult["state"] =
        usable.length === 0 ? "empty" : low.length > 0 ? "warning" : "healthy";

      return {
        title: "Filament — Spool Inventory",
        subtitle:
          usable.length === 0
            ? `Spoolman ${info?.version ?? ""} is up with no spools registered`
            : `${usable.length} usable spools • ${Math.round(totalRemaining)}g on hand • ${low.length} low`,
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        facets: materials.size
          ? [
              {
                name: "Material",
                values: [...materials.entries()].map(([label, g]) => ({
                  label,
                  count: Math.round(g),
                })),
              },
            ]
          : undefined,
        summary:
          usable.length === 0
            ? `Spoolman ${info?.version ?? ""} at ${base} answered normally but has no spools in its ` +
              `database (${spools.length} records total), so there is no filament inventory to report.`
            : `${usable.length} usable spools totalling ${Math.round(totalRemaining)}g; ` +
              `${low.length} below ${LOW_GRAMS}g, ${spent.length} spent.`,
      };
    } catch (err) {
      return failureResult(this.name, "Filament — Spool Inventory", base, err, start);
    }
  }
}

const adapter = new SpoolmanPersonalAdapter();
export { adapter as default };
