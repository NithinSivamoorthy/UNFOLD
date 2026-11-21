/**
 * Approximate view selection for multiview generation. Pure logic (no native imports) so it can be
 * unit-tested. Slot names follow Tripo's multiview image slots (front/left/back/right). Expo Go can't
 * measure camera pose, so these are evenly spaced picks along the capture sequence, shown to the user as
 * approximate and editable.
 */
export const VIEW_SLOTS = ['front', 'left', 'back', 'right'] as const;
export type ViewSlot = (typeof VIEW_SLOTS)[number];
export type ViewSelection = Record<ViewSlot, number | null>;

/** Evenly spaced frame indices for a single walk around the object starting at its front. */
export function autoPickViews(frameCount: number): ViewSelection {
  if (frameCount <= 0) return { front: null, left: null, back: null, right: null };
  const at = (fraction: number) => Math.min(frameCount - 1, Math.round(fraction * frameCount));
  return { front: 0, left: at(0.25), back: at(0.5), right: at(0.75) };
}

/** Users may circle either way; this flips the side slots without touching front/back. */
export function swapSides(sel: ViewSelection): ViewSelection {
  return { ...sel, left: sel.right, right: sel.left };
}

/** Keeps a selection valid after frame `removed` is deleted from the sequence. */
export function reindexAfterRemoval(sel: ViewSelection, removed: number): ViewSelection {
  const out = { ...sel };
  for (const k of VIEW_SLOTS) {
    const v = out[k];
    if (v == null) continue;
    out[k] = v === removed ? null : v > removed ? v - 1 : v;
  }
  return out;
}

export const isComplete = (sel: ViewSelection) => VIEW_SLOTS.every((k) => sel[k] != null);

/** Angular distance between two headings in degrees (0..180). */
const angDist = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
};

/**
 * Picks four distinct frames whose measured device headings are closest to 0/90/180/270° from the
 * start. Headings come from the gyro (device turn), so the result is still approximate. Which side is
 * "left" depends on the walking direction, hence Swap L/R in the UI.
 */
export function pickByHeading(headings: number[]): ViewSelection {
  const targets: Record<ViewSlot, number> = { front: 0, left: 90, back: 180, right: 270 };
  const used = new Set<number>();
  const sel: ViewSelection = { front: null, left: null, back: null, right: null };
  for (const slot of VIEW_SLOTS) {
    let best: number | null = null;
    headings.forEach((h, i) => {
      if (used.has(i)) return;
      if (best == null || angDist(h, targets[slot]) < angDist(headings[best], targets[slot])) best = i;
    });
    if (best != null) {
      sel[slot] = best;
      used.add(best);
    }
  }
  return sel;
}
