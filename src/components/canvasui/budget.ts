"use client";

/**
 * WebGL context budget for Canvas UI effects.
 *
 * Every Canvas UI effect allocates its own WebGL2 context. Browsers cap how
 * many can be live at once — Chrome around 16 — and when you exceed it the
 * oldest contexts are silently killed, so panels start dropping their effect at
 * random as you scroll. That failure is far uglier than never having the effect.
 *
 * A world view can render 15+ panels beside 8 world tiles, so "wrap everything
 * in Glass" is not viable. This hands out a fixed number of slots, first come
 * first served, and everything past the limit renders the CSS glass instead —
 * which already looks good. The result degrades by *position on the page*
 * rather than at random.
 *
 * The reserve exists so the hero and the chat can always claim a slot even when
 * a long panel list mounts first.
 */

/**
 * Chrome starts evicting at around 16 live contexts, and 15 left no headroom
 * whatsoever — the dashboard hit "Too many active WebGL contexts. Oldest
 * context will be lost" immediately and the earliest panels went dead. The
 * browser's ceiling is per-process and shared with everything else on the page,
 * so budgeting right up to it was never going to hold.
 *
 * Eight is deliberately conservative. Effects are an accent; a page where every
 * panel shimmers is noise anyway, and panels past the budget get the CSS glass,
 * which looks good on its own.
 */
const MAX_EFFECTS = 8;
const RESERVED = 3; // hero, chat, sidebar — claimed via `priority`

let used = 0;
let reservedUsed = 0;

export type Slot = { granted: boolean; release: () => void };

/**
 * Claim a context slot. `priority` draws from the reserve, so a late-mounting
 * hero is not starved by a page full of panels.
 */
export function claimSlot(priority = false): Slot {
  if (priority && reservedUsed < RESERVED) {
    reservedUsed++;
    return {
      granted: true,
      release: () => {
        reservedUsed = Math.max(0, reservedUsed - 1);
      },
    };
  }
  if (used < MAX_EFFECTS - RESERVED) {
    used++;
    return {
      granted: true,
      release: () => {
        used = Math.max(0, used - 1);
      },
    };
  }
  return { granted: false, release: () => {} };
}

/** Diagnostics for the lab page. */
export function budgetState() {
  return { used, reservedUsed, max: MAX_EFFECTS, reserved: RESERVED };
}
