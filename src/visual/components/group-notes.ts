/**
 * Shared group notes injected into the system prompt.
 *
 * Used by both the client render library and the server prompt library so the
 * prompt output stays consistent regardless of which code path generates it.
 */
export const homelabGroupNotes: string[] = [
  "Shared types used in the signatures above (define these inline in your Query defaults too):",
  "  Metric = {label: string, value: string|number, unit?: string, trend?: number, state?: VisualState}",
  "  Item   = {id: string, label: string, subtitle?: string, image?: string, value?: string|number, progress?: number(0-1), state?: VisualState, group?: string, meta?: Record}",
  "  Series = {name: string, unit?: string, points: {x: string|number, y: number}[]}",
  "  Event  = {id: string, at: string, title: string, detail?: string, state?: VisualState}",
  "  Node   = {id: string, label: string, x?: number, y?: number, state?: VisualState, value?: number}",
  "  Edge   = {source: string, target: string, label?: string, value?: number, state?: VisualState}",
  "  VisualState = healthy | warning | critical | offline | stale | loading | empty | denied",
  "  SurfaceStyle = {translucency?: none|subtle|medium|strong, blur?: none|sm|md|lg, background?: solid|gradient|accent, elevation?: none|sm|md|lg, glow?: none|state|accent}",
  "  GridSpan = {span?: 1-12, rowSpan?: 1-3}",
  "Every panel renders its own no-data state when its primary array is empty — do not fabricate values.",
  "Pick by data shape: Gauge (single bounded %), Donut (shares of whole), BarRank (ranked comparison),",
  "  LineChart/MultiLine (time trends), Timeline/EventStream (events), NodeGraph (topology),",
  "  Sankey (pipeline flow), Kanban (grouped work items), VisualTable (row list), ArtworkWall (images).",
  "Layout: use DashboardGrid for multi-column layouts (each child's span prop sets width on a 12-col grid),",
  "  Stack for simple vertical or wrapped rows, Section for titled grouped regions.",
  "Glass panels: pass surfaceStyle with translucency + blur for glassmorphism. glow: state for critical panels.",
];
