# Homelab Dashboard — Implementation Plan

**Repo:** `github.com/ghively/homelab-dashboard`
**Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, OpenUI (`@openuidev/react-lang` 0.2.9, `@openuidev/react-ui` 0.13.1, `@openuidev/lang-core` 0.2.10), Zod 4
**Goal:** A chat box that generates live, interactive homelab dashboards on demand, using this project's own component set and its own service adapters.

---

## READ THIS FIRST — Rules for whoever executes this plan

1. **Do the phases in order.** Phase N assumes Phase N−1 is done and verified. Do not skip ahead. Do not start Phase 2 because it looks more interesting than Phase 0.
2. **Do one task at a time.** Each task has a `VERIFY` block. Run it. If it fails, fix it before moving on.
3. **Do not delete the adapters.** `src/adapters/` and `src/lib/adapters/` contain ~11,800 lines of API-client code that is expensive to recreate. **Correction (Phase 6 audit): "it is correct" was wrong.** `src/lib/adapters/*` are genuine clients, but most modules under `src/adapters/` return hardcoded data from `query()` and never call the service. Keep them as scaffolding, but read the Phase 6 audit table before registering any of them.
4. **Do not "improve" things not in the plan.** No refactors, no renames, no dependency upgrades, no reformatting unrelated files.
5. **If a task's assumption is wrong** (a file is different from described, an API doesn't exist), STOP and report what you actually found. Do not guess and continue.
6. **After each phase, run `npm run build` and `npm run lint`.** Both must pass before continuing.

---

## Status — Phases 0-5 are DONE and merged

**All phases are complete.** Everything below describes work that is
already on `main`. Read those phases for context on *why* the code looks the
way it does — do not re-do them.

| Phase | Status | Landed in |
|---|---|---|
| 0 — Stop fabricating data | **DONE** | #5 |
| 1 — One real adapter (Emby) | **DONE** | #5 |
| 2 — Collapse 905 → ~25 | **DONE** | #6 |
| 3 — Wire the tool provider | **DONE** | #9 |
| 4 — Interactivity | **DONE** | #10 |
| 5 — Visual layer | **DONE** | #11 |
| — Type errors + honest build | **DONE** | #12 |
| **6 — Adapters** | **DONE — 30 live, 0 fabricating** | #14 |

Verified on `main` after the merges, from a clean `npm ci`:

```
tsc --noEmit          0 errors      (was 144)
npm run build         passes, and type-checks for real
prompt size           13,636 tokens (gate 30k)
```

`main` now has: a chat surface that generates dashboards from this repo's own
components, live adapter data via `Query()` with auto-refresh, filters and
drill-down, a 12-column grid, and glass/gradient/glow styling through closed
enums.

### Start here

**All six phases are done.** 30 adapters are registered and none fabricate data
— see the Phase 6 section at the bottom for the per-adapter audit and what was
rewritten. To wire a new service: add env vars to `.env.example`, register it in
`src/lib/adapter-runtime.ts` gated on those vars, and make sure its name exists
in `WORLDS` or no tool spec will be generated.

**Before registering anything, read its `query()`.** The lesson of Phase 6 is
that a module existing is not evidence that it works.

### Remaining loose ends

- **Nothing has been run against a live service.** Adapters were checked
  structurally (every displayed value derives from a parsed response) and
  against dead hosts (all render `offline` with no invented numbers). Running
  them against real endpoints needs credentials and network reach.
- **Drill-down click-through is unexercised.** Rows render and are declared
  clickable, but no browser session was available to click one.
- **Three services are validated live** (comfyui, litellm, synology-dsm); the
  other 27 are not. See the Phase 6 section for details.
- **`.github/workflows/ci.yml`.** Jobs are named `build` and `lint` to match
  `main`'s required status checks. Do not rename them without updating the
  branch protection rule — the repo previously had protection requiring checks
  that nothing produced, which blocked every merge. The `build` job also runs
  `npm run check:parity` and the 30k prompt gate. Lint is now blocking; do not
  reintroduce `|| true`.

## Historical record — what was wrong, and why the code looks like this

Every row below has been **fixed**. Kept because the fixes are non-obvious and
someone will otherwise "clean up" a guard that exists for a reason.

| Was broken | Fixed by | Guard to not remove |
|---|---|---|
| No adapter was ever called; `queryAdapter()` returned fixtures unconditionally | Phase 1 | A registered adapter that throws renders `offline` — it must never silently fall back to a fixture |
| `Query()` never executed — no `toolProvider` anywhere, and `executeFetch()` returns early and **silently** when it is null | Phase 3 | `toolProvider` is built once at module scope in `generative-chat.tsx`; a new object per render thrashes the query manager |
| Chart renderers fabricated data when given none (hardcoded `[20,44,31,72,58,84]`, `72%`, a sine wave, `50`) | Phase 0 | `NoData` states. Never reintroduce a numeric fallback |
| 905 components → ~350,000-token prompt, over most context windows | Phase 2 | `scripts/measure-prompt.ts` and the 30k gate |
| `&view=` was sent by the tool provider but read by nobody, so every view request returned the adapter's default query | Phase 3 | `view` threads through `/api/adapters` → `queryAdapter(name, state, view)` |
| Prompt examples called `Query("gitlab")` / `Query("synology")` — neither exists in `WORLDS` | Phase 3 | Tool names in examples must exist in `WORLDS` |
| 144 type errors hidden by `ignoreBuildErrors: true`, concealing a `ReferenceError` in `tdarr/adapter.ts` | #12 | Do not re-enable `ignoreBuildErrors` to make a red build green |
| `LineChart` and `Callout` were defined by both the OpenUI base set and the homelab set, so the Renderer threw `Duplicate schema id` on **every** dashboard | #14 | `src/lib/library.ts` and `prompt-library.ts` drop the OpenUI copy when a homelab component owns the name |
| The prompt library omitted `surfaceStyle/span/rowSpan`, which the renderer declares first, so all 25 shared components had their positional args offset by three and rendered blank; `FilterDropdown`, `Section` and `DashboardGrid` were missing from the prompt entirely | #14 | `npm run check:parity` fails the build on any prompt/renderer prop drift |
| `main` required 2 status checks while the repo had no workflows at all — nothing could merge | #9 | `.github/workflows/ci.yml` jobs are named `build` and `lint` to match the rule |

