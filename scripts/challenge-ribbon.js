const MODULE_ID = "challenge-ribbon";
const STATE_SETTING = "state";
const LEGACY_FLAG_KEY = "state";
const ROOT_ID = "challenge-ribbon-root";
const HUD_EXIT_MS = 1150;

const DEFAULT_STATE = Object.freeze({
  version: 2,
  hudVisible: false,
  counters: [],
});

let scheduledRender = null;
let draggedCounterId = null;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, STATE_SETTING, {
    name: "Challenge Ribbon: world state",
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULT_STATE,
    onChange: () => renderChallengeRibbon(),
  });

  game.settings.register(MODULE_ID, "ribbonOpen", {
    name: "Challenge Ribbon: ribbon open",
    scope: "client",
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "ribbonCollapsed", {
    name: "Challenge Ribbon: ribbon collapsed",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools) return;

  tokenControls.tools.challengeRibbon = {
    name: "challengeRibbon",
    title: "CR.SceneControl",
    icon: "fa-solid fa-hourglass-half",
    order: Object.keys(tokenControls.tools).length,
    button: true,
    visible: true,
    onChange: () => toggleRibbon(),
  };
});

Hooks.on("canvasReady", () => renderChallengeRibbon());

Hooks.once("ready", async () => {
  await migrateLegacySceneState();
  renderChallengeRibbon();
});

function t(key) {
  return game.i18n.localize(key);
}

function getState() {
  const saved = game.settings.get(MODULE_ID, STATE_SETTING);
  const state = {
    ...foundry.utils.deepClone(DEFAULT_STATE),
    ...(saved ? foundry.utils.deepClone(saved) : {}),
    version: 2,
  };
  state.counters = Array.isArray(state.counters) ? state.counters.map(normalizeCounter) : [];
  return state;
}

async function saveState(state) {
  if (!game.user.isGM) return;
  state.version = 2;
  await game.settings.set(MODULE_ID, STATE_SETTING, state);
}

async function migrateLegacySceneState() {
  if (!game.user.isGM || !canvas?.scene) return;
  const current = getState();
  if (current.counters.length) return;

  const legacy = canvas.scene.getFlag(MODULE_ID, LEGACY_FLAG_KEY);
  if (!legacy?.counters?.length) return;

  await saveState({
    version: 2,
    hudVisible: Boolean(legacy.hudVisible),
    counters: legacy.counters.map(normalizeCounter),
  });
}

function normalizeCounter(counter) {
  const min = numberOr(counter.min, 0);
  const max = Math.max(min + 1, numberOr(counter.max, 4));
  const direction = counter.direction === "down" ? "down" : "up";
  return {
    id: counter.id || foundry.utils.randomID(),
    label: String(counter.label || ""),
    kind: counter.kind === "negative" ? "negative" : "positive",
    direction,
    min,
    start: clamp(numberOr(counter.start, direction === "down" ? max : min), min, max),
    value: clamp(numberOr(counter.value, direction === "down" ? max : min), min, max),
    max,
    showToPlayers: counter.showToPlayers !== false,
    hideWhenComplete: Boolean(counter.hideWhenComplete),
    completedAt: counter.completedAt || null,
  };
}

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = ROOT_ID;
  root.addEventListener("click", onRootClick);
  root.addEventListener("dragstart", onDragStart);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("drop", onDrop);
  root.addEventListener("dragend", clearDragState);
  document.getElementById("interface")?.append(root);
  return root;
}

function renderChallengeRibbon() {
  window.clearTimeout(scheduledRender);
  const root = ensureRoot();
  const state = getState();
  const ribbonOpen = game.user.isGM && game.settings.get(MODULE_ID, "ribbonOpen");
  const collapsed = game.settings.get(MODULE_ID, "ribbonCollapsed");

  root.innerHTML = `
    ${renderHud(state)}
    ${ribbonOpen ? renderRibbon(state, collapsed) : ""}
  `;

  const nextExit = nextCompletionExit(state);
  if (nextExit !== null) {
    scheduledRender = window.setTimeout(renderChallengeRibbon, Math.max(25, nextExit));
  }
}

