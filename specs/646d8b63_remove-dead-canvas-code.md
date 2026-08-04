# Plan: Remove dead `supportsHtmlInCanvas` from the canvas components

## Goal

Fix obvious bugs and remove dead code across the in-scope React/canvas files,
**without changing any rendered output or prop behavior** and **without adding
features or refactors.**

## What I verified first (baseline)

- `npm ci` is installed (was missing).
- `npx tsc --noEmit` → **0 errors in `src/`** (the only tsc errors are in
  `adws/adw_data/harness_engineering/`, which is harness tooling, not the app,
  and is out of scope).
- `npx eslint <the 16 target files>` → **exit 0, no warnings.** `no-unused-vars`
  is enabled (warn) and the lint gate runs with `--max-warnings 0`, so there are
  already **no unused imports, locals, or arguments** in any of these files.
- Therefore the only dead code that remains is code lint **cannot** see: symbols
  that are `export`-ed but never imported anywhere.

## The dead code (single finding, in 7 files)

Each of the seven canvas effect files defines an identical, self-contained
helper:

```ts
export function supportsHtmlInCanvas(): boolean {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("canvas") as PaintableCanvas;
  const ctx = probe.getContext("2d") as ElementImageContext | null;
  return Boolean(
    ctx &&
    typeof ctx.drawElementImage === "function" &&
    typeof probe.requestPaint === "function",
  );
}
```

It is **dead**:

- It is never imported anywhere (no `from "@/components/canvasui/…"` references
  it; there is no barrel `index.ts` in `canvasui/`).
- It is never called inside its own file either. Each component decides the
  HTML-in-Canvas path from `content.parentElement === source` (the local
  `htmlInCanvas` boolean) and from `useSyncExternalStore(native-mode)`, not from
  this function.
- The functional probe that actually drives the gate lives in
  `src/components/canvasui/probe.ts` (`probeHtmlInCanvas`) and
  `native-mode.ts`; `Effect.tsx`'s comment documents that the gate deliberately
  does NOT check HTML-in-Canvas. The native-mode doc comment that *mentions*
  `supportsHtmlInCanvas()` is accurate history (it explains why native-mode
  exists) and stays.
- There are no test files referencing it.

It appears in exactly these 7 files (the line numbers are a guide; the builder
should match by the function name/signature):

| File | approx. line |
|------|--------------|
| `src/components/canvasui/Clouds.tsx` | 270 |
| `src/components/canvasui/DecryptReveal.tsx` | 506 |
| `src/components/canvasui/Frost.tsx` | 528 |
| `src/components/canvasui/Glass.tsx` | 273 |
| `src/components/canvasui/GlyphRain.tsx` | 325 |
| `src/components/canvasui/Grid.tsx` | 326 |
| `src/components/canvasui/Liquid.tsx` | 324 |

## Exact changes to make

In each of the 7 files above, **delete the whole `supportsHtmlInCanvas`
function** (the 9 lines shown above) plus the blank line that precedes/follows
it so the file does not end up with a doubled blank line. Leave everything else
untouched.

This is the complete set of changes. Nothing else is dead within these files
(lint already proves no unused imports/locals/args).

### Why removing it is behavior-safe

- It is never called, so deleting it cannot change any render, prop, or runtime
  path.
- Its only locals reference the file-local types `PaintableCanvas` and
  `ElementImageContext`; **both types are still used elsewhere in every one of
  these files** (the `source as PaintableCanvas` / `getContext("2d") as
  ElementImageContext` casts in each `createXxx`), so removing the function
  does **not** leave any import/type unused.
- It introduces no new behavior; it only removes unreachable code.

## How to verify

1. **Type-check:** `npx tsc --noEmit` → still 0 errors in `src/`. (The
   `adws/adw_data/...` errors are pre-existing harness files and unrelated; the
   builder should confirm no `src/` errors appear.)
2. **Lint:** `npx eslint <the 7 changed files>` (or `npm run lint`) → the 7
   files stay at 0 warnings.
3. **Build:** `npm run build` passes (it type-checks for real).
4. **No-references re-check:** `grep -rn "supportsHtmlInCanvas" src` should now
   return only the historical comment in `native-mode.ts` (and nothing else).

## Explicitly out of scope (do NOT do)

- Do **not** delete the `Clouds.tsx` component or `createClouds`. `Clouds` is
  not imported by `lab/page.tsx` (which imports Glass/Frost/Grid/Liquid/
  DecryptReveal/GlyphRain), so the *component* is currently unwired — but the
  file is a self-consistent, working WebGL effect, deleting ~700 lines of it is
  a scope/feature decision for the operator, not a dead-code cleanup, and
  AGENTS.md warns against deleting working code. Leave it. (Noted here only so
  the builder does not "helpfully" remove it.)
- Do **not** strip `export` from `effectsRequested` / `supportsWebGL2` in
  `Effect.tsx`. They are exported but used internally, so they are live, and
  changing their export status is a refactor.
- Do **not** edit the `native-mode.ts` doc comment that mentions
  `supportsHtmlInCanvas()`; it is accurate historical context.
- No visual/prop/behavior changes, no renames, no formatting churn in lines you
  are not deleting.

## Risk

Very low. Pure deletion of an uncalled, unimported helper in 7 files; behavior
is provably unchanged and the build/lint/type gates all still pass.