### The compounding bug — closed

The prompt mandated `Query()`, no `toolProvider` was wired so queries silently
resolved to empty defaults, and the chart renderers fabricated values when
given empty data. Together they rendered confident, invented numbers that
looked live and healthy.

Phase 0 removed the fabrication; Phase 3 wired the provider. Both halves are
closed. The guards in the table above are what keep it closed.

---

# PHASE 0 — Stop displaying fabricated data

**Why first:** Every later phase is verified by looking at the screen. Right now the screen looks correct even when everything behind it is broken. Fix that before anything else.

**Size:** ~half a day.

### Task 0.1 — Make `Chart()` honest

**File:** `src/visual/openui-visual-library-v4.tsx`

Find:
```tsx
function Chart({ data, multi = false }: { data: VisualData; multi?: boolean }) {
  const series = data.series.length ? data.series : [{ name: "value", points: [{ x: 0, y: 20 }, ... }];
```

The `: [{ name: "value", points: [...] }]` fallback invents six data points. Replace the fallback with an early return that renders the no-data state:

```tsx
function Chart({ data, multi = false }: { data: VisualData; multi?: boolean }) {
  if (!data.series.length) return <NoData label="No series data" />;
  const series = data.series;
  // ...rest unchanged
}
```

### Task 0.2 — Make `Capacity()`, `Wave()`, and `Bars()` honest

Same file. Three more fabrications:

- `Capacity()` — `const used = Number(data.metrics[0]?.value) || 72;` displays **72%** when there is no metric. Return `<NoData label="No capacity metric" />` when `data.metrics.length === 0` or the first metric's value is not numeric.
- `Wave()` — `data.series[0]?.points || Array.from({length: 48}, ...)` generates a sine wave. Return `<NoData label="No waveform data" />` when there are no points.
- `Bars()` — the `value: typeof m.value == "number" ? m.value : 50` fallback invents `50`. Skip non-numeric entries instead. If nothing numeric remains, return `<NoData label="No comparable values" />`.

### Task 0.3 — Add the `NoData` component

Same file, near `EmptyState`:

```tsx
function NoData({ label }: { label: string }) {
  return (
    <div className="cnv-state cnv-state-nodata">
      <strong>{label}</strong>
      <small>The source returned no data.</small>
    </div>
  );
}
```

Add matching CSS in `src/visual/cyber-noir-visual-components-v4.css`. Style it as clearly *absent* — muted, dashed border — not as a normal panel. It must not be mistakable for a real reading.

### Task 0.4 — Label the fixture data as fake

While `queryAdapter` still returns fixtures (until Phase 1), the UI must say so.

**File:** `src/components/dashboard.tsx`

Add a persistent banner in `DashboardShell` — e.g. `DEMO DATA — no live services connected` — rendered whenever the displayed result came from a fixture. Thread a `source: "fixture" | "live"` field through `VisualQueryResult` so this is driven by data, not a hardcoded flag. Phase 1 will flip individual adapters to `"live"`.

> **VERIFY PHASE 0**
> 1. `npm run build` and `npm run lint` pass.
> 2. `npm run dev`, open the dashboard. The DEMO DATA banner is visible.
> 3. Temporarily make `worldSpecificFixture` return empty arrays. Every panel shows a "no data" state. **No panel shows a number, a chart line, or a percentage.** Revert the temporary change.
> 4. `grep -n "|| 72\|20, 44, 31, 72\|: 50\b" src/visual/openui-visual-library-v4.tsx` returns nothing.

---

# PHASE 1 — Make one adapter real, end to end

**Why:** ~11,800 lines of finished adapter code is one bridge away from running. Build the bridge once with a single service; the rest becomes repetition.

**Target service:** Emby (`src/lib/adapters/emby/adapter.ts`, 485 lines, real endpoints, already typed).

**Size:** 1–2 days.

### Task 1.1 — Pick ONE adapter interface

There are currently three incompatible shapes:

1. `DataAdapter` interface — `src/adapters/adapter-base.ts`. Has `health()` and `query(params)` returning `VisualQueryResult`. **This is what `registry.ts` expects.**
2. `BaseAdapter` abstract class — `src/adapters/BaseAdapter.ts`. Has `fetch()` returning `AdapterResult`. Different return type.
3. Plain classes — `src/lib/adapters/*/adapter.ts`. Named methods (`queryPlaybackSessions()`, `queryLibraryOverview()`) returning `VisualQueryResult`.

**Decision: standardize on `DataAdapter` (shape 1).** It already matches the registry and already returns the right type.

Do **not** rewrite the existing adapters in this task. Instead write thin wrappers that expose an existing class as a `DataAdapter`. Create `src/lib/adapter-bridge.ts`:

```ts
import type { DataAdapter } from "@/adapters/adapter-base";
import type { VisualQueryResult, FreshnessInfo } from "@/adapters/types";

export function bridgeAdapter(opts: {
  name: string;
  description: string;
  category: DataAdapter["category"];
  health: () => Promise<FreshnessInfo>;
  queries: Record<string, () => Promise<VisualQueryResult>>;
  defaultQuery: string;
}): DataAdapter {
  return {
    name: opts.name,
    description: opts.description,
    category: opts.category,
    health: opts.health,
    async query(params) {
      const key = params?.query && opts.queries[params.query] ? params.query : opts.defaultQuery;
      return opts.queries[key]!();
    },
  };
}
```