function renderRibbon(state, collapsed) {
  const hudLabel = state.hudVisible ? t("CR.HideHud") : t("CR.ShowHud");
  return `
    <section class="cr-ribbon ${collapsed ? "is-collapsed" : ""}" aria-label="${escapeHtml(t("CR.Title"))}">
      <div class="cr-ribbon__toolbar">
        <button class="cr-icon-button ${state.hudVisible ? "is-active" : ""}" data-action="toggle-hud" title="${escapeHtml(hudLabel)}" aria-label="${escapeHtml(hudLabel)}">
          <i class="fa-solid ${state.hudVisible ? "fa-eye" : "fa-eye-slash"}"></i>
        </button>
        <button class="cr-icon-button" data-action="add" title="${escapeHtml(t("CR.AddCounter"))}" aria-label="${escapeHtml(t("CR.AddCounter"))}"><i class="fa-solid fa-plus"></i></button>
        <button class="cr-icon-button" data-action="collapse" title="${escapeHtml(collapsed ? t("CR.Expand") : t("CR.Collapse"))}" aria-label="${escapeHtml(collapsed ? t("CR.Expand") : t("CR.Collapse"))}">
          <i class="fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}"></i>
        </button>
      </div>
      <div class="cr-ribbon__body">
        ${state.counters.length ? state.counters.map(renderCounterRow).join("") : `<button class="cr-empty" data-action="add"><i class="fa-solid fa-plus"></i>${escapeHtml(t("CR.Empty"))}</button>`}
      </div>
    </section>
  `;
}

function renderCounterRow(counter) {
  const complete = isComplete(counter);
  const archived = complete && counter.hideWhenComplete;
  const recent = isRecentlyCompleted(counter);
  const kindLabel = counter.kind === "negative" ? t("CR.Threat") : t("CR.Progress");
  const targetLabel = counter.direction === "down" ? `↓ ${counter.min}` : `↑ ${counter.max}`;

  return `
    <article class="cr-counter cr-counter--${counter.kind} ${counter.direction === "down" ? "is-reverse" : ""} ${recent ? "is-completing" : ""} ${archived ? "is-archived" : ""}" data-counter-id="${counter.id}" style="--cr-progress:${counterProgress(counter)}">
      ${renderHourglass(counter, "ribbon")}
      <button class="cr-counter__copy" data-action="edit" title="${escapeHtml(t("CR.EditCounter"))}">
        <b>${escapeHtml(counter.label)}</b>
        <small>${archived ? escapeHtml(t("CR.CompleteHidden")) : `${escapeHtml(kindLabel)} · ${targetLabel}`}</small>
      </button>
      <span class="cr-counter__value">${formatValue(counter)}</span>
      <div class="cr-stepper">
        <button data-action="decrement" aria-label="− ${escapeHtml(counter.label)}">−</button>
        <button data-action="increment" aria-label="+ ${escapeHtml(counter.label)}">+</button>
      </div>
      <button class="cr-drag-handle" draggable="true" data-drag-counter-id="${counter.id}" title="${escapeHtml(t("CR.DragToReorder"))}" aria-label="${escapeHtml(t("CR.DragToReorder"))}"><i class="fa-solid fa-grip-vertical"></i></button>
    </article>
  `;
}

function renderHud(state) {
  if (!state.hudVisible) return "";

  const counters = state.counters.filter(counter => {
    if (!counter.showToPlayers && !game.user.isGM) return false;
    if (!counter.hideWhenComplete || !isComplete(counter)) return true;
    return isRecentlyCompleted(counter);
  });
  if (!counters.length) return "";

  return `
    <section class="cr-hud" aria-label="${escapeHtml(t("CR.Title"))}">
      <div class="cr-hud__counters">${counters.map(renderHudCounter).join("")}</div>
    </section>
  `;
}

