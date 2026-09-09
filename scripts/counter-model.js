export const COUNTER_DIRECTION = Object.freeze({
  UP: "up",
  DOWN: "down",
});

const DIRECTION_POLICIES = Object.freeze({
  [COUNTER_DIRECTION.UP]: Object.freeze({
    defaultStart: () => 0,
    progress: counter => counter.value / counter.max,
    complete: counter => counter.value >= counter.max,
    valueSuffix: counter => `/${counter.max}`,
    targetLabel: counter => `↑ ${counter.max}`,
  }),
  [COUNTER_DIRECTION.DOWN]: Object.freeze({
    defaultStart: counter => counter.max,
    progress: counter => (counter.max - counter.value) / counter.max,
    complete: counter => counter.value <= 0,
    valueSuffix: () => "→0",
    targetLabel: () => "↓ 0",
  }),
});

export function parseCounterDirection(value) {
  return value === COUNTER_DIRECTION.DOWN ? COUNTER_DIRECTION.DOWN : COUNTER_DIRECTION.UP;
}

export function getCounterDirectionPolicy(direction) {
  return DIRECTION_POLICIES[parseCounterDirection(direction)];
}

export function createCounterDraft(overrides = {}) {
  const direction = parseCounterDirection(overrides.direction);
  const max = positiveInteger(overrides.max, 4);
  const policy = getCounterDirectionPolicy(direction);
  const defaultStart = policy.defaultStart({ max });
  return normalizeCounter({
    label: "",
    kind: "positive",
    direction,
    start: defaultStart,
    value: defaultStart,
    max,
    showToPlayers: true,
    hideWhenComplete: false,
    ...overrides,
  });
}

export function normalizeCounter(counter) {
  const direction = parseCounterDirection(counter.direction);
  const max = positiveInteger(counter.max, 4);
  const policy = getCounterDirectionPolicy(direction);
  const defaultStart = policy.defaultStart({ max });
  return {
    id: counter.id || null,
    label: String(counter.label || ""),
    kind: counter.kind === "negative" ? "negative" : "positive",
    direction,
    min: 0,
    start: clamp(numberOr(counter.start, defaultStart), 0, max),
    value: clamp(numberOr(counter.value, defaultStart), 0, max),
    max,
    showToPlayers: counter.showToPlayers !== false,
    hideWhenComplete: Boolean(counter.hideWhenComplete),
    completedAt: counter.completedAt || null,
  };
}

export function applyCounterDelta(counter, delta, completedAt = Date.now()) {
  const wasComplete = isCounterComplete(counter);
  counter.value = clamp(counter.value + delta, 0, counter.max);
  const complete = isCounterComplete(counter);
  if (!wasComplete && complete) counter.completedAt = completedAt;
  if (!complete) counter.completedAt = null;
  return counter;
}

export function counterProgress(counter) {
  const policy = getCounterDirectionPolicy(counter.direction);
  return clamp(policy.progress(counter), 0, 1);
}

export function isCounterComplete(counter) {
  return getCounterDirectionPolicy(counter.direction).complete(counter);
}

export function formatCounterValue(counter) {
  const policy = getCounterDirectionPolicy(counter.direction);
  return `${counter.value}<small>${policy.valueSuffix(counter)}</small>`;
}

export function counterTargetLabel(counter) {
  return getCounterDirectionPolicy(counter.direction).targetLabel(counter);
}

export function counterDirectionClass(counter) {
  return counter.direction === COUNTER_DIRECTION.DOWN ? "is-reverse" : "";
}

export function defaultStartFor(direction, limit) {
  const counter = { max: positiveInteger(limit, 1) };
  return getCounterDirectionPolicy(direction).defaultStart(counter);
}

function positiveInteger(value, fallback) {
  const parsed = Math.trunc(numberOr(value, fallback));
  return Math.max(1, parsed);
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
