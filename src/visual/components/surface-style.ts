import { z } from "zod";

/**
 * Closed-enum visual styling for the Surface wrapper.
 *
 * The model NEVER gets raw className or style. Every visual property is a
 * closed enum mapping to a CSS class on .cnv-surface. That keeps the prompt
 * surface tiny and leaves no CSS escape hatch for the model to invent.
 */
export const SurfaceStyleSchema = z.object({
  /** Panel translucency. Uses oklch(... / alpha) in the CSS layer. */
  translucency: z.enum(["none", "subtle", "medium", "strong"]).optional(),
  /** Backdrop blur strength — this is the glass effect. Maps to backdrop-filter. */
  blur: z.enum(["none", "sm", "md", "lg"]).optional(),
  /** Background treatment. Flat color cannot do gradients, so these are separate classes. */
  background: z.enum(["solid", "gradient", "accent"]).optional(),
  /** Box-shadow elevation depth. */
  elevation: z.enum(["none", "sm", "md", "lg"]).optional(),
  /** Glow. "state" glows in the panel's health color; "accent" uses series-1. */
  glow: z.enum(["none", "state", "accent"]).optional(),
});
export type SurfaceStyle = z.infer<typeof SurfaceStyleSchema>;

/** Column span within a DashboardGrid. Placement, not appearance. */
export const SpanSchema = z.number().int().min(1).max(12).optional();
/** Row span for taller panels. */
export const RowSpanSchema = z.number().int().min(1).max(3).optional();

export interface GridSpan {
  span?: number | undefined;
  rowSpan?: number | undefined;
}

/**
 * Extra props every visual component accepts, on top of its own data props.
 * Kept as one shared type so the 25 component signatures stay readable.
 */
export interface SurfaceExtras {
  surfaceStyle?: SurfaceStyle | undefined;
  span?: number | undefined;
  rowSpan?: number | undefined;
}

/**
 * Build the className for a Surface from its style props + state.
 * Every branch maps to a CSS class — no raw style ever leaks through.
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
    if (style.blur && style.blur !== "none") classes.push(`bl-${style.blur}`);
    if (style.background && style.background !== "solid")
      classes.push(`bg-${style.background}`);
    if (style.elevation && style.elevation !== "none")
      classes.push(`el-${style.elevation}`);
    if (style.glow && style.glow !== "none") classes.push(`gl-${style.glow}`);
  }
  if (span) {
    if (span.span) classes.push(`col-${span.span}`);
    if (span.rowSpan && span.rowSpan > 1) classes.push(`row-${span.rowSpan}`);
  }
  return classes.join(" ");
}
