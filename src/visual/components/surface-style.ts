import { z } from "zod";

/**
 * Closed-enum visual styling for the Surface wrapper.
 *
 * Per AGENTS.md ground rule #3: the model NEVER gets raw className or style.
 * Every visual property is a closed enum that maps to a CSS class on .cnv-surface.
 * This keeps the prompt surface tiny and prevents CSS escape hatches.
 */
export const SurfaceStyleSchema = z.object({
  /** Panel translucency. Uses oklch(... / alpha) in the CSS layer. */
  translucency: z.enum(["none", "subtle", "medium", "strong"]).optional(),
  /** Backdrop blur strength. Maps to backdrop-filter. */
  blur: z.enum(["none", "sm", "md", "lg"]).optional(),
  /** Background treatment. "gradient" uses a pre-defined gradient class. */
  background: z.enum(["solid", "gradient", "accent"]).optional(),
  /** Box-shadow elevation depth. */
  elevation: z.enum(["none", "sm", "md", "lg"]).optional(),
  /** Glow effect. "state" glows in the panel's state color; "accent" uses series-1. */
  glow: z.enum(["none", "state", "accent"]).optional(),
});
export type SurfaceStyle = z.infer<typeof SurfaceStyleSchema>;

/**
 * Grid layout props — separate from visual style since they control
 * placement within a DashboardGrid, not the panel's appearance.
 */
export const GridSpanSchema = z.object({
  /** Column span (1-12) when inside a DashboardGrid. Omit for auto sizing. */
  span: z.number().int().min(1).max(12).optional(),
  /** Row span (1-3) for taller panels. */
  rowSpan: z.number().int().min(1).max(3).optional(),
});
export type GridSpan = z.infer<typeof GridSpanSchema>;

/**
 * Build the className string for a Surface from its style props + state.
 * Every branch maps to a CSS class — no raw style ever leaks.
 */
export function surfaceClass(
  state: string,
  style?: SurfaceStyle,
  span?: GridSpan,
): string {
  const classes = ["cnv", "cnv-surface", `state-${state}`];
  if (style) {
    if (style.translucency && style.translucency !== "none")
      classes.push(`tr-${style.translucency}`);
    if (style.blur && style.blur !== "none")
      classes.push(`bl-${style.blur}`);
    if (style.background && style.background !== "solid")
      classes.push(`bg-${style.background}`);
    if (style.elevation && style.elevation !== "none")
      classes.push(`el-${style.elevation}`);
    if (style.glow && style.glow !== "none")
      classes.push(`gl-${style.glow}`);
  }
  if (span) {
    if (span.span) classes.push(`col-${span.span}`);
    if (span.rowSpan && span.rowSpan > 1) classes.push(`row-${span.rowSpan}`);
  }
  return classes.join(" ");
}
