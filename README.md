# Homelab Dashboard

A generative homelab dashboard. You type a request into a chat box — *"show me
media library health"*, *"what's on fire in ops"* — and get a live dashboard
back, assembled from this repo's own components and fed by its own service
adapters. No dashboards to hand-build; the model composes them from a fixed
vocabulary of panels and queries real services for the data.

Built on [OpenUI](https://openui.com) (an LLM writes a compact DSL, a React
renderer draws it), Next.js 16, React 19, TypeScript and Tailwind 4.

## Where it runs

Production build under a **systemd user unit**, not `npm run dev`:

```
http://100.92.162.32:4180        # gh-ai, over the tailnet
```

The unit is `~/.config/systemd/user/homelab-dashboard.service`
(`Restart=always`, lingering enabled, so it survives logout and reboot).
Source changes require a rebuild — production does not hot-reload:

```bash
npm run build && systemctl --user restart homelab-dashboard
```

Logs: `.next/server.log`. Env: `EnvironmentFile=.env`, which holds the model
key and every adapter credential — a missing `.env` fails the unit loudly
rather than silently degrading every adapter to sample data.

> **Do not** stop it with a `pkill -f` pattern that can match its own command
> line — that once killed the invoking shell (exit 144). Use
> `systemctl --user restart homelab-dashboard`.

## How it works

```
chat box ──▶ /api/chat ──▶ model (DeepSeek via LiteLLM) ──▶ OpenUI DSL
                                                              │
                                          Renderer + defineComponent()
                                                              │
                        panels ──▶ toolProvider Query() ──▶ adapters ──▶ services
```

- **The model never sees raw CSS.** Styling is a closed enum
  (`SurfaceStyleSchema`) — the model picks from named surfaces, never a
  `className` or `style` string.
- **The prompt is grounded in the real registry.** The system prompt is
  handed the actual adapter names and world list derived from code, so the
  model queries services that exist instead of inventing them.
- **Prompt/renderer parity is gated in CI.** `scripts/check-parity.ts` fails
  the build if the prompt's component vocabulary and the renderer's components
  drift apart. The prompt has a hard 30k-token budget
  (`scripts/measure-prompt.ts`).

## Adapters: live data, honest failure

75 adapters across 8 worlds (media, ai, home, ops, infrastructure, security,
knowledge, personal). **As of 2026-08-02, 58 are genuinely live** — every
displayed value comes from a real fetch. The rest fall back to a labelled
fixture.

The core rule: **an adapter is registered only when its `query()` derives every
displayed value from a real fetch.** A stub that returns hardcoded numbers must
*not* register — it falls through to a fixture that is clearly marked as sample
data. This is why a service that is reachable but missing a credential renders
`denied` (naming the exact env var it needs) rather than hiding behind a
healthy-looking fake.

`/api/fleet` reports both a `healthy` and a **`live`** count per world and
overall. The `live` count — not `healthy` — is the real "is this connected"
number, because a fixture reports fabricated health. The home-page DEMO DATA
banner is driven by `fleet.overall.live > 0`.

### Adapter states

| state | meaning |
|---|---|
| `healthy` / `warning` / `critical` | live, and this is the service's real condition |
| `empty` | live and reachable, but the service has nothing in it (0 tasks, 0 spools) |
| `denied` | reachable, but the credential is missing or rejected — the panel names the env var |
| `offline` | configured, but nothing answered within the 4s timeout |
| `stale` | last-known data, past its freshness window |
| *fixture* | no live adapter registered — labelled sample data |

### Registration layout

Live registration is split into one module per world under
`src/lib/registration/<world>.ts`, aggregated by `registration/index.ts` and
called last from `initAdapters()` in `src/lib/adapter-runtime.ts`. The split
exists so several worlds can be wired in parallel without colliding on one
file. Adapters gate on the service **URL/endpoint**, not the credential.

### Wiring a new adapter

1. Write the adapter under `src/adapters/<world>/` implementing `DataAdapter`.
   **Every network call must go through `src/lib/adapter-http.ts`** — it
   enforces the 4s timeout and classifies failures (timeout → offline,
   401/403 → denied, 5xx → critical). Node's `fetch` has no default timeout;
   one dead host once hung a whole world for ~130s.
2. Register it in `src/lib/registration/<world>.ts`, gated on its URL env var.
3. Add the env var to `.env` (and a placeholder to `.env.example`).
4. `npm run build && systemctl --user restart homelab-dashboard`, then confirm
   the panel reports `live` at `/api/fleet`.

Copy `src/adapters/ops/prometheus-adapter.ts` for the canonical shape.

## Configuration

Copy `.env.example` to `.env` and fill in what you have. Every `.env*` file is
gitignored except `.env.example` — **never commit real credentials.** Secrets
live in 1Password (vault "Gregory") and `~/.hermes/.env`; regenerate rather
than commit.

## Development

```bash
npm ci
npm run dev                 # http://localhost:3000 — hot reload, fixtures unless .env is set

npx tsc --noEmit            # type-check
npm run check:parity        # prompt/renderer vocabulary must match
npm run lint                # eslint --max-warnings 0
npm run build               # production build (also type-checks for real)
npx tsx scripts/measure-prompt.ts   # prompt token budget (hard gate: 30k)
```

`AGENTS.md` and `IMPLEMENTATION_PLAN.md` carry the phase-by-phase history and
the guard rails that keep past bugs fixed. Read them before making changes.
