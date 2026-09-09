import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCounterDelta,
  counterProgress,
  createCounterDraft,
  defaultStartFor,
  isCounterComplete,
  normalizeCounter,
} from "../scripts/counter-model.js";

test("new reverse counters start at the configured limit", () => {
  const counter = createCounterDraft({ direction: "down", max: 6 });
  assert.equal(counter.start, 6);
  assert.equal(counter.value, 6);
  assert.equal(isCounterComplete(counter), false);
});

test("changing a reverse limit yields the same automatic start", () => {
  assert.equal(defaultStartFor("down", 9), 9);
  assert.equal(defaultStartFor("up", 9), 0);
});

test("reverse progress grows while counting toward zero", () => {
  const counter = createCounterDraft({ direction: "down", max: 6, start: 6, value: 3 });
  assert.equal(counterProgress(counter), 0.5);
  applyCounterDelta(counter, -3, 1234);
  assert.equal(counter.value, 0);
  assert.equal(counter.completedAt, 1234);
  assert.equal(isCounterComplete(counter), true);
});

test("negative values are rejected by normalization", () => {
  const counter = normalizeCounter({ direction: "up", max: 6, start: -4, value: -2 });
  assert.equal(counter.start, 0);
  assert.equal(counter.value, 0);
});