function renderHudCounter(counter) {
  const recent = isRecentlyCompleted(counter);
  const exits = recent && counter.hideWhenComplete;
  return `
    <div class="cr-hud-counter cr-counter--${counter.kind} ${counter.direction === "down" ? "is-reverse" : ""} ${recent ? "is-completing" : ""} ${exits ? "will-exit" : ""}" style="--cr-progress:${counterProgress(counter)}">
      ${renderHourglass(counter, "hud")}
      <span class="cr-hud-counter__label">${escapeHtml(counter.label)}</span>
      <span class="cr-hud-counter__value">${formatValue(counter)}</span>
    </div>
  `;
}

function renderHourglass(counter, size) {
  const progress = Number(counterProgress(counter));
  const upperOpacity = Math.max(0.08, 0.72 - progress * 0.64).toFixed(2);
  const id = `${size}-${counter.id}`.replace(/[^a-zA-Z0-9_-]/g, "");
  return `
    <svg class="cr-hourglass cr-hourglass--${size}" viewBox="0 0 36 48" role="img" aria-label="${Math.round(progress * 100)}%">
      <defs>
        <clipPath id="cr-upper-${id}"><path d="M8 8h20c0 7-4.2 11.6-10 16C12.2 19.6 8 15 8 8Z" /></clipPath>
        <clipPath id="cr-lower-${id}"><path d="M18 24c5.8 4.4 10 9 10 16H8c0-7 4.2-11.6 10-16Z" /></clipPath>
      </defs>
      <path class="cr-hourglass__glass" d="M8 8h20c0 7-4.2 11.6-10 16 5.8 4.4 10 9 10 16H8c0-7 4.2-11.6 10-16C12.2 19.6 8 15 8 8Z" />
      <g clip-path="url(#cr-upper-${id})" opacity="${upperOpacity}"><rect class="cr-hourglass__sand" x="8" y="8" width="20" height="8" /></g>
      <g clip-path="url(#cr-lower-${id})"><path class="cr-hourglass__sand cr-hourglass__sand--fill" d="M18 24c5.8 4.4 10 9 10 16H8c0-7 4.2-11.6 10-16Z" style="transform:scaleY(${Math.max(0.03, progress)})" /></g>
      <path class="cr-hourglass__stream" d="M18 20v12" />
      <path class="cr-hourglass__frame" d="M5 5h26M5 43h26M8 8h20c0 7-4.2 11.6-10 16 5.8 4.4 10 9 10 16H8c0-7 4.2-11.6 10-16C12.2 19.6 8 15 8 8Z" />
      <path class="cr-hourglass__posts" d="M7 7v34M29 7v34" />
    </svg>
  `;
}

async function onRootClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target || !game.user.isGM) return;
  const action = target.dataset.action;
  const row = target.closest("[data-counter-id]");
  const state = getState();
  const index = state.counters.findIndex(counter => counter.id === row?.dataset.counterId);
  const counter = index >= 0 ? state.counters[index] : null;

  if (action === "add") {
    target.blur();
    return openCounterDialog(null, -1, target);
  }
  if (action === "edit" && counter) {
    target.blur();
    return openCounterDialog(counter, index, target);
  }
  if (action === "toggle-hud") state.hudVisible = !state.hudVisible;
  if (action === "collapse") {
    await game.settings.set(MODULE_ID, "ribbonCollapsed", !game.settings.get(MODULE_ID, "ribbonCollapsed"));
    renderChallengeRibbon();
    return;
  }
  if (action === "increment" && counter) applyDelta(counter, 1);
  if (action === "decrement" && counter) applyDelta(counter, -1);
  await saveState(state);
}

function applyDelta(counter, delta) {
  const wasComplete = isComplete(counter);
  counter.value = clamp(counter.value + delta, counter.min, counter.max);
  const complete = isComplete(counter);
  if (!wasComplete && complete) counter.completedAt = Date.now();
  if (!complete) counter.completedAt = null;
}

function onDragStart(event) {
  const handle = event.target.closest("[data-drag-counter-id]");
  if (!handle || !game.user.isGM) return;
  draggedCounterId = handle.dataset.dragCounterId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedCounterId);
  handle.closest(".cr-counter")?.classList.add("is-dragging");
}

