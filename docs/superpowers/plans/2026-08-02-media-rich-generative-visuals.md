# Media-Rich Generative Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver reliable poster artwork, cinematic media layouts, and ADHD-friendly visual energy across all model-generated dashboard components without weakening data honesty, security, responsiveness, or the cyber-noir aesthetic.

**Architecture:** Media adapters will convert upstream artwork references into a same-origin, allowlisted proxy URL; a server route will fetch those images using server-only credentials. Existing generated components will gain closed layout variants and shared animation hooks, while component descriptions and prompt examples steer the model toward the correct data-shaped visual.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod 4, OpenUI `@openuidev/react-lang`, CSS/SVG animation, Node `node:test` through `tsx`.

## Global Constraints

- Base all work on `main`, using one `codex/` feature branch for this phase.
- Never display fabricated values; missing media metadata is omitted or rendered as `NoData`.
- A configured adapter failure remains `offline`; fixture fallback must not mask it.
- Do not expose `className` or raw `style` to the model; visual choices use closed enums.
- Keep the generated system prompt below 30,000 tokens.
- Keep Zod on v4 and use `import { z } from "zod"`.
- Do not add dependencies or perform unrelated refactors.
- `npm run build` and `npm run lint` must pass.
- Every animation must honor `prefers-reduced-motion`.

## User Scope Override — 2026-08-02

Connector setup and adapter networking are explicitly out of scope. Tasks 1
and 2 are skipped. Task 3 supplies artwork only to the deterministic design
preview. Task 4 modifies the generated component library only; it does not
change the normal Media-world adapter cards.

---

### Task 1: Secure artwork URL normalization

**Files:**
- Create: `src/lib/media-artwork.ts`
- Create: `scripts/tests/media-artwork.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: service base URLs already loaded by `getServiceConfig()`.
- Produces: `ArtworkService`, `toArtworkProxyUrl(service, rawUrl, baseUrl)`, and `resolveArtworkTarget(path, baseUrl)`.

- [ ] **Step 1: Add the failing URL-security tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveArtworkTarget,
  toArtworkProxyUrl,
} from "../../src/lib/media-artwork";

test("converts a same-origin Emby image to a same-origin proxy URL", () => {
  assert.equal(
    toArtworkProxyUrl(
      "emby",
      "http://gh-media:8096/Items/42/Images/Primary?tag=abc",
      "http://gh-media:8096",
    ),
    "/api/media-artwork?service=emby&path=%2FItems%2F42%2FImages%2FPrimary%3Ftag%3Dabc",
  );
});

test("accepts service-relative cover paths", () => {
  assert.equal(
    toArtworkProxyUrl("radarr", "/MediaCover/7/poster.jpg", "http://gh-media:7878"),
    "/api/media-artwork?service=radarr&path=%2FMediaCover%2F7%2Fposter.jpg",
  );
});

test("rejects cross-origin, protocol-relative, and non-http artwork", () => {
  assert.equal(toArtworkProxyUrl("emby", "https://evil.example/x.jpg", "http://gh-media:8096"), undefined);
  assert.equal(toArtworkProxyUrl("emby", "//evil.example/x.jpg", "http://gh-media:8096"), undefined);
  assert.equal(toArtworkProxyUrl("emby", "file:///etc/passwd", "http://gh-media:8096"), undefined);
});

test("resolved paths cannot change the configured origin", () => {
  assert.equal(resolveArtworkTarget("//evil.example/x.jpg", "http://gh-media:8096"), undefined);
  assert.equal(
    resolveArtworkTarget("/Items/42/Images/Primary?tag=abc", "http://gh-media:8096")?.href,
    "http://gh-media:8096/Items/42/Images/Primary?tag=abc",
  );
});
```

- [ ] **Step 2: Add a test script and verify the tests fail**

Add:

```json
"test:media": "tsx --test scripts/tests/media-artwork.test.ts"
```

Run: `npm run test:media`

Expected: FAIL because `src/lib/media-artwork.ts` does not exist.

- [ ] **Step 3: Implement the closed-service URL helper**

