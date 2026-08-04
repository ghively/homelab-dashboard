# Remove dead `supportsHtmlInCanvas` from canvas effect files

## What changed

Removed an identical, never-called `supportsHtmlInCanvas()` function from seven
canvas effect files in `src/components/canvasui/`:

- Clouds.tsx
- DecryptReveal.tsx
- Frost.tsx
- Glass.tsx
- GlyphRain.tsx
- Grid.tsx
- Liquid.tsx

The function probed the DOM for `drawElementImage` and `requestPaint` support,
but was never imported by any other module and never invoked within its own file.
Each component already gates the HTML-in-Canvas path through a local
`htmlInCanvas` boolean derived from DOM parent checks and
`useSyncExternalStore(native-mode)`, and the real capability probe lives in
`probe.ts` (`probeHtmlInCanvas`).

## Why it matters

Dead exports inflate bundle size and create maintenance confusion — a reader
sees a `supportsHtmlInCanvas` signature and assumes something uses it. Lint's
`no-unused-vars` catches unused locals/imports but not unused exports, so this
slipped through. Seven copies of the same 11-line function is 77 lines of
noise removed with zero risk.

## Verification

```bash
# No remaining references (only the historical doc-comment in native-mode.ts)
grep -rn "supportsHtmlInCanvas" src

# Build still passes
npm run build

# Lint clean on the changed files
npx eslint src/components/canvasui/{Clouds,DecryptReveal,Frost,Glass,GlyphRain,Grid,Liquid}.tsx
```

## What was NOT changed

The request's scope listed additional files (`dashboard.tsx`, `decrypt-text.tsx`,
`generative-chat.tsx`, `Effect.tsx`, `budget.ts`, `native-mode.ts`, `probe.ts`,
`src/visual/components/index.tsx`, `surface-style.ts`). The spec confirmed those
files already have no unused imports, variables, or dead branches — lint proved
it with `--max-warnings 0`. The `Clouds` component itself was intentionally
left alone (it is not wired into any page but is a working ~700-line WebGL
effect; AGENTS.md warns against deleting working adapter/component code).