function onDragOver(event) {
  const row = event.target.closest("[data-counter-id]");
  if (!row || !draggedCounterId || row.dataset.counterId === draggedCounterId) return;
  event.preventDefault();
  clearDropIndicators();
  const before = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
  row.classList.add(before ? "drag-before" : "drag-after");
}

async function onDrop(event) {
  const row = event.target.closest("[data-counter-id]");
  if (!row || !draggedCounterId || row.dataset.counterId === draggedCounterId) return clearDragState();
  event.preventDefault();
  const state = getState();
  const dragged = state.counters.find(counter => counter.id === draggedCounterId);
  if (!dragged) return clearDragState();
  const remaining = state.counters.filter(counter => counter.id !== draggedCounterId);
  const targetIndex = remaining.findIndex(counter => counter.id === row.dataset.counterId);
  const before = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
  remaining.splice(targetIndex + (before ? 0 : 1), 0, dragged);
  state.counters = remaining;
  clearDragState();
  await saveState(state);
}

function clearDropIndicators() {
  document.querySelectorAll("#challenge-ribbon-root .drag-before, #challenge-ribbon-root .drag-after")
    .forEach(element => element.classList.remove("drag-before", "drag-after"));
}

function clearDragState() {
  draggedCounterId = null;
  clearDropIndicators();
  document.querySelectorAll("#challenge-ribbon-root .is-dragging")
    .forEach(element => element.classList.remove("is-dragging"));
}

async function toggleRibbon() {
  const open = game.settings.get(MODULE_ID, "ribbonOpen");
  await game.settings.set(MODULE_ID, "ribbonOpen", !open);
  renderChallengeRibbon();
}