### Task 1.2 — Resolve the duplicate contract files

`src/adapters/types.ts` and `src/lib/adapters/core/contracts.ts` define the same types (`Metric`, `Item`, `Series`, `Node`, `Edge`, `Event`, `VisualData`, `VisualQueryResult`).

Make `src/lib/adapters/core/contracts.ts` re-export from `src/adapters/types.ts` rather than redeclaring. If the two definitions have drifted, **report the differences and stop** — do not silently pick one.

### Task 1.3 — Build the config layer

`.env.example` currently contains only `OPENAI_*`. There is no way to give an adapter a URL or a key.

Create `src/lib/adapter-config.ts`:

```ts
export interface ServiceConfig { baseUrl: string; apiKey: string; extra?: Record<string, string>; }

export function getServiceConfig(service: string): ServiceConfig | null {
  const prefix = service.toUpperCase().replace(/-/g, "_");
  const baseUrl = process.env[`${prefix}_URL`];
  const apiKey  = process.env[`${prefix}_API_KEY`];
  if (!baseUrl || !apiKey) return null;   // not configured -> caller falls back to fixtures
  return { baseUrl, apiKey };
}
```

Add to `.env.example`:
```
# Emby
EMBY_URL=http://gh-media:8096
EMBY_API_KEY=
EMBY_USER_ID=
```

Returning `null` for unconfigured services is load-bearing — it is what makes the fixture fallback work for the other 76 adapters.

### Task 1.4 — Register Emby

Create `src/lib/adapter-runtime.ts`. It must be import-safe (no side effects beyond registration) and server-only.

```ts
import { registerAdapter } from "@/adapters/registry";
import { EmbyAdapter } from "@/lib/adapters/emby/adapter";
import { bridgeAdapter } from "./adapter-bridge";
import { getServiceConfig } from "./adapter-config";

let initialized = false;

export function initAdapters(): void {
  if (initialized) return;
  initialized = true;

  const emby = getServiceConfig("emby");
  if (emby) {
    const a = new EmbyAdapter({
      baseUrl: emby.baseUrl,
      apiKey: emby.apiKey,
      userId: process.env.EMBY_USER_ID,
    });
    registerAdapter(bridgeAdapter({
      name: "emby",
      description: "Emby media server",
      category: "media",
      health: () => a.health(),
      defaultQuery: "library",
      queries: {
        library:  () => a.queryLibraryOverview(),
        sessions: () => a.queryPlaybackSessions(),
        recent:   () => a.queryRecentlyAddedMovies(),
        resume:   () => a.queryContinueWatching(),
        series:   () => a.querySeries(),
        albums:   () => a.queryAlbums(),
      },
    }));
  }
}
```

Call `initAdapters()` at the top of both API route handlers: `src/app/api/adapters/route.ts` and `src/app/api/fleet/route.ts`.

### Task 1.5 — Route `queryAdapter` to real adapters

**File:** `src/lib/adapter-aggregator.ts:390`

Replace:
```ts
export async function queryAdapter(adapterName, state = "healthy") {
  const entry = ADAPTER_INVENTORY.find((a) => a.name === adapterName);
  if (!entry) return null;
  return worldSpecificFixture(adapterName, entry.world, state);
}
```

With:
```ts
export async function queryAdapter(
  adapterName: string,
  state: VisualStateValue = "healthy",
): Promise<VisualQueryResult | null> {
  const entry = ADAPTER_INVENTORY.find((a) => a.name === adapterName);
  if (!entry) return null;

  // Explicit fixture request (the sidebar state-fixture selector) always wins.
  if (state !== "healthy") return worldSpecificFixture(adapterName, entry.world, state);

  const adapter = getAdapter(adapterName);
  if (!adapter) return { ...worldSpecificFixture(adapterName, entry.world, state), source: "fixture" };

  try {
    const result = await adapter.query();
    return { ...result, source: "live" };
  } catch (err) {
    console.error(`[adapter:${adapterName}]`, err);
    // A failed live adapter must surface as offline — NOT as fixture data.
    return { ...worldSpecificFixture(adapterName, entry.world, "offline"), source: "live", state: "offline" };
  }
}
```

**Critical:** a registered adapter that throws must render `offline`. It must never silently fall back to fixtures — that would recreate the Phase 0 problem at a different layer.

> **VERIFY PHASE 1**
> 1. `npm run build` and `npm run lint` pass.
> 2. With no `EMBY_URL` set: dashboard behaves exactly as before, DEMO DATA banner visible.
> 3. With a valid `EMBY_URL` + `EMBY_API_KEY`: the Emby panel shows real library counts, banner no longer claims that panel is demo data.
> 4. With `EMBY_URL` set to a dead host: the Emby panel shows **offline**, not fake numbers, and does not crash the page.
> 5. `curl 'localhost:3000/api/adapters?adapter=emby'` returns `"source": "live"`.

---

# PHASE 2 — Collapse 905 components and mount the chat box

**Why:** This is the phase that delivers the actual goal. The two halves must ship together — mounting the chat box without collapsing the components produces a ~350k-token prompt that no model can accept.

**Size:** 3–5 days. The largest phase.

### Task 2.1 — Understand what is being collapsed

`src/visual/openui-visual-library-v4.tsx` registers 905 components from `visual-component-manifest-v4.json`. All 905 share one `VisualDataSchema`, and all route through a `switch` into **23 React functions**:

`Metrics, Artwork, Playback, Timeline, Chart, Bars, Network, Board, Table, Flow, Matrix, Capacity, Cloud, Callout, Wave, MarkdownReader, DocumentTree, KnowledgeGraph, Backlinks, SearchResults, KnowledgeHealthView, QueryEvidence, DocumentDiffView`

