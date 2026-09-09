import test from "node:test";
import assert from "node:assert/strict";

import {
  clampRibbonListHeight,
  computeHudTop,
  hasHorizontalOverflow,
} from "../scripts/layout-model.js";

test("HUD remains at its base position without a collision", () => {
  const top = computeHudTop({
    hudRect: { left: 400, right: 700, top: 16, bottom: 64 },
    obstacleRect: { left: 0, right: 300, top: 0, bottom: 205 },
  });
  assert.equal(top, 16);
});

test("HUD moves eight pixels below an intersecting Combat Dock", () => {
  const top = computeHudTop({
    hudRect: { left: 400, right: 700, top: 16, bottom: 64 },
    obstacleRect: { left: 120, right: 1000, top: 0, bottom: 205 },
  });
  assert.equal(top, 213);
});

test("ribbon list height stays between two rows and eighty viewport percent", () => {
  assert.equal(clampRibbonListHeight(20, 1000), 122);
  assert.equal(clampRibbonListHeight(9999, 1000), 800);
  assert.equal(clampRibbonListHeight(undefined, 1000), 366);
});

test("horizontal overflow ignores sub-pixel rounding noise", () => {
  assert.equal(hasHorizontalOverflow({ scrollWidth: 761, clientWidth: 760 }), false);
  assert.equal(hasHorizontalOverflow({ scrollWidth: 762, clientWidth: 760 }), true);
});
