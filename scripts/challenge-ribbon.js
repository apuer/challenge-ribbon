import {
  applyCounterDelta,
  counterDirectionClass,
  counterProgress,
  counterTargetLabel,
  createCounterDraft,
  defaultStartFor,
  formatCounterValue,
  isCounterComplete,
  normalizeCounter,
  parseCounterDirection,
} from "./counter-model.js";
import {
  COUNTER_ROW_HEIGHT,
  DEFAULT_VISIBLE_ROWS,
  HUD_BASE_TOP,
  clampRibbonListHeight,
  computeHudTop,
  hasHorizontalOverflow,
} from "./layout-model.js";

const MODULE_ID = "challenge-ribbon";
const STATE_SETTING = "state";
const LEGACY_MIGRATION_SETTING = "legacyMigrationComplete";
const LEGACY_FLAG_KEY = "state";
const ROOT_ID = "challenge-ribbon-root";
const HUD_EXIT_MS = 1150;

const DEFAULT_STATE = Object.freeze({
  version: 4,
  hudVisible: false,
  counters: [],
});

let scheduledRender = null;
let panelDrag = null;
let panelResize = null;
let hudLayoutFrame = null;
let hudResizeObserver = null;
let hudTreeObserver = null;
let combatDockObserver = null;

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

  game.settings.register(MODULE_ID, "ribbonPosition", {
    name: "Challenge Ribbon: ribbon position",
    scope: "client",
    config: false,
    type: Object,
    default: { left: 72, top: 122 },
  });

  game.settings.register(MODULE_ID, "ribbonListHeight", {
    name: "Challenge Ribbon: ribbon list height",
    scope: "client",
    config: false,
    type: Number,
    default: COUNTER_ROW_HEIGHT * DEFAULT_VISIBLE_ROWS,
  });

  game.settings.register(MODULE_ID, LEGACY_MIGRATION_SETTING, {
    name: "Challenge Ribbon: legacy Scene migration completed",
    scope: "world",
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

Hooks.on("canvasReady", async () => {
  await migrateLegacySceneState();
  renderChallengeRibbon();
});

Hooks.once("ready", async () => {
  await migrateLegacySceneState();
  renderChallengeRibbon();
  setupHudLayoutObservers();
  window.addEventListener("resize", renderChallengeRibbon);
});

function t(key) {
  return game.i18n.localize(key);
}

function getState() {
  const saved = game.settings.get(MODULE_ID, STATE_SETTING);
  const state = {
    ...foundry.utils.deepClone(DEFAULT_STATE),
    ...(saved ? foundry.utils.deepClone(saved) : {}),
    version: 4,
  };
  state.counters = Array.isArray(state.counters) ? state.counters.map(normalizeAppCounter) : [];
  return state;
}

async function saveState(state) {
  if (!game.user.isGM) return;
  state.version = 4;
  await game.settings.set(MODULE_ID, STATE_SETTING, state);
}

async function migrateLegacySceneState() {
  if (!game.user.isGM || game.settings.get(MODULE_ID, LEGACY_MIGRATION_SETTING) || !canvas?.scene) return;
  const current = getState();
  const legacy = canvas.scene.getFlag(MODULE_ID, LEGACY_FLAG_KEY);
  if (!current.counters.length && legacy?.counters?.length) {
    await saveState({
      version: 4,
      hudVisible: Boolean(legacy.hudVisible),
      counters: legacy.counters.map(normalizeAppCounter),
    });
  }
  await game.settings.set(MODULE_ID, LEGACY_MIGRATION_SETTING, true);
}

function normalizeAppCounter(counter) {
  const normalized = normalizeCounter(counter);
  normalized.id ||= foundry.utils.randomID();
  return normalized;
}

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = ROOT_ID;
  root.addEventListener("click", onRootClick);
  root.addEventListener("pointerdown", startPanelDrag);
  root.addEventListener("pointerdown", startPanelResize);
  root.addEventListener("scroll", updateHudOverflowControls, true);
  root.addEventListener("wheel", onHudWheel, { passive: false });
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

  const ribbon = root.querySelector(".cr-ribbon");
  if (ribbon) {
    applyPanelListHeight(ribbon);
    applyPanelPosition(ribbon, root);
  }
  refreshHudLayoutTargets();
  scheduleHudLayout();

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
        <div class="cr-panel-drag-handle" data-panel-drag-handle title="${escapeHtml(t("CR.MovePanel"))}">
          <span aria-hidden="true">••••</span>
        </div>
        <button class="cr-icon-button ${state.hudVisible ? "is-active" : ""}" data-action="toggle-hud" title="${escapeHtml(hudLabel)}" aria-label="${escapeHtml(hudLabel)}">
          <i class="fa-solid ${state.hudVisible ? "fa-eye" : "fa-eye-slash"}"></i>
        </button>
        <button class="cr-icon-button" data-action="add" title="${escapeHtml(t("CR.AddCounter"))}" aria-label="${escapeHtml(t("CR.AddCounter"))}"><i class="fa-solid fa-plus"></i></button>
        <button class="cr-icon-button" data-action="collapse" title="${escapeHtml(collapsed ? t("CR.Expand") : t("CR.Collapse"))}" aria-label="${escapeHtml(collapsed ? t("CR.Expand") : t("CR.Collapse"))}">
          <i class="fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}"></i>
        </button>
      </div>
      <div class="cr-ribbon__body">
        ${state.counters.map((counter, index) => renderCounterRow(counter, index, state.counters.length)).join("")}
      </div>
      <div class="cr-panel-resize-handle" data-panel-resize-handle title="${escapeHtml(t("CR.ResizePanel"))}"></div>
    </section>
  `;
}

function renderCounterRow(counter, index, total) {
  const complete = isCounterComplete(counter);
  const archived = complete && counter.hideWhenComplete;
  const recent = isRecentlyCompleted(counter);
  const kindLabel = counter.kind === "negative" ? t("CR.Threat") : t("CR.Progress");
  const targetLabel = counterTargetLabel(counter);

  return `
    <article class="cr-counter cr-counter--${counter.kind} ${counterDirectionClass(counter)} ${recent ? "is-completing" : ""} ${archived ? "is-archived" : ""}" data-counter-id="${counter.id}" style="--cr-progress:${counterProgress(counter).toFixed(3)}">
      ${renderHourglass(counter, "ribbon")}
      <button class="cr-counter__copy" data-action="edit" title="${escapeHtml(t("CR.EditCounter"))}">
        <b>${escapeHtml(counter.label)}</b>
        <small>${archived ? escapeHtml(t("CR.CompleteHidden")) : `${escapeHtml(kindLabel)} · ${targetLabel}`}</small>
      </button>
      <span class="cr-counter__value">${formatCounterValue(counter)}</span>
      <div class="cr-stepper">
        <button data-action="decrement" aria-label="− ${escapeHtml(counter.label)}">−</button>
        <button data-action="increment" aria-label="+ ${escapeHtml(counter.label)}">+</button>
      </div>
      <div class="cr-order-buttons">
        <button data-action="move-up" ${index === 0 ? "disabled" : ""} title="${escapeHtml(t("CR.MoveUp"))}" aria-label="${escapeHtml(t("CR.MoveUp"))}"><i class="fa-solid fa-chevron-up"></i></button>
        <button data-action="move-down" ${index === total - 1 ? "disabled" : ""} title="${escapeHtml(t("CR.MoveDown"))}" aria-label="${escapeHtml(t("CR.MoveDown"))}"><i class="fa-solid fa-chevron-down"></i></button>
      </div>
    </article>
  `;
}

function renderHud(state) {
  if (!state.hudVisible) return "";

  const counters = state.counters.filter(counter => {
    if (!counter.showToPlayers && !game.user.isGM) return false;
    if (!counter.hideWhenComplete || !isCounterComplete(counter)) return true;
    return isRecentlyCompleted(counter);
  });
  if (!counters.length) return "";

  return `
    <section class="cr-hud" aria-label="${escapeHtml(t("CR.Title"))}">
      <button class="cr-hud-scroll cr-hud-scroll--previous" data-action="hud-scroll-previous" aria-label="${escapeHtml(t("CR.ScrollPrevious"))}" hidden><i class="fa-solid fa-chevron-left"></i></button>
      <div class="cr-hud__viewport"><div class="cr-hud__counters">${counters.map(renderHudCounter).join("")}</div></div>
      <button class="cr-hud-scroll cr-hud-scroll--next" data-action="hud-scroll-next" aria-label="${escapeHtml(t("CR.ScrollNext"))}" hidden><i class="fa-solid fa-chevron-right"></i></button>
    </section>
  `;
}

function renderHudCounter(counter) {
  const recent = isRecentlyCompleted(counter);
  const exits = recent && counter.hideWhenComplete;
  return `
    <div class="cr-hud-counter cr-counter--${counter.kind} ${counterDirectionClass(counter)} ${recent ? "is-completing" : ""} ${exits ? "will-exit" : ""}" style="--cr-progress:${counterProgress(counter).toFixed(3)}">
      ${renderHourglass(counter, "hud")}
      <span class="cr-hud-counter__label">${escapeHtml(counter.label)}</span>
      <span class="cr-hud-counter__value">${formatCounterValue(counter)}</span>
    </div>
  `;
}

function renderHourglass(counter, size) {
  const progress = counterProgress(counter);
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
  if (!target) return;
  const action = target.dataset.action;
  if (action === "hud-scroll-previous") return scrollHud(-1);
  if (action === "hud-scroll-next") return scrollHud(1);
  if (!game.user.isGM) return;
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
  if (action === "move-up" && counter && index > 0) {
    [state.counters[index - 1], state.counters[index]] = [state.counters[index], state.counters[index - 1]];
  }
  if (action === "move-down" && counter && index < state.counters.length - 1) {
    [state.counters[index + 1], state.counters[index]] = [state.counters[index], state.counters[index + 1]];
  }
  await saveState(state);
}

function applyDelta(counter, delta) {
  applyCounterDelta(counter, delta);
}

function applyPanelPosition(ribbon, root) {
  const saved = game.settings.get(MODULE_ID, "ribbonPosition") ?? {};
  const position = clampPanelPosition(
    { left: numberOr(saved.left, 72), top: numberOr(saved.top, 122) },
    ribbon,
    root,
  );
  ribbon.style.left = `${position.left}px`;
  ribbon.style.top = `${position.top}px`;
}

function applyPanelListHeight(ribbon) {
  const body = ribbon.querySelector(".cr-ribbon__body");
  if (!body) return;
  const height = clampRibbonListHeight(
    game.settings.get(MODULE_ID, "ribbonListHeight"),
    window.innerHeight,
  );
  body.style.maxHeight = `${height}px`;
}

function startPanelDrag(event) {
  const handle = event.target.closest("[data-panel-drag-handle]");
  if (!handle || !game.user.isGM || event.button !== 0) return;
  const ribbon = handle.closest(".cr-ribbon");
  const root = document.getElementById(ROOT_ID);
  if (!ribbon || !root) return;

  const rootRect = root.getBoundingClientRect();
  const ribbonRect = ribbon.getBoundingClientRect();
  panelDrag = {
    ribbon,
    root,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: ribbonRect.left - rootRect.left,
    startTop: ribbonRect.top - rootRect.top,
  };
  ribbon.classList.add("is-panel-dragging");
  document.addEventListener("pointermove", movePanel);
  document.addEventListener("pointerup", finishPanelDrag, { once: true });
  document.addEventListener("pointercancel", finishPanelDrag, { once: true });
  event.preventDefault();
}

function movePanel(event) {
  if (!panelDrag) return;
  const next = clampPanelPosition({
    left: panelDrag.startLeft + event.clientX - panelDrag.startX,
    top: panelDrag.startTop + event.clientY - panelDrag.startY,
  }, panelDrag.ribbon, panelDrag.root);
  panelDrag.ribbon.style.left = `${next.left}px`;
  panelDrag.ribbon.style.top = `${next.top}px`;
}

async function finishPanelDrag() {
  if (!panelDrag) return;
  document.removeEventListener("pointermove", movePanel);
  document.removeEventListener("pointerup", finishPanelDrag);
  document.removeEventListener("pointercancel", finishPanelDrag);
  const position = {
    left: Math.round(Number.parseFloat(panelDrag.ribbon.style.left)),
    top: Math.round(Number.parseFloat(panelDrag.ribbon.style.top)),
  };
  panelDrag.ribbon.classList.remove("is-panel-dragging");
  panelDrag = null;
  await game.settings.set(MODULE_ID, "ribbonPosition", position);
}

function startPanelResize(event) {
  const handle = event.target.closest("[data-panel-resize-handle]");
  if (!handle || !game.user.isGM || event.button !== 0) return;
  const ribbon = handle.closest(".cr-ribbon");
  const body = ribbon?.querySelector(".cr-ribbon__body");
  const root = document.getElementById(ROOT_ID);
  if (!ribbon || !body || !root) return;
  panelResize = {
    ribbon,
    body,
    root,
    startY: event.clientY,
    startHeight: body.getBoundingClientRect().height,
    height: body.getBoundingClientRect().height,
  };
  ribbon.classList.add("is-panel-resizing");
  document.addEventListener("pointermove", resizePanel);
  document.addEventListener("pointerup", finishPanelResize, { once: true });
  document.addEventListener("pointercancel", finishPanelResize, { once: true });
  event.preventDefault();
}

function resizePanel(event) {
  if (!panelResize) return;
  panelResize.height = clampRibbonListHeight(
    panelResize.startHeight + event.clientY - panelResize.startY,
    window.innerHeight,
  );
  panelResize.body.style.maxHeight = `${panelResize.height}px`;
  const position = clampPanelPosition({
    left: Number.parseFloat(panelResize.ribbon.style.left),
    top: Number.parseFloat(panelResize.ribbon.style.top),
  }, panelResize.ribbon, panelResize.root);
  panelResize.ribbon.style.left = `${position.left}px`;
  panelResize.ribbon.style.top = `${position.top}px`;
}

async function finishPanelResize() {
  if (!panelResize) return;
  document.removeEventListener("pointermove", resizePanel);
  document.removeEventListener("pointerup", finishPanelResize);
  document.removeEventListener("pointercancel", finishPanelResize);
  const height = Math.round(panelResize.height);
  panelResize.ribbon.classList.remove("is-panel-resizing");
  panelResize = null;
  await game.settings.set(MODULE_ID, "ribbonListHeight", height);
}

function clampPanelPosition(position, ribbon, root) {
  const maxLeft = Math.max(0, root.clientWidth - ribbon.offsetWidth);
  const maxTop = Math.max(0, root.clientHeight - ribbon.offsetHeight);
  return {
    left: clamp(position.left, 0, maxLeft),
    top: clamp(position.top, 0, maxTop),
  };
}

function setupHudLayoutObservers() {
  if (typeof MutationObserver === "undefined" || typeof ResizeObserver === "undefined") return;
  hudResizeObserver = new ResizeObserver(scheduleHudLayout);
  hudTreeObserver = new MutationObserver(() => {
    refreshHudLayoutTargets();
    scheduleHudLayout();
  });
  hudTreeObserver.observe(document.body, { childList: true, subtree: true });
  refreshHudLayoutTargets();
}

function refreshHudLayoutTargets() {
  if (!hudResizeObserver) return;
  hudResizeObserver.disconnect();
  combatDockObserver?.disconnect();
  const hud = document.querySelector(`#${ROOT_ID} .cr-hud`);
  const combatDock = document.querySelector("#combat-dock");
  const viewport = hud?.querySelector(".cr-hud__viewport");
  if (hud) hudResizeObserver.observe(hud);
  if (viewport) hudResizeObserver.observe(viewport);
  if (combatDock) {
    hudResizeObserver.observe(combatDock);
    combatDockObserver = new MutationObserver(scheduleHudLayout);
    combatDockObserver.observe(combatDock, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
  }
}

function scheduleHudLayout() {
  window.cancelAnimationFrame?.(hudLayoutFrame);
  hudLayoutFrame = window.requestAnimationFrame(() => {
    positionHudAroundCombatDock();
    updateHudOverflowControls();
  });
}

function positionHudAroundCombatDock() {
  const root = document.getElementById(ROOT_ID);
  const hud = root?.querySelector(".cr-hud");
  if (!root || !hud) return;
  const combatDock = document.querySelector("#combat-dock");
  if (!isVisible(combatDock)) {
    hud.style.top = `${HUD_BASE_TOP}px`;
    return;
  }
  const rootRect = root.getBoundingClientRect();
  const currentHudRect = hud.getBoundingClientRect();
  const baseHudRect = {
    left: currentHudRect.left,
    right: currentHudRect.right,
    top: rootRect.top + HUD_BASE_TOP,
    bottom: rootRect.top + HUD_BASE_TOP + currentHudRect.height,
  };
  const top = computeHudTop({
    hudRect: baseHudRect,
    obstacleRect: combatDock.getBoundingClientRect(),
    rootTop: rootRect.top,
  });
  hud.style.top = `${top}px`;
}

function isVisible(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function updateHudOverflowControls() {
  const hud = document.querySelector(`#${ROOT_ID} .cr-hud`);
  const viewport = hud?.querySelector(".cr-hud__viewport");
  if (!hud || !viewport) return;
  const overflow = hasHorizontalOverflow(viewport);
  const previous = hud.querySelector(".cr-hud-scroll--previous");
  const next = hud.querySelector(".cr-hud-scroll--next");
  previous.hidden = !overflow;
  next.hidden = !overflow;
  previous.disabled = !overflow || viewport.scrollLeft <= 1;
  next.disabled = !overflow || viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
}

function scrollHud(direction) {
  const viewport = document.querySelector(`#${ROOT_ID} .cr-hud__viewport`);
  if (!viewport) return;
  viewport.scrollBy({ left: direction * Math.min(viewport.clientWidth * 0.75, 360), behavior: "smooth" });
}

function onHudWheel(event) {
  const hud = event.target.closest?.(".cr-hud");
  const viewport = hud?.querySelector(".cr-hud__viewport");
  if (!viewport || !hasHorizontalOverflow(viewport)) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  viewport.scrollLeft += delta;
  updateHudOverflowControls();
  event.preventDefault();
}

async function toggleRibbon() {
  const open = game.settings.get(MODULE_ID, "ribbonOpen");
  await game.settings.set(MODULE_ID, "ribbonOpen", !open);
  renderChallengeRibbon();
}

function openCounterDialog(existing = null, existingIndex = -1, opener = null) {
  const counter = existing ? normalizeAppCounter(existing) : createCounterDraft();
  const dialog = createDialog("cr-counter-dialog", opener);
  dialog.innerHTML = `
    <form method="dialog" class="cr-form">
      <header><h2>${escapeHtml(existing ? t("CR.EditCounter") : t("CR.AddCounter"))}</h2><button value="cancel" aria-label="${escapeHtml(t("CR.Close"))}">×</button></header>
      <label class="cr-field cr-field--wide"><span>${escapeHtml(t("CR.CounterName"))}</span><input name="label" maxlength="40" required value="${escapeHtml(counter.label)}" placeholder="${escapeHtml(t("CR.CounterNamePlaceholder"))}" autofocus /></label>
      <label class="cr-field"><span>${escapeHtml(t("CR.Type"))}</span><select name="kind"><option value="positive" ${counter.kind === "positive" ? "selected" : ""}>${escapeHtml(t("CR.Positive"))}</option><option value="negative" ${counter.kind === "negative" ? "selected" : ""}>${escapeHtml(t("CR.Negative"))}</option></select></label>
      <label class="cr-field"><span>${escapeHtml(t("CR.Direction"))}</span><select name="direction"><option value="up" ${counter.direction === "up" ? "selected" : ""}>${escapeHtml(t("CR.CountUp"))}</option><option value="down" ${counter.direction === "down" ? "selected" : ""}>${escapeHtml(t("CR.CountDown"))}</option></select></label>
      <div class="cr-form__numbers">
        <label class="cr-field"><span>${escapeHtml(t("CR.Start"))}</span><input name="start" type="number" min="0" max="999" value="${counter.start}" required /></label>
        <label class="cr-field"><span>${escapeHtml(t("CR.Current"))}</span><input name="value" type="number" min="0" max="999" value="${counter.value}" required /></label>
        <label class="cr-field"><span>${escapeHtml(t("CR.Limit"))}</span><input name="max" type="number" min="1" max="999" value="${counter.max}" required /></label>
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

  const directionInput = dialog.querySelector('[name="direction"]');
  const limitInput = dialog.querySelector('[name="max"]');
  const startInput = dialog.querySelector('[name="start"]');
  const valueInput = dialog.querySelector('[name="value"]');
  const syncDirectionDefaults = () => {
    const direction = parseCounterDirection(directionInput.value);
    const limit = Math.max(1, numberOr(limitInput.value, 1));
    startInput.value = String(defaultStartFor(direction, limit));
    if (!existing) valueInput.value = startInput.value;
  };
  directionInput.addEventListener("change", syncDirectionDefaults);
  limitInput.addEventListener("input", syncDirectionDefaults);

  dialog.querySelector("form").addEventListener("submit", async event => {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const min = 0;
    const max = Math.max(1, numberOr(data.get("max"), 1));
    const direction = parseCounterDirection(data.get("direction"));
    const value = clamp(numberOr(data.get("value"), direction === "down" ? max : min), min, max);
    const start = clamp(numberOr(data.get("start"), direction === "down" ? max : min), min, max);
    const state = getState();
    const updated = normalizeAppCounter({
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
    const wasComplete = existing ? isCounterComplete(normalizeAppCounter(existing)) : false;
    if (!wasComplete && isCounterComplete(updated)) updated.completedAt = Date.now();
    if (!isCounterComplete(updated)) updated.completedAt = null;
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

function isRecentlyCompleted(counter) {
  if (!counter.completedAt || !isCounterComplete(counter)) return false;
  return Date.now() - counter.completedAt < HUD_EXIT_MS;
}

function nextCompletionExit(state) {
  const times = state.counters
    .filter(counter => counter.completedAt && isCounterComplete(counter))
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
