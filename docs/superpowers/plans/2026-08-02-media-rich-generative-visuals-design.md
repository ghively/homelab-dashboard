# Media-Rich Generative Visuals Design

## Intent

Make the dashboard visually rewarding and easy to re-enter for an ADHD user
without abandoning the existing cyber-noir identity. Media should feel like a
real library rather than an operations table, and every generated dashboard
should have enough depth, motion, and contrast to hold attention.

The design is “cinematic but controlled”: poster art, glow, layered glass,
animated data paths, and clear focal points, with motion and color assigned to
meaning rather than sprayed across every element.

## Experience principles

1. **One focal point per panel.** A chart’s latest value, a media panel’s
   featured poster, and a capacity panel’s used percentage are visually
   dominant. Supporting values stay quieter.
2. **Attention follows meaning.** Entry animation introduces a panel, pulses
   identify live state, and moving dashes show flow. Static historical data
   does not constantly animate.
3. **Color groups information.** Existing cyan, magenta, violet, green, amber,
   and red tokens remain the only palette. State colors keep their semantic
   meaning.
4. **Progressive disclosure.** Poster rails show title, year, quality, rating,
   and progress at a glance; deeper metadata remains behind drill-down.
5. **Reliable fallbacks are designed states.** Missing artwork becomes an
   intentional cover tile. It never becomes an empty hole, browser icon, or
   white rectangle.
6. **Reduced motion remains first-class.** Every decorative animation has a
   `prefers-reduced-motion` off-ramp.

## Information architecture

### Media world

The Media world keeps operational summaries but promotes visual content:

- a compact metric strip for library health;
- a poster-led grid or rail whenever an adapter supplies artwork;
- progress and quality badges on active or resumable items;
- ordinary rows only for queue, error, and non-image data.

The generic adapter card chooses presentation from the returned data shape.
It does not hard-code Emby, Sonarr, or Radarr presentation rules.

### Generated dashboards

Generated output receives more horizontal room than conversational text.
User messages and the composer retain their readable measure, while rendered
dashboards may use the available application width.

`ArtworkWall` gains a closed `layout` enum:

- `grid`: balanced responsive poster library;
- `rail`: horizontal, browseable “continue watching” shelf;
- `feature`: one dominant title with a supporting poster strip.

The model still cannot emit CSS, `className`, or raw `style`. Component
descriptions and examples tell it when each layout is appropriate.

`PlaybackSessions` becomes a media card rather than a generic three-column
row. It displays only metadata actually returned by the adapter. In
particular, it must not label an unknown stream as “direct”.

## Artwork in this phase

This phase does not configure connectors or change adapter networking.
Components continue accepting the existing optional `Item.image` URL.
Local, abstract cyber-noir covers provide deterministic poster-rich
design-preview data so the layouts can be designed and verified without
service credentials.

## Shared visual flare

All generated components inherit a stronger shared surface:

- a restrained accent bloom at the top edge;
- layered glass with a faint inner highlight;
- hover lift only on interactive elements;
- staggered entry animation scoped to the generated result;
- denser header hierarchy and clearer state pills.

Charts add data-specific motion:

- line charts draw once and fade in their area wash;
- endpoints glow and remain the primary reading;
- bar ranks grow from zero with a short stagger;
- gauges and donuts reveal once without perpetual rotation;
- topology links use directional dash flow;
- critical live points may pulse, while healthy historical points remain
  still.

Animation timing stays short (roughly 180–700 ms) and uses the existing easing
tokens. Nothing flashes, bounces indefinitely, or changes layout while being
read.

## Responsive behavior

- At wide widths, generated dashboards can use the full content pane and the
  12-column grid.
- At medium widths, media rails retain horizontal scrolling while other grids
  collapse to six columns.
- At phone widths, poster grids keep two useful columns where possible;
  feature layouts become a single stack.
- Text labels truncate only when the full value is available via accessible
  name or title.

## Verification

The implementation adds deterministic checks for artwork URL security,
poster-rich component markup, honest playback metadata, and chart animation
hooks. Design previews use actual local cover assets. Final verification
includes TypeScript, parity, prompt-size, build, lint, and browser inspection
at desktop, tablet, mobile, and reduced-motion settings.