```ts
export const ARTWORK_SERVICES = ["emby", "sonarr", "radarr", "romm"] as const;
export type ArtworkService = (typeof ARTWORK_SERVICES)[number];

export function resolveArtworkTarget(path: string, baseUrl: string): URL | undefined {
  if (!path.startsWith("/") || path.startsWith("//") || /[\r\n]/.test(path)) return undefined;
  const base = new URL(baseUrl);
  const target = new URL(path, base);
  return target.origin === base.origin ? target : undefined;
}

export function toArtworkProxyUrl(
  service: ArtworkService,
  rawUrl: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!rawUrl) return undefined;
  const base = new URL(baseUrl);
  const target = rawUrl.startsWith("/") ? resolveArtworkTarget(rawUrl, baseUrl) : new URL(rawUrl);
  if (!target || target.origin !== base.origin) return undefined;
  const path = `${target.pathname}${target.search}`;
  return `/api/media-artwork?service=${service}&path=${encodeURIComponent(path)}`;
}
```

Guard `new URL(rawUrl)` with `try/catch` and return `undefined` for malformed
input.

- [ ] **Step 4: Run the focused tests**

Run: `npm run test:media`

Expected: PASS, four tests.

- [ ] **Step 5: Commit the normalization boundary**

```bash
git add package.json src/lib/media-artwork.ts scripts/tests/media-artwork.test.ts
git commit -m "test: define secure media artwork URLs"
```

---

### Task 2: Server-side authenticated artwork proxy

**Files:**
- Create: `src/app/api/media-artwork/route.ts`
- Modify: `src/lib/media-artwork.ts`
- Modify: `scripts/tests/media-artwork.test.ts`
- Modify: `src/lib/adapters/emby/adapter.ts`
- Modify: `src/lib/adapters/sonarr/adapter.ts`
- Modify: `src/lib/adapters/radarr/adapter.ts`
- Modify: `src/lib/adapters/romm/adapter.ts`

**Interfaces:**
- Consumes: `ArtworkService`, `resolveArtworkTarget()`, `toArtworkProxyUrl()`, and `getServiceConfig()`.
- Produces: `artworkRequestInit(service, apiKey)` and `GET(req)` at `/api/media-artwork`.

- [ ] **Step 1: Add failing authentication-header tests**

```ts
import { artworkRequestInit } from "../../src/lib/media-artwork";

test("uses the correct server-only authentication header", () => {
  assert.deepEqual(artworkRequestInit("emby", "secret").headers, {
    Accept: "image/*",
    "X-MediaBrowser-Token": "secret",
  });
  assert.deepEqual(artworkRequestInit("radarr", "secret").headers, {
    Accept: "image/*",
    "X-Api-Key": "secret",
  });
});
```

- [ ] **Step 2: Run the test and verify the missing export fails**

Run: `npm run test:media`

Expected: FAIL because `artworkRequestInit` is not exported.

- [ ] **Step 3: Implement request headers and the route**

`artworkRequestInit()` must return `Accept: image/*` plus:

- `X-MediaBrowser-Token` for Emby;
- `X-Api-Key` for Sonarr, Radarr, and configured RomM.

The route must:

```ts
const service = searchParams.get("service");
const path = searchParams.get("path");
if (!isArtworkService(service) || !path) {
  return NextResponse.json({ error: "Invalid artwork request" }, { status: 400 });
}
const config = getServiceConfig(service);
if (!config) {
  return NextResponse.json({ error: "Artwork service is not configured" }, { status: 404 });
}
const target = resolveArtworkTarget(path, config.url);
if (!target) {
  return NextResponse.json({ error: "Invalid artwork path" }, { status: 400 });
}
```

Fetch with the existing bounded-timeout helper, reject non-2xx responses and
non-`image/*` content types, and stream the bytes with:

```ts
{
  "Content-Type": contentType,
  "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
  "X-Content-Type-Options": "nosniff",
}
```

Never include upstream URLs, response bodies, or credentials in error JSON.

- [ ] **Step 4: Convert adapter image fields to proxy URLs**

Replace direct Emby client URLs:

