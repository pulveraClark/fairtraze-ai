export const FLYOUT_WIDTH_PX = 352; // 22rem
const MARGIN_PX = 8;
// Height we would like to show when there is room (header + list + footer); only used to choose `top`.
const PREFERRED_HEIGHT_PX = 480;

export interface FlyoutPosition { left: number; top: number; maxHeight: number }

/**
 * Where to put the notifications flyout beside its trigger so it is always fully on screen: it lines up
 * with the trigger when it can, moves up when the bottom would not fit, and its height is capped to what
 * is left of the viewport (the list scrolls inside), never the whole window height.
 */
export function flyoutPosition(
  trigger: { top: number; right: number },
  viewport: { width: number; height: number },
): FlyoutPosition {
  const width = Math.min(FLYOUT_WIDTH_PX, viewport.width - 24);
  const left = Math.max(MARGIN_PX, Math.min(trigger.right + MARGIN_PX, viewport.width - width - MARGIN_PX));
  const lowestTop = Math.max(MARGIN_PX, viewport.height - PREFERRED_HEIGHT_PX - MARGIN_PX);
  const top = Math.max(MARGIN_PX, Math.min(trigger.top, lowestTop));
  return { left, top, maxHeight: Math.max(120, viewport.height - top - MARGIN_PX) };
}
