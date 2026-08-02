# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this project is

A homelab dashboard built on [OpenUI](https://openui.com), a generative-UI
framework: an LLM writes a compact DSL and a React renderer draws it. You type
a request into a chat box and get a live dashboard back, built from this
repo's own components and fed by its own service adapters.

## Current state

**Phases 0-5 are done and merged.** `main` has a working generative chat
surface with live adapter data, filters, drill-down, a 12-column grid, and
glass/gradient/glow styling.

**Phase 6 (adapter wiring) is largely done.** As of 2026-08-02, **58 of 75
adapters are genuinely live** (`source: "live"`, every value from a real
fetch). Registration is now split into one module per world under
`src/lib/registration/<world>.ts` (aggregated by `registration/index.ts`,
called last from `initAdapters()`), so worlds can be wired in parallel without
colliding. `/api/fleet` exposes a per-world and overall **`live`** count — that,
not `healthy`, is the real "connected" number, since a fixture reports fake
health.

The 17 remaining fixtures are **phantom or unreachable**, each verified: honcho
(decommissioned), cognee, opencode, outline, disc-ripper, obsidian, garage-s3,
systemd, the 3 watchtowers (Watchtower has no container-listing API), spotify
(OAuth, no token), fail2ban (no HTTP surface), and pihole/unifi/iot-vlan
(LAN-only, not routable from the gh-ai VPS). These are candidates for removal
from `WORLDS`. Several `denied` panels flip to live once a credential is set —
see `.env.example` for which var each needs.

Verified on `main` from a clean `npm ci`:

```
tsc --noEmit     0 errors
npm run check:parity   PASS — 28 components
npm run build    passes, and type-checks for real
```

## Start here

**Read [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) before making any
change.** It has the phase-by-phase history, a table of what was broken and
which guards keep it fixed, and the Phase 6 instructions.

Base all work on `main`. The `phase*` and `claude/*` branches are merged or
superseded.

## Ground rules

1. **One phase, one branch, merged before the next starts.** Two agents working
   the same phase on parallel branches once produced a PR with 13 conflicts
   that had to be thrown away and re-ported.
2. **Verify before you build.** This file and the plan are documents; the code
   moves faster. Check the current state of a file before assuming the plan
   describes it.
3. **If reality doesn't match the plan, stop and report.** Do not guess and
   continue — that is the main way this work goes wrong.
4. **Do not delete the adapters.** `src/adapters/` and `src/lib/adapters/` hold
   ~11,800 lines of working API-client code. Most is not yet wired in; Phase 6
   turns it on.
5. **Stay in scope.** No refactors, renames, dependency bumps, or reformatting
   of files the task doesn't name.
6. **`npm run build` and `npm run lint` must pass** before anything is done.

## Non-negotiables

These are guards. Each exists because the opposite shipped and caused a real
problem. The plan's "Historical record" table has the details.

- **Never display a fabricated number.** Missing data renders `NoData`. A live
  adapter that fails renders `offline` — it must never silently fall back to
  fixture data.
- **The system prompt stays under 30,000 tokens.** Re-run
  `npx tsx scripts/measure-prompt.ts` after any schema or tool change. It was
  once ~350,000, which exceeded most context windows.
- **Never expose `className` or `style` to the model.** All styling is closed
  enums (`src/visual/components/surface-style.ts`).
- **A component's `description` is prompt text, not documentation.** It is
  injected verbatim into the model's system prompt. Say what the component is,
  what non-obvious props do, and when to choose it over the similar one.
- **Tool names in prompt examples must exist in `WORLDS`.** Examples once
  referenced `gitlab` and `synology`, neither of which was a real tool.
- **Do not re-enable `ignoreBuildErrors`** in `next.config.ts` to turn a red
  build green. It hid 144 type errors including a `ReferenceError`.
- **Fixture fallback is intentional** for services not yet configured. Don't
  remove it — and don't let it mask errors from services that *are* configured.

## Traps

- **A null `toolProvider` fails silently.** `executeFetch()` starts with
  `if (!toolProvider) return;` — no error, no warning, queries just resolve to
  their defaults forever. If a `Query()` seems to do nothing, check this first.
- **Zod must be v4.** This repo has `zod@^4`, so the bare `import { z } from "zod"`
  is correct. Do not "fix" it to `zod/v4`.
- **`reactive()` changes the inferred prop type** to a `StateField`, so a
  hand-written `ComponentRenderProps` annotation contradicts it. And
  `useStateField` infers and unwraps its own generic — an explicit `<string>`
  breaks it.
- **Hook-using renderers need named function expressions.** `component:` is a
  lowercase property, so `react-hooks/rules-of-hooks` can't tell they are React
  components and errors on every hook call.
- **The generated prompt has no type-definitions section.** Schemas named via
  `tagSchemaId` must be defined in the component group's `notes`, or the model
  sees type names it was never given.
- **Keep the hand-rolled chat surface.** `src/components/generative-chat.tsx`
  calls `<Renderer>` directly, which is what makes tool wiring a one-prop
  change. OpenUI's built-in `AgentInterface` has no `toolProvider` prop at all.

## CI

`.github/workflows/ci.yml` runs two jobs, **`build`** and **`lint`**. Those
names match `main`'s required status checks — **do not rename them** without
updating the branch protection rule. The repo previously required checks that
nothing produced, which blocked every merge for everyone.

`lint` currently runs with `|| true` because the repo carries 153 pre-existing
eslint problems. Clear that backlog, then make lint blocking.

## Commands

```bash
npm run dev                          # dev server
npm run build                        # type-checks for real; must pass
npm run lint                         # 153 pre-existing problems
npx tsx scripts/measure-prompt.ts    # prompt size; hard gate 30k
```
