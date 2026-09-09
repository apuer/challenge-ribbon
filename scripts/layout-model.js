export const HUD_BASE_TOP = 16;
export const HUD_COLLISION_GAP = 8;
export const COUNTER_ROW_HEIGHT = 61;
export const DEFAULT_VISIBLE_ROWS = 6;
export const MIN_VISIBLE_ROWS = 2;

export function rectanglesIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function computeHudTop({ hudRect, obstacleRect, rootTop = 0, baseTop = HUD_BASE_TOP, gap = HUD_COLLISION_GAP }) {
  if (!obstacleRect || !rectanglesIntersect(hudRect, obstacleRect)) return baseTop;
  return Math.max(baseTop, obstacleRect.bottom - rootTop + gap);
}

export function clampRibbonListHeight(height, viewportHeight) {
  const min = COUNTER_ROW_HEIGHT * MIN_VISIBLE_ROWS;
  const max = Math.max(min, viewportHeight * 0.8);
  return clamp(numberOr(height, COUNTER_ROW_HEIGHT * DEFAULT_VISIBLE_ROWS), min, max);
}

export function hasHorizontalOverflow({ scrollWidth, clientWidth }) {
  return scrollWidth > clientWidth + 1;
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