```ts
image: item.ImageTags?.Primary
  ? toArtworkProxyUrl(
      "emby",
      `/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`,
      this.baseUrl,
    )
  : undefined,
```

Apply the same normalization to every image-producing query in Emby, Sonarr,
Radarr, and RomM. Preserve `undefined` when upstream supplies no usable image.

- [ ] **Step 5: Verify tests and types**

Run:

```bash
npm run test:media
npx tsc --noEmit
```

Expected: both pass.

- [ ] **Step 6: Commit the proxy**

```bash
git add src/app/api/media-artwork/route.ts src/lib/media-artwork.ts scripts/tests/media-artwork.test.ts src/lib/adapters/emby/adapter.ts src/lib/adapters/sonarr/adapter.ts src/lib/adapters/radarr/adapter.ts src/lib/adapters/romm/adapter.ts
git commit -m "feat: proxy authenticated media artwork"
```

---

### Task 3: Poster-rich fixture and preview data

**Files:**
- Create: `public/media-demo/dune.svg`
- Create: `public/media-demo/bear.svg`
- Create: `public/media-demo/severance.svg`
- Create: `public/media-demo/foundation.svg`
- Modify: `scripts/export-design-previews.tsx`
- Create: `scripts/check-visual-quality.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the existing `Item.image` contract.
- Produces: deterministic local image URLs for design-preview items, plus `npm run check:visual`.

- [ ] **Step 1: Add a failing visual-quality check**

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");

const artwork = fs.readFileSync(".design-export/components/ArtworkWall.html", "utf8");

assert.match(artwork, /data-art="image"/);
assert.match(artwork, /media-demo\/dune\.svg/);
console.log("PASS — poster-rich media preview");
```

Add:

```json
"check:visual": "npm run export:design && node scripts/check-visual-quality.cjs"
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `npm run check:visual`

Expected: FAIL because preview items have no artwork.

- [ ] **Step 3: Create four original abstract SVG covers**

Each SVG must use only the repository palette, include a distinct geometric
composition, use a `viewBox="0 0 600 900"`, and contain no externally loaded
fonts or images. Use accessible `<title>` text and keep each file below 15 KB.

`public/media-demo/dune.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" role="img">
  <title>Abstract desert planet cover</title>
  <defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#08070d"/><stop offset="1" stop-color="#d77a32"/></linearGradient></defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <circle cx="300" cy="260" r="170" fill="#ffb35c" opacity=".78"/>
  <path d="M0 620Q180 510 360 625T700 620V900H0Z" fill="#17101f"/>
  <path d="M0 710Q170 600 330 720T700 700V900H0Z" fill="#08070d"/>
</svg>
```

`public/media-demo/bear.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" role="img">
  <title>Abstract kitchen heat cover</title>
  <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#07151b"/><stop offset=".55" stop-color="#00b8d4"/><stop offset="1" stop-color="#ff7a45"/></linearGradient></defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <g fill="none" stroke="#eaffff" stroke-width="13" opacity=".62"><circle cx="300" cy="390" r="180"/><path d="M120 390h360M300 210v360"/></g>
  <path d="M80 780C180 620 420 620 520 780" fill="none" stroke="#ffcb74" stroke-width="34"/>
</svg>
```

`public/media-demo/severance.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" role="img">
  <title>Abstract divided office cover</title>
  <rect width="600" height="900" fill="#071015"/>
  <path d="M0 0h280v900H0z" fill="#00e5ff" opacity=".3"/>
  <path d="M320 0h280v900H320z" fill="#ff2bb5" opacity=".28"/>
  <g fill="none" stroke="#d9ffff" stroke-width="8" opacity=".62"><path d="M80 160h440M80 300h440M80 440h440M80 580h440M80 720h440"/><path d="M300 90v720"/></g>
  <circle cx="300" cy="450" r="76" fill="#09090e" stroke="#9dffef" stroke-width="10"/>