The collapse is lossy today and must not stay that way:
- `donut`, `gauge`, `treemap`, `sunburst`, `capacity` → all draw the same conic-gradient donut (138 components)
- `scatter`, `radar`, `multi-line`, `small-multiples` → all draw a **line chart**
- `map`, `floorplan`, `tree`, `chord`, `node-graph` → all draw the same SVG

### Task 2.2 — Define ~25 components with narrow schemas

Create `src/visual/components/` with one file per component. Target list:

```
MetricStrip  Gauge  Donut  LineChart  MultiLine  BarRank  Scatter  Heatmap
Timeline  EventStream  LogStream  NodeGraph  Sankey  Kanban  VisualTable
ArtworkWall  PlaybackSessions  Capacity  SecurityPosture  MarkdownReader
KnowledgeGraph  Backlinks  DetailPanel  Callout  EmptyState
```

**Each component gets only the fields it uses.** `Gauge` takes `{title, value, max, thresholds, state}` — not `items[]`, `nodes[]`, `edges[]`, `html`, `selectedId`, `query`.

**Delete these dead fields entirely.** They are in `VisualDataSchema` and read by no renderer: `html`, `query`, `selectedId`, `updatedAt`, `density`.

**Where the current collapse is lossy, either implement it properly or delete the alias.** Do not ship `Scatter` that draws a line chart. If real scatter/heatmap/treemap rendering is out of scope for this phase, do not register those component names at all — a missing component is honest; a lying one is not.

Each component uses `defineComponent`:

```tsx
"use client";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";   // zod 4 is installed; the bare "zod" import IS v4 here

export const Gauge = defineComponent({
  name: "Gauge",
  props: z.object({
    title: z.string(),
    value: z.number(),
    max: z.number().optional(),
    unit: z.string().optional(),
    thresholds: z.object({ warning: z.number(), critical: z.number() }).optional(),
    state: VisualStateSchema.optional(),
  }),
  description:
    "Single-value radial gauge for a bounded metric (disk %, CPU %, memory %). " +
    "Use when there is ONE number with a known maximum. For an unbounded number use MetricStrip. " +
    "thresholds color the arc: at/above warning = amber, at/above critical = red.",
  component: ({ props }) => <GaugeView {...props} />,
});
```

**The `description` field is a prompt, not documentation.** It is injected verbatim into the model's system prompt. Every description must state: what it is, what the non-obvious props do, and **when to choose it over the similar component**. Descriptions without that last part cause the model to pick wrong.

### Task 2.3 — Keep the signatures short

**Trap:** OpenUI's prompt generator emits component signature lines and nothing else. There is **no type-definitions section**. Nested object schemas that aren't registered get expanded inline into *every* signature that uses them — this is what produced the 1,381-char signatures.

Two ways to keep signatures short, in order of preference:

1. **Narrow schemas** (Task 2.2). A `Gauge` that takes 6 scalar fields has a short signature regardless.
2. For genuinely shared shapes (`Metric`, `Item`, `Series`, `Event`), call `tagSchemaId(MetricSchema, "Metric")` — imported from `@openuidev/react-lang` — so the signature reads `metrics: Metric[]` instead of the full inlined shape. **Then you MUST define `Metric` somewhere the model can see it**, because the prompt has no type section. Put the definitions in the component group's `notes` array, which IS emitted:

```ts
const visualGroup = {
  name: "Homelab Visuals",
  components: [...],
  notes: [
    "Shared types used in the signatures above:",
    "  Metric = {label: string, value: string|number, unit?: string, trend?: number, state?: VisualState}",
    "  Item   = {id: string, label: string, subtitle?: string, value?: string|number, state?: VisualState}",
    "  Series = {name: string, unit?: string, points: {x: string|number, y: number}[]}",
    "  Event  = {id: string, at: string, title: string, detail?: string, state?: VisualState}",
    "  VisualState = healthy | warning | critical | offline | stale | loading | empty | denied",
  ],
};
```

Skipping the notes produces signatures referencing types the model has never seen. That is worse than inlining.

### Task 2.4 — Preserve the 905 names as service knowledge

The 905 domain names (`FilamentUsage`, `WazuhAlerts`, `EmbyPlayback`, …) are real knowledge about the homelab and must not be lost.

They stop being *component names* and become *tool descriptions* in Phase 3. Keep `visual-component-manifest-v4.json` in the repo as the source of that mapping. Create `src/visual/manifest-map.ts` exporting a lookup from service/domain → recommended component, and feed a condensed version into the prompt's `additionalRules` — e.g. `"For Spoolman filament data prefer Gauge + Timeline."` Condensed. Not 905 lines.

### Task 2.5 — Build the library

Rewrite `src/lib/library.ts`:

```ts
import { createLibrary } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { homelabComponents, homelabGroup } from "@/visual/components";

export const library = createLibrary({
  root: openuiLibrary.root,
  componentGroups: [...(openuiLibrary.componentGroups ?? []), homelabGroup],
  components: [...Object.values(openuiLibrary.components), ...homelabComponents],
});
```

Delete `src/lib/library-spec.ts` and `src/generated/spec.json`. They exist to feed the old 905-component path and are replaced by `library.prompt()`. **Confirm nothing else imports them before deleting.**

### Task 2.6 — Measure the prompt

Add `scripts/measure-prompt.ts` that imports the library, calls `library.prompt(promptOptions)`, and prints character count and an estimated token count (chars ÷ 4).

**Hard gate: under 30,000 tokens.** If it is over, the schemas are still too wide — go back to Task 2.2. Do not proceed with a prompt over 30k.

### Task 2.7 — Rewrite the prompt examples for the new components

