# Syncing with the Cyber-Noir design system

The design system lives in the **"Gene Hively Cyber-Noir Design System"**
project on claude.ai/design (`projectId 019e0132-19e7-72f9-a565-996e00f955fd`).
It is the source of truth for colour, type, spacing, radius, glow and motion.

## What is mirrored, and what is translated

| design project | this repo | how |
|---|---|---|
| `colors_and_type.css` (`:root` block) | `src/app/design-tokens.css` | **near-literal copy** — safe to re-pull wholesale |
| `preview/components-*.html` | rules in `src/app/globals.css` | **translated** — needs a human/agent pass |
| `ui_kits/portfolio/*.jsx` | *not used* | portfolio-coupled; see below |

### Why the token layer is only *near*-literal

Two deliberate differences, both of which must be preserved on every re-pull:

1. **The element rules are dropped.** The source also styles `body`, `h2` and
   `h3` for a portfolio site — an `inline-block` h2 with 2rem margins and a
   purple underline. Vendoring those wrecks dashboard chrome. Only the `:root`
   block is taken.

2. **The font `@import` moves.** CSS requires every `@import` to precede all
   other rules. `design-tokens.css` is inlined *after* Tailwind's, so an
   `@import` inside it is invalid and fails the build with a 500. The
   JetBrains Mono import therefore lives at the top of `globals.css`.

### Why the JSX is not imported

`ui_kits/portfolio/*.jsx` assumes React as a global (`const { useState } =
React`), registers components on `window`, and hardcodes portfolio navigation.
It cannot be imported into this Next.js app. The component *specs* are what
transfer — see the "Design-system component adoption" section of `globals.css`,
which cites the exact preview file each rule came from.

## Pulling a change from the design project

1. Tweak the design in claude.ai/design.
2. Ask the agent to re-sync. It will:
   - `DesignSync get_file colors_and_type.css`
   - rewrite `src/app/design-tokens.css` with the new `:root`, keeping the two
     differences above
   - re-read any changed `preview/components-*.html` and update the matching
     rules in `globals.css`
3. Verify: `npm run build`, then confirm the new values appear in the CSS the
   browser actually receives — not just on disk.

**The remap is what makes this cheap.** `--dash-*` and `--cnv-*` resolve to
design tokens, so a palette change in the design project propagates to every
rule in the app without touching any of them.

## Pushing this repo's components *up* to the design project

`DesignSync` can write as well as read (`finalize_plan` → `write_files`). That
direction is for publishing a component library into the design project so it
renders as cards in the Design System pane. It is not currently used here, and
would need each component exported as a standalone preview HTML with a
`<!-- @dsCard ... -->` marker. Worth doing only if you want the dashboard's
panels reviewable alongside the rest of the system.