</svg>
```

`public/media-demo/foundation.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" role="img">
  <title>Abstract galactic orbit cover</title>
  <defs><radialGradient id="g"><stop stop-color="#bdfcff"/><stop offset=".14" stop-color="#6b4cff"/><stop offset=".55" stop-color="#170d35"/><stop offset="1" stop-color="#050509"/></radialGradient></defs>
  <rect width="600" height="900" fill="#050509"/>
  <circle cx="300" cy="430" r="270" fill="url(#g)"/>
  <g fill="none" stroke="#d8fbff" opacity=".48"><ellipse cx="300" cy="430" rx="255" ry="74" stroke-width="8"/><ellipse cx="300" cy="430" rx="110" ry="270" stroke-width="5" transform="rotate(38 300 430)"/></g>
  <circle cx="410" cy="340" r="18" fill="#ffcb66"/>
</svg>
```

- [ ] **Step 4: Attach the local covers to design-preview data**

Update preview `items` with `image`, `progress`, and optional `meta`:

```ts
{
  id: "1",
  label: "Severance",
  subtitle: "Apple TV+ · continuing",
  image: "/media-demo/severance.svg",
  progress: 0.62,
  state: "healthy",
  meta: { year: 2025, quality: "4K HDR" },
}
```

- [ ] **Step 5: Re-run export and confirm the poster preview passes**

Run: `npm run check:visual`

Expected: PASS.

- [ ] **Step 6: Commit fixture artwork and the visual guard**

```bash
git add public/media-demo scripts/export-design-previews.tsx scripts/check-visual-quality.cjs package.json
git commit -m "test: add poster-rich media previews"
```

---

### Task 4: Generated media layouts

**Files:**
- Modify: `src/visual/components/index.tsx`
- Modify: `src/visual/schemas.ts`
- Modify: `src/visual/cyber-noir-visual-components-v4.css`
- Modify: `scripts/check-visual-quality.cjs`

**Interfaces:**
- Consumes: proxied/local `Item.image`, `Item.progress`, and optional `Item.meta`.
- Produces: `ArtworkLayout = "grid" | "rail" | "feature"`, enhanced `ArtworkWall`, honest `PlaybackSessions`, and data-shaped adapter presentation.

- [ ] **Step 1: Extend the failing markup checks**

Read the playback preview and add assertions:

```js
const playback = fs.readFileSync(".design-export/components/PlaybackSessions.html", "utf8");
assert.match(artwork, /cnv-posters-layout-grid/);
assert.match(artwork, /cnv-media-meta/);
assert.doesNotMatch(playback, />direct</);
```

Add a second exported ArtworkWall preview using `layout: "rail"` and assert it
contains `cnv-posters-layout-rail`.

- [ ] **Step 2: Add the closed layout schema in both schema sources**

```ts
const ArtworkLayoutSchema = z.enum(["grid", "rail", "feature"]);
```

Add `layout: ArtworkLayoutSchema.optional()` to `ArtworkWall` in
`src/visual/components/index.tsx` and `src/visual/schemas.ts`. Keep `square`
for album art compatibility. Update the prompt description with exact
selection guidance for all three layouts.

- [ ] **Step 3: Extract one internal artwork tile**

Create an internal `ArtworkTile` that:

- uses `artProps(i.image)` and a designed no-art fallback;
- renders label and subtitle;
- renders progress only when present;
- renders year, quality, or rating only when those exact `meta` keys exist;
- applies keyboard/click drill-down behavior;
- never substitutes a missing metadata value.

- [ ] **Step 4: Implement grid, rail, and feature markup**

Use closed classes:

```tsx
<div className={`cnv-posters cnv-posters-layout-${props.layout ?? "grid"}`}>
```

`rail` is horizontally scrollable with scroll snapping. `feature` uses the
first item as a wide focal card and the remaining items as supporting posters.
`grid` uses responsive `minmax()` columns.

- [ ] **Step 5: Make playback metadata honest and media-rich**

Replace:

```tsx
<span>{String(i.meta?.mode ?? "direct")}</span>
```

with conditional rendering:

```tsx
{typeof i.meta?.mode === "string" && (
  <span className="cnv-media-badge">{i.meta.mode}</span>
)}
```

Show client, device, user, quality, and progress only when present. Use a
portrait artwork region, readable scrim, and a clear paused/active state.

- [ ] **Step 6: Add responsive cinematic CSS**

Implement:

- poster ratios and image-cover behavior;
- metadata scrims and badge clusters;
- horizontal rail snap points;
- feature-card backdrop and supporting strip;
- interactive hover lift/focus ring;
- two poster columns on narrow phones;
- no hover transform on non-interactive or reduced-motion contexts.

- [ ] **Step 7: Run focused checks**

Run:

```bash
npm run check:visual
npm run check:parity
npx tsc --noEmit
```

Expected: all three commands pass.

- [ ] **Step 8: Commit media presentation**

```bash
git add src/visual/components/index.tsx src/visual/schemas.ts src/visual/cyber-noir-visual-components-v4.css scripts/check-visual-quality.cjs
git commit -m "feat: add cinematic generated media layouts"
```

---

### Task 5: ADHD-friendly chart and shared-surface flare

**Files:**
- Modify: `src/visual/components/index.tsx`
- Modify: `src/visual/cyber-noir-visual-components-v4.css`
- Modify: `src/app/globals.css`
- Modify: `scripts/export-design-previews.tsx`
- Modify: `scripts/check-visual-quality.cjs`

**Interfaces:**
- Consumes: existing chart geometry, state classes, and design tokens.
- Produces: one-shot chart reveal hooks, directional topology motion, shared surface focus treatment, and reduced-motion overrides.

- [ ] **Step 1: Add exact failing chart-hook assertions**

```js
const line = fs.readFileSync(".design-export/components/LineChart.html", "utf8");
const network = fs.readFileSync(".design-export/components/NodeGraph.html", "utf8");
assert.match(line, /pathLength="1"/);
assert.match(line, /cnv-chart-line-reveal/);
assert.match(line, /cnv-chart-endpoint/);
assert.match(network, /cnv-network-flow/);
```

- [ ] **Step 2: Add semantic SVG animation hooks**

Set `pathLength={1}` on line paths and add `cnv-chart-line-reveal`. Give area
paths `cnv-chart-area-reveal`. Add a stable class to graph links that represent
directional flow. Do not change chart values, scale calculations, or labels.

- [ ] **Step 3: Add shared surface depth**

Use pseudo-elements and existing tokens to add:

- an accent bloom localized to the panel’s top edge;
- a one-pixel inner highlight;
- state-aware but restrained glow;
- a short panel entry reveal scoped under `.chat-rendered`;
- hover lift only for `.cnv-clickable`.

The pseudo-elements must use `pointer-events: none` and remain behind content.

- [ ] **Step 4: Add chart-specific motion**

```css
.cnv-chart-line-reveal {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: cnv-draw-line 700ms var(--ease-out-quart) forwards;
}