**This task is mandatory and must land in the same commit as Task 2.2.**

`src/lib/prompt-options.ts` contains three worked `examples` that reference
component names from the 905-manifest — `PipelineOverview`, `PipelineJobTable`,
`DiskSpace`, `LiteLLMHealth`, `OllamaStatus`, `ComfyQueue`. Collapsing to ~25
components deletes every one of those names.

Stale examples are worse than no examples: the model copies them, emits
components that no longer exist, and the renderer drops them with an "Unknown
component" error. Rewrite all three using the new names.

Also update these `additionalRules` entries, which will become false:

- The rule naming `renderer_family` values ("donut for distributions, timeline
  for events…") — renderer families stop existing in Task 2.2. Replace with
  guidance keyed to the new component names.
- The rule listing domain components by service name — re-point at the
  service→component map from Task 2.4.
- Leave *"There is no separate Grid component"* in place for now. It is correct
  today. **Phase 5.4 adds a grid and must delete this rule.**

### Task 2.8 — Point the chat surface at the new library, and remove the dead path

The chat surface already exists (`src/components/generative-chat.tsx`) and
already renders `<Renderer library={library} .../>`. It needs no structural
change here — Task 2.5 rewrites `src/lib/library.ts` underneath it.

Two clean-ups:

1. `src/app/api/chat/route.ts` still builds its prompt from `librarySpec`
   (905 components). Switch it to `library.prompt(promptOptions)`. This is the
   change that actually drops the prompt from ~350k to under 30k.
2. **Delete the dead keyword-matching path.** `src/app/page.tsx` now mounts the
   real `<GenerativeChat />`, but `AIQueryInput`, `matchRecipe()`, and
   `QUERY_RECIPES` still exist beside it, along with the `?query=` branch in
   `src/app/api/adapters/route.ts`. Remove all of it. Fake AI sitting next to
   real AI guarantees someone debugs the wrong one.

> **VERIFY PHASE 2**
> 1. `npm run build` and `npm run lint` pass.
> 2. `npx tsx scripts/measure-prompt.ts` prints **under 30,000** estimated tokens.
> 3. The chat surface on `/` still loads and streams.
> 4. Typing "show me a gauge at 80% for disk usage" renders a real gauge.
> 5. Typing "show me a timeline of recent events" renders a timeline, not a gauge — proving descriptions disambiguate.
> 6. No "Unknown component" errors in the console — proves Task 2.7 caught every stale example.
> 7. `grep -rn "matchRecipe\|QUERY_RECIPES\|librarySpec" src/` returns nothing.

---

# PHASE 3 — Live data inside generated dashboards

**Why:** Without this the model inlines literal numbers it made up at generation time. The dashboard is a frozen snapshot of a guess.

**Size:** 2–3 days.

### Task 3.1 — Understand why this phase is small

This phase would have been awkward with OpenUI's built-in `AgentInterface`,
which has no `toolProvider` prop and renders `<Renderer>` without one
internally — you would have had to override `components.AssistantMessage` to
get around it.

**That problem does not apply here.** `src/components/generative-chat.tsx` calls
`<Renderer>` directly, so wiring tools is a one-prop change to code this repo
already owns. The hand-rolled chat surface is an asset. Do not swap it for
`AgentInterface`.

### Task 3.2 — Expose adapters as tools

Create `src/lib/tools.ts`. One tool per adapter query, built from the registry so it stays in sync:

```ts
export const toolSpecs: ToolSpec[] = [
  {
    name: "emby_library",
    description: "Emby library overview: item counts per library, total size, server health.",
    inputSchema: {},
    outputSchema: { /* JSON Schema of VisualQueryResult */ },
    annotations: { readOnlyHint: true },
  },
  // ...
];
```

Pass `toolSpecs` as `tools` in `promptOptions` so the model learns `Query()`/`Mutation()` and `@Run`.

Note the tool names in the existing `examples` are already bare service names —
`Query("gitlab", ...)`, `Query("sabnzbd", ...)`, `Query("litellm", ...)`. Either
name your tools to match, or update the examples. They must agree; a `Query()`
naming a tool that doesn't exist fails at runtime.

**Watch the prompt budget.** Tool specs are added to the prompt. Re-run `scripts/measure-prompt.ts` after adding them; the 30k gate still applies. If tools push it over, trim descriptions or expose fewer, coarser tools.

### Task 3.3 — Wire the tool provider

This is the single change that makes every `Query()` in the existing prompt
examples actually run. `ToolProvider` accepts a plain function map — no MCP
server required:

```tsx
const toolProvider = {
  emby_library:  () => fetch("/api/adapters?adapter=emby&query=library").then(r => r.json()),
  emby_sessions: () => fetch("/api/adapters?adapter=emby&query=sessions").then(r => r.json()),
};
```

Add it to **both** `<Renderer>` call sites in
`src/components/generative-chat.tsx` — the one rendering completed messages and
the one rendering the live stream. Missing the second means queries only resolve
after streaming finishes.

```tsx
<Renderer response={...} library={library} isStreaming={...} toolProvider={toolProvider} />
```

Define `toolProvider` once at module scope, not inline in JSX — a new object
every render will thrash the query manager.

### Task 3.4 — Enable auto-refresh

`Query`'s fourth argument is a refresh interval in seconds:

```
health = Query("emby_library", {}, {items: []}, 30)
```

Add an `additionalRules` entry telling the model to use 30–60s intervals for live status panels and to omit the interval for historical data.

> **VERIFY PHASE 3**
> 1. Ask the chat surface for "current Emby library size". The generated code contains a `Query(...)` call, not literal numbers.
> 2. Network tab shows the fetch firing, and re-firing on the refresh interval.
> 3. Stop Emby. The panel transitions to `offline`. It does not display stale numbers as current.
> 4. **The compounding bug is closed:** generate a dashboard, then break the tool
>    endpoint. Panels show empty/offline states — never a plausible-looking chart.
>    This is the check that proves Phase 0 and Phase 3 together did their job.

---

# PHASE 4 — Interactivity

**Why:** `visual-component-manifest-v4.json` advertises `"interactions": "filter, inspect, drill down"` on all 905 components. None of it is implemented.

**Size:** 2–3 days.

### Task 4.1 — Filters that re-run queries

Mark filter props reactive and read them with `useStateField`:

```tsx
props: z.object({
  name: z.string(),
  value: reactive(z.string().optional()),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
}),
component: ({ props }) => {
  const field = useStateField(props.name, props.value);
  return <select value={field.value ?? ""} onChange={e => field.setValue(e.target.value)}>...</select>;
}
```

When a `$variable` bound this way appears in a `Query`'s args, the query re-fetches automatically. No extra wiring.

### Task 4.2 — Drill-down

Use `useTriggerAction()` in `VisualTable`, `NodeGraph`, `ArtworkWall`, `Kanban`. Clicking a row sends a follow-up message identifying the entity, so the model can generate a detail view.

### Task 4.3 — Nesting

Give container components (`DetailPanel`, `Kanban`, and a new `Section`) a `children` prop typed as a union of the other components' `.ref` values, rendered with `renderNode(props.children)`. Keep the unions tight — a union of everything lets the model nest a dashboard inside a table cell.

> **VERIFY PHASE 4**
> 1. Generate a dashboard with a time-range dropdown. Changing it visibly re-fetches.
> 2. Clicking a table row produces a detail view.
> 3. A generated layout nests panels inside a section without console errors.

---

# PHASE 5 — The visual layer

**Why:** `src/visual/cyber-noir-visual-components-v4.css` is 7.6KB containing **0** `backdrop-filter`, **0** `opacity`, **0** `box-shadow`, **0** `transition`, **0** `animation`, and 4 gradients.

**Size:** 3–4 days.

### Task 5.1 — Un-minify the CSS

The file is one line. Expand it to readable, commented source. No visual change — verify by screenshot comparison before and after.

### Task 5.2 — Delete the duplicated components

`VisualPanel` and `MetricStrip` in `src/components/dashboard.tsx` are copies of `Surface` and `Metrics` in `src/visual/openui-visual-library-v4.tsx`. Keep the visual-library versions; import them in `dashboard.tsx`; delete the copies.

### Task 5.3 — Build the `Surface` wrapper

Expose visual control to the model as **closed enums only**. Never a raw `style` or `className` prop — the model will emit invalid CSS.

```ts
translucency: z.enum(["none", "subtle", "medium", "heavy"]).optional(),
blur:         z.enum(["none", "sm", "md", "lg"]).optional(),   // backdrop-filter
background:   z.enum(["flat", "gradient", "image", "mesh"]).optional(),
elevation:    z.enum(["flat", "raised", "floating"]).optional(),
glow:         z.enum(["none", "state"]).optional(),            // "state" ties glow to health
```

Each enum maps to a CSS class. Translucent surfaces need `oklch(... / alpha)` values — flat `background-color` cannot do gradients, which is why gradients need their own class.

### Task 5.4 — Build the grid layout

Stock OpenUI is flex-only: `direction`, `gap`, `align`, `justify`, `wrap`, with no width/height/span. "This chart spans 8 of 12 columns" is currently inexpressible.

Add a `DashboardGrid` component (CSS Grid, 12 columns, responsive) and a `span` prop on its children (`1–12`, plus `rowSpan`). Document the pattern in the group `notes` so the model actually uses it.

**Delete the now-false prompt rule.** `src/lib/prompt-options.ts` contains
*"There is no separate Grid component."* It is correct until this task and wrong
after it. Remove it in the same commit, and replace it with guidance on when to
use `DashboardGrid` versus `Stack`.

### Task 5.5 — Motion

Add `transition` on state changes and a subtle entrance animation as panels stream in. Respect `prefers-reduced-motion`.

> **VERIFY PHASE 5**
> 1. Generate "a glass-panel dashboard with disk usage spanning half the width" — get translucency, blur, and a correct grid span.
> 2. A panel in `critical` state glows red when `glow: "state"`.
> 3. `grep -c "backdrop-filter" src/visual/*.css` is greater than 0.
> 4. `grep -rn "className\|style:" src/visual/components/*/schema.ts` returns nothing — no raw CSS escape hatch reached the model.

---

# PHASE 6 — The remaining 76 adapters

> ## PHASE 6 COMPLETE — 30 adapters live, zero fabricated data
>
> **Rule 3 of this plan said `src/adapters/` contained "~11,800 lines of working
> API-client code" that "is correct". That was false.** Every module was audited
> by reading its `query()`. Most returned hardcoded values and never contacted
> the service — registering them as-is would have stamped invented numbers with
> `source: "live"`, re-opening the compounding bug Phases 0 and 3 closed.
>
> Rather than register the honest subset and stop, every fabricating adapter was
> rewritten. **No `DataAdapter` in the repo fabricates data any more.**
>
> ### Registered and live (30)
>
> | how | adapters |
> |---|---|
> | genuine clients, bridged | `emby` `sonarr` `radarr` `sabnzbd` `tdarr` `romm` |
> | already real, registered as-is | `pihole` `unifi` `watchtower-vps` `watchtower-media` `watchtower-storage` `searxng` `caddy` `spoolman` |
> | **rewritten to call the real API** | `ollama` `litellm` `comfyui` `syncthing` `synology-dsm` `garage-s3` `wazuh-manager` `wazuh-indexer` `wazuh-dashboard` `fail2ban` `cloudflare-dns` |
> | rewritten as measured reachability probes | the five `hermes-*` |
>
> ### What was rewritten, and what it used to invent
>
> | adapter | before | now |
> |---|---|---|
> | `synology-dsm` | the plan's own #1 priority, and entirely mock — 3 volumes, 8 disks with temperatures, "DS1817+ • 13 drives" | DSM `SYNO.API.Auth` login → `SYNO.Storage.CGI.Storage` |
> | `wazuh-manager` | mixed real agent counts with invented "Security Alerts: 847" and fabricated events naming a source IP and an `/etc/passwd` change | agent status counts only, all from `/agents/summary/status` |
> | `wazuh-indexer` | real cluster health padded with "47 indices", "2.4M docs", a fake alert series | `_cluster/health` + `_cat/indices` |
> | `wazuh-dashboard` | fetched `/api/status`, discarded it, returned "Security Score: 87" and a fake CVE event | real plugin/service status from that response |
> | `syncthing` | real device counts, but a hardcoded four-folder list | `/rest/config/folders` + per-folder `/rest/db/status` |
> | `fail2ban` | silently substituted invented jails when the API returned nothing | throws → renders `offline` |
> | `litellm` `ollama` `comfyui` | self-labelled `*-mock` model lists and spend | `/v1/models`, `/api/tags` + `/api/ps`, `/system_stats` + `/queue` |
> | `garage-s3` | held S3 keys it never used; hardcoded buckets | Garage **admin** API (S3 needs SigV4, hence the switch) |
> | `cloudflare-dns` | real, but unconfigurable — class unexported, credentials literal `"[REDACTED]"` | class exported, credentials from env |
>
> ### Declared no-data rather than faked (no API reachable from this process)
>
> `valkey` (Redis wire protocol, needs a TCP client), `smb-nfs` (SSH + `df`),
> `iot-vlan` (use `unifi` instead), `omniroute` (dashboard API undocumented).
> These render an explicit `NOT IMPLEMENTED` state. The five `hermes-*` services
> have no documented metrics API, so they report only what is measurable:
> reachability, HTTP status, latency.
>
> ### Deliberately untouched
>
> - Root `WazuhIndexerAdapter.ts` / `WazuhManagerAdapter.ts` are older duplicates
>   of the `security/` modules. Neutralized to a `SUPERSEDED` state so they can
>   never shadow the working adapter under the same name.
> - `cicd/*` (`gitlab`, `ansible`, `gitlab-runner`, `github-actions`) implement
>   `ServiceAdapter`, a different interface. They are absent from `WORLDS`, so no
>   tool spec exists and they can never render a panel. Out of scope here.
> - `1panel` is real but absent from `WORLDS` — add it there to enable it.
>
> ### Verified
>
> ```
> tsc --noEmit     0 errors
> npm run build    passes
> npm run lint     135 problems (was 153) — 18 fewer, no new errors
> measure-prompt   13,636 tokens (gate 30k), unchanged
> ```
>
> - no env → 0/30 registered, every service serves a labelled fixture
> - all env → 30/30 registered
> - all 30 against a dead host → every one renders `offline`/`critical`/`empty`
>   with **zero numeric metrics, zero events, zero series**
> - static scan → no `DataAdapter` has a `query()` that both skips the network
>   and omits a no-data declaration
>
> **Caveat:** adapters were verified structurally (values derive from parsed
> responses) and against dead hosts. They have not been run against live
> services — that needs credentials and network reach.

**Size:** Ongoing. Repetitive, not hard.

For each service: add env vars to `.env.example`, add a `bridgeAdapter` registration in `src/lib/adapter-runtime.ts`, add tool specs in `src/lib/tools.ts`, verify live and dead-host behavior.

**Rules:**
- Unconfigured adapters must keep falling back to fixtures with `source: "fixture"`. Never break the dashboard for services not yet wired.
- Re-run `scripts/measure-prompt.ts` after every batch. The 30k gate is permanent.
- Work in priority order. Suggested: Synology → Sonarr/Radarr → Pi-hole → UniFi → Wazuh → Home Assistant → the rest.

---

# APPENDIX A — API cheat sheet

Verified against the installed versions. Do not deviate.

```tsx
// Defining a component
import { defineComponent } from "@openuidev/react-lang";
defineComponent({ name, props /* z.object */, description /* prompt text */, component /* ({props, renderNode}) => JSX */ })

// Building a library
import { createLibrary } from "@openuidev/react-lang";
createLibrary({ root?, components: [...], componentGroups?: [...], id? })

// Generating the system prompt
library.prompt(promptOptions)      // returns a string

// Chat UI
<AgentInterface llm={llm} componentLibrary={library} components={{ AssistantMessage }} />

// Direct rendering with tools
<Renderer library={library} response={code} isStreaming={bool} toolProvider={fnMapOrMcpClient} />

// Hooks (inside a component renderer only)
useStateField(name, value)   // two-way binding; pair with reactive() on the prop schema
useTriggerAction()           // click -> follow-up message
useRenderNode()              // render child nodes
useIsStreaming()             // is this message still arriving

// Naming a shared schema in signatures
import { tagSchemaId } from "@openuidev/react-lang";
tagSchemaId(MetricSchema, "Metric");
```

# APPENDIX B — Traps

1. **Zod must be v4.** OpenUI throws a hard error on v3 schemas. This repo has zod `^4.4.3`, so the bare `import { z } from "zod"` is v4 and is correct here. Do **not** "fix" it to `zod/v4` — that subpath is for projects on zod 3.25+.
2. **`"use client"` at the top of every component file.** Missing it produces confusing Next.js server-component errors.
3. **The prompt has no type-definitions section.** Named types via `tagSchemaId` MUST be defined in group `notes` or the model sees undefined type names.
4. **A null `toolProvider` fails silently.** `executeFetch()` starts with
   `if (!toolProvider) return;` — no error, no warning, queries just resolve to
   their defaults forever. If a `Query()` seems to do nothing, check this first.
   (OpenUI's built-in `AgentInterface` has no `toolProvider` prop at all, which
   is one reason this repo's hand-rolled chat surface is worth keeping.)
5. **`description` is prompt text, not documentation.** Vague descriptions are the #1 cause of the model picking the wrong component.
6. **Never expose `className` or `style` to the model.** Closed enums only.
7. **Never let a failed adapter fall back to fixture data.** Failure renders `offline`. This is the entire point of Phase 0.
8. **Re-measure the prompt after any schema or tool change.** Under 30k tokens, always.
9. **Fixture fallback is intentional** for unconfigured services. Do not remove it; do not let it mask errors from *configured* ones.

# APPENDIX C — Definition of done

Verified by driving the running app against the real LiteLLM proxy on gh-arm.

- [x] **No panel ever displays a fabricated number.** All 30 registered adapters
      render `offline`/`critical`/`empty` against dead hosts with zero numeric
      metrics, events or series. Every remaining `DataAdapter` either fetches
      real data or declares `NOT IMPLEMENTED`.
- [x] **At least one adapter serves real data; unconfigured ones fall back
      visibly.** 30 register when configured, 0 when not; unconfigured returns
      `source: "fixture"`, configured-but-unreachable returns `source: "live"`
      with `state: "offline"`.
- [x] **`/generate` accepts a natural-language request and renders a working
      dashboard.** POST /api/chat returned valid code, server-rendered through
      the real Renderer and library.
- [x] **The system prompt is under 30,000 tokens.** 15,820.
- [x] **Generated dashboards fetch live data via `Query()` and auto-refresh.**
      The toolProvider exposes 75 tools; `Query("sonarr")` reaches
      /api/adapters and returns `source: "live"`. Generated `Query()` calls
      carry their refresh interval.
- [x] **Filtering and drill-down.** FilterDropdown renders a bound `<select>`
      and its `$variable` is threaded into `Query()` args, so selection
      re-runs the query. See the caveat below on click-through.
- [x] **Translucency, blur, gradients, and a 12-column grid.** DashboardGrid
      emits `cnv-grid` with `col-4`/`col-6`/`col-8`/`col-12` children;
      surfaceStyle emits `tr-medium`, `bl-md`, `gl-state`.
- [x] **`npm run build` and `npm run lint` pass.** Lint is fully clean — 0
      errors and 0 warnings, down from 153 problems. `--max-warnings 0` keeps it
      that way and CI no longer suppresses it with `|| true`.

### Live-service validation

Three adapters have now been run against the real services and returned correct
data:

| adapter | result |
|---|---|
| `comfyui` | 1 device, NVIDIA RTX 3060, 9.2 GB / 12.5 GB VRAM, queue empty |
| `litellm` | 22 models across the proxy |
| `synology-dsm` | 2 volumes, 13 disks, 35.3 TB / 49.8 TB used. Correctly reported `warning`: `volume_2` is full (15.3/15.3 TB) and DSM flags it `attention`. Real drive models and per-disk temperatures. |

For contrast, the mock `synology-dsm` this replaced claimed 3 volumes, 8 disks
and 32 TB. It was wrong in every particular — which is the case for treating
"a module exists" as evidence that it works.

**Watchtower was coded against an API that does not exist.** The three
`watchtower-*` adapters queried `/v1/containers`; Watchtower has no such
endpoint (its HTTP API is a token-gated `POST /v1/update` plus optional
`/v1/metrics`), verified by probing the live hosts — every path 404s. They now
query the Docker Engine API (`GET /containers/json?all=1`), which is the actual
source of container inventory. No Docker API is currently exposed on those
hosts, so they report `NOT CONFIGURED` until a read-only socket-proxy exists.

### Tailnet service map (port-scanned 2026-08-02)

The `.env.example` defaults were wrong about which host runs what. Verified:

| host | tailnet IP | listening |
|---|---|---|
| gh-ai | 100.92.162.32 | 443/8443 (TLS), 8080, 3000 |
| gh-arm | 100.65.126.126 | **litellm 4000**, ntfy 8080, 8082 (307) |
| gh-media | 100.116.139.100 | **emby 8096**, 80, 443 |
| gh-nvidia | 100.88.26.95 | **comfyui 8188** |
| gh-storage | 100.88.40.87 | **dsm 5000**, **sabnzbd 8080**, **syncthing 8384**, **sonarr 8989** |

Corrections this produced:
- Sonarr and SABnzbd were pointed at gh-media; they run on **gh-storage**.
- RomM was pointed at gh-media:8082; that port is on **gh-arm**.
- **There is no `gh-vps` node.** 100.92.162.32 is gh-ai. The `watchtower-vps`
  adapter keeps its name (it is in `WORLDS`; renaming drops the tool spec) but
  its labels now say gh-ai.
- **Ollama is not listening** on gh-nvidia:11434 — the port is closed, so it
  likely binds to localhost. Radarr, Tdarr and the Caddy admin API (2019) were
  not found listening on any tailnet host.

### What is still NOT verified

- **27 of 30 adapters have not touched a live service.** `emby`, `sonarr`,
  `sabnzbd` and `syncthing` are confirmed reachable and only need an API key.
  `ollama`, `radarr`, `tdarr` and `caddy` are not listening anywhere on the
  tailnet. The rest need credentials.
- **Drill-down click-through was not exercised.** VisualTable/Kanban rows are
  declared clickable and the components render; actually clicking one needs a
  browser session, which was not available.
- **Rendering was verified server-side**, not in a real browser. That is
  stricter in one way (it executes the real Renderer and library) and weaker in
  another (no user interaction, no CSS paint).