function openCounterDialog(existing = null, existingIndex = -1, opener = null) {
  const counter = normalizeCounter(existing ?? {
    label: "",
    kind: "positive",
    direction: "up",
    min: 0,
    start: 0,
    value: 0,
    max: 4,
    showToPlayers: true,
    hideWhenComplete: false,
  });
  const dialog = createDialog("cr-counter-dialog", opener);
  dialog.innerHTML = `
    <form method="dialog" class="cr-form">
      <header><h2>${escapeHtml(existing ? t("CR.EditCounter") : t("CR.AddCounter"))}</h2><button value="cancel" aria-label="${escapeHtml(t("CR.Close"))}">×</button></header>
      <label class="cr-field cr-field--wide"><span>${escapeHtml(t("CR.CounterName"))}</span><input name="label" maxlength="40" required value="${escapeHtml(counter.label)}" placeholder="${escapeHtml(t("CR.CounterNamePlaceholder"))}" autofocus /></label>
      <label class="cr-field"><span>${escapeHtml(t("CR.Type"))}</span><select name="kind"><option value="positive" ${counter.kind === "positive" ? "selected" : ""}>${escapeHtml(t("CR.Positive"))}</option><option value="negative" ${counter.kind === "negative" ? "selected" : ""}>${escapeHtml(t("CR.Negative"))}</option></select></label>
      <label class="cr-field"><span>${escapeHtml(t("CR.Direction"))}</span><select name="direction"><option value="up" ${counter.direction === "up" ? "selected" : ""}>${escapeHtml(t("CR.CountUp"))}</option><option value="down" ${counter.direction === "down" ? "selected" : ""}>${escapeHtml(t("CR.CountDown"))}</option></select></label>
      <div class="cr-form__numbers">
        <label class="cr-field"><span>${escapeHtml(t("CR.Minimum"))}</span><input name="min" type="number" min="-999" max="998" value="${counter.min}" required /></label>
        <label class="cr-field"><span>${escapeHtml(t("CR.Start"))}</span><input name="start" type="number" min="-999" max="999" value="${counter.start}" required /></label>
        <label class="cr-field"><span>${escapeHtml(t("CR.Current"))}</span><input name="value" type="number" min="-999" max="999" value="${counter.value}" required /></label>
        <label class="cr-field"><span>${escapeHtml(t("CR.Maximum"))}</span><input name="max" type="number" min="-998" max="999" value="${counter.max}" required /></label>
      </div>
      <label class="cr-check"><input name="showToPlayers" type="checkbox" ${counter.showToPlayers ? "checked" : ""} /><span>${escapeHtml(t("CR.ShowToPlayers"))}</span></label>
      <label class="cr-check"><input name="hideWhenComplete" type="checkbox" ${counter.hideWhenComplete ? "checked" : ""} /><span>${escapeHtml(t("CR.HideWhenComplete"))}</span></label>
      <footer>
        ${existing ? `<button type="button" class="cr-danger" data-dialog-action="delete">${escapeHtml(t("CR.Delete"))}</button><button type="button" data-dialog-action="reset">${escapeHtml(t("CR.Reset"))}</button>` : ""}
        <span class="cr-form__spacer"></span>
        <button value="save" class="cr-primary">${escapeHtml(t("CR.Save"))}</button>
      </footer>
    </form>
  `;

  dialog.querySelector("form").addEventListener("submit", async event => {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const min = numberOr(data.get("min"), 0);
    const max = Math.max(min + 1, numberOr(data.get("max"), min + 1));
    const direction = data.get("direction") === "down" ? "down" : "up";
    const value = clamp(numberOr(data.get("value"), direction === "down" ? max : min), min, max);
    const start = clamp(numberOr(data.get("start"), direction === "down" ? max : min), min, max);
    const state = getState();
    const updated = normalizeCounter({
      id: existing?.id ?? foundry.utils.randomID(),
      label: String(data.get("label")).trim(),
      kind: data.get("kind"),
      direction,
      min,
      start,
      value,
      max,
      showToPlayers: data.has("showToPlayers"),
      hideWhenComplete: data.has("hideWhenComplete"),
      completedAt: existing?.completedAt ?? null,
    });
    const wasComplete = existing ? isComplete(normalizeCounter(existing)) : false;
    if (!wasComplete && isComplete(updated)) updated.completedAt = Date.now();
    if (!isComplete(updated)) updated.completedAt = null;
    if (existingIndex >= 0) state.counters[existingIndex] = updated;
    else state.counters.push(updated);
    await saveState(state);
    dialog.close();
  });

  dialog.addEventListener("click", async event => {
    const action = event.target.closest("[data-dialog-action]")?.dataset.dialogAction;
    if (!action || existingIndex < 0) return;
    const state = getState();
    const currentIndex = state.counters.findIndex(item => item.id === existing.id);
    if (currentIndex < 0) return;
    if (action === "delete") state.counters.splice(currentIndex, 1);
    if (action === "reset") {
      state.counters[currentIndex].value = state.counters[currentIndex].start;
      state.counters[currentIndex].completedAt = null;
    }
    await saveState(state);
    dialog.close();
  });
  dialog.showModal();
}

function createDialog(className, opener) {
  document.querySelector(`dialog.${className}`)?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = `cr-dialog ${className}`;
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    window.requestAnimationFrame(() => opener?.blur());
  }, { once: true });
  document.body.append(dialog);
  return dialog;
}

function formatValue(counter) {
  return counter.direction === "down"
    ? `${counter.value}<small>→${counter.min}</small>`
    : `${counter.value}<small>/${counter.max}</small>`;
}

function counterProgress(counter) {
  const range = counter.max - counter.min;
  if (range <= 0) return "0.000";
  const raw = counter.direction === "down"
    ? (counter.max - counter.value) / range
    : (counter.value - counter.min) / range;
  return clamp(raw, 0, 1).toFixed(3);
}

function isComplete(counter) {
  return counter.direction === "down" ? counter.value <= counter.min : counter.value >= counter.max;
}

function isRecentlyCompleted(counter) {
  if (!counter.completedAt || !isComplete(counter)) return false;
  return Date.now() - counter.completedAt < HUD_EXIT_MS;
}

function nextCompletionExit(state) {
  const times = state.counters
    .filter(counter => counter.completedAt && isComplete(counter))
    .map(counter => HUD_EXIT_MS - (Date.now() - counter.completedAt))
    .filter(remaining => remaining > 0);
  return times.length ? Math.min(...times) : null;
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