.cnv-chart-area-reveal {
  opacity: 0;
  animation: cnv-fade-area 420ms 180ms ease-out forwards;
}

.cnv-network-flow {
  stroke-dasharray: 5 8;
  animation: cnv-flow-dash 1400ms linear infinite;
}
```

Bar fills reveal with a short stagger. Gauge/donut rings fade and scale once.
Only active or critical live markers may pulse continuously.

- [ ] **Step 5: Add comprehensive reduced-motion overrides**

Under `@media (prefers-reduced-motion: reduce)`, set all new animation names to
`none`, restore final opacity and dash offset, and remove transform
transitions. Data and focus indicators must remain visible.

- [ ] **Step 6: Run the visual guard**

Run: `npm run check:visual`

Expected: PASS with the artwork, playback-honesty, and chart-motion assertions.

- [ ] **Step 7: Commit shared visual flare**

```bash
git add src/visual/components/index.tsx src/visual/cyber-noir-visual-components-v4.css src/app/globals.css scripts/export-design-previews.tsx scripts/check-visual-quality.cjs
git commit -m "feat: add focused motion and chart depth"
```

---

### Task 6: Prompt steering and wider generated canvas

**Files:**
- Modify: `src/lib/prompt-options.ts`
- Modify: `src/visual/manifest-map.ts`
- Modify: `src/visual/components/index.tsx`
- Modify: `src/visual/schemas.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `ArtworkWall.layout` and existing `DashboardGrid`.
- Produces: media-specific generation recipes and a wide rendered-dashboard measure.

- [ ] **Step 1: Add an exact media recipe**

Update the media example to generate:

```text
dashboard = DashboardGrid("Media", "Live library and playback", null, null, null, null, [nowPlaying, recent, continueWatching])
sessionData = Query("emby", {view: "sessions"}, {state: "healthy", items: []}, 30)
nowPlaying = PlaybackSessions(null, 12, null, sessionData.title, sessionData.subtitle, sessionData.state, sessionData.items)
recentData = Query("emby", {view: "recent-movies"}, {state: "healthy", items: []})
recent = ArtworkWall(null, 12, null, recentData.title, recentData.subtitle, recentData.state, recentData.items, false, "feature")
resumeData = Query("emby", {view: "continue-watching"}, {state: "healthy", items: []})
continueWatching = ArtworkWall(null, 12, null, resumeData.title, resumeData.subtitle, resumeData.state, resumeData.items, false, "rail")
```

Place `layout` after the existing `square` argument in both the runtime and
schema definitions so these positional calls match the emitted signature.

- [ ] **Step 2: Strengthen component-selection guidance**

Tell the model:

- media requests with image-bearing items prefer `ArtworkWall`;
- `feature` is for one visually dominant collection;
- `rail` is for resumable/recent sequences;
- operational counts remain `MetricStrip`;
- charts must use returned series and never synthesize points.

- [ ] **Step 3: Widen generated dashboards without widening prose**

Keep the composer and user message measure at 860 px. Allow
`.chat-msg-assistant .chat-rendered` and its grid to expand to the available
content width, capped around 1180–1240 px, with centered margins and safe
24 px gutters. Preserve single-column behavior below 700 px.

- [ ] **Step 4: Verify prompt and schema parity**

Run:

```bash
npm run check:parity
npx tsx scripts/measure-prompt.ts
npx tsc --noEmit
```

Expected: parity passes, prompt remains under 30,000 tokens, and types pass.

- [ ] **Step 5: Commit generation guidance**

```bash
git add src/lib/prompt-options.ts src/visual/manifest-map.ts src/visual/components/index.tsx src/visual/schemas.ts src/app/globals.css
git commit -m "feat: steer generated dashboards toward rich visuals"
```

---

### Task 7: Full verification and visual QA

**Files:**
- Modify only files required to correct failures found by the commands below.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: a verified media-rich dashboard with no generated artifacts or dev-server changes left in the worktree.

- [ ] **Step 1: Run the complete automated gate**

```bash
npm run test:media
npm run check:visual
npm run check:parity
npx tsc --noEmit
npx tsx scripts/measure-prompt.ts
npm run build
npm run lint
```

Expected: every command exits zero and the prompt is below 30,000 tokens.

- [ ] **Step 2: Inspect desktop behavior**

Start `npm run dev` and verify at 1440×1000:

- Generated `grid`, `rail`, and `feature` previews have distinct layouts.
- No white blocks, broken-image icons, or unreachable upstream URLs appear.
- Line, bar, donut, gauge, topology, and playback panels each have one clear
  focal point.

- [ ] **Step 3: Inspect tablet and mobile behavior**

At 1024×768 and 390×844 verify:

- rails scroll horizontally without widening the page;
- poster grids retain useful poster sizes;
- feature layouts stack;
- chart labels do not overlap;
- keyboard focus remains visible.

- [ ] **Step 4: Inspect reduced-motion behavior**

Emulate `prefers-reduced-motion: reduce` and verify all data remains visible,
line paths are at final dash offset, and no continuous flow/pulse animation
runs.

- [ ] **Step 5: Inspect network requests**

Verify design-preview artwork requests use local `/media-demo/*` paths and no
component emits a fabricated media metadata label.

- [ ] **Step 6: Clean generated files and review the diff**

Remove `.design-export/` if it remains, restore any generated `next-env.d.ts`
change, then run:

```bash
git status --short
git diff --check
git diff --stat main...HEAD
```

Expected: only intentional source, asset, test, and documentation changes.
