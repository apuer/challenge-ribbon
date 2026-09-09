const MODULE_ID = "challenge-ribbon";
const FLAG_KEY = "state";
const ROOT_ID = "challenge-ribbon-root";
const HUD_EXIT_MS = 1150;

const DEFAULT_STATE = Object.freeze({
  version: 1,
  title: "",
  hudVisible: false,
  counters: [],
});

let scheduledRender = null;

Hooks.once("init", () => {
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

Hooks.on("updateScene", scene => {
  if (scene.id === canvas.scene?.id) renderChallengeRibbon();
});

Hooks.on("deleteScene", scene => {
  if (scene.id === canvas.scene?.id) removeRoot();
});

Hooks.once("ready", () => {
  if (canvas?.ready) renderChallengeRibbon();
});

function t(key) {
  return game.i18n.localize(key);
}

function getState() {
  const saved = canvas.scene?.getFlag(MODULE_ID, FLAG_KEY);
  const state = {
    ...foundry.utils.deepClone(DEFAULT_STATE),
    ...(saved ? foundry.utils.deepClone(saved) : {}),
  };
  state.counters = Array.isArray(state.counters) ? state.counters : [];
  return state;
}

async function saveState(state) {
  if (!canvas.scene || !game.user.isGM) return;
  await canvas.scene.setFlag(MODULE_ID, FLAG_KEY, state);
}

function removeRoot() {
  document.getElementById(ROOT_ID)?.remove();
}

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = ROOT_ID;
  root.addEventListener("click", onRootClick);
  document.getElementById("interface")?.append(root);
  return root;
}

function renderChallengeRibbon() {
  window.clearTimeout(scheduledRender);
  if (!canvas?.scene) {
    removeRoot();
    return;
  }

  const state = getState();
  const root = ensureRoot();
  const isGM = game.user.isGM;
  const ribbonOpen = isGM && game.settings.get(MODULE_ID, "ribbonOpen");
  const collapsed = game.settings.get(MODULE_ID, "ribbonCollapsed");
  const title = state.title || t("CR.DefaultChallenge");

  root.innerHTML = `
    ${renderHud(state, title)}
    ${ribbonOpen ? renderRibbon(state, title, collapsed) : ""}
  `;

  const nextExit = nextCompletionExit(state);
  if (nextExit !== null) {
    scheduledRender = window.setTimeout(renderChallengeRibbon, Math.max(25, nextExit));
  }
}

function renderRibbon(state, title, collapsed) {
  const hudLabel = state.hudVisible ? t("CR.HideHud") : t("CR.ShowHud");
  return `
    <section class="cr-ribbon ${collapsed ? "is-collapsed" : ""}" aria-label="${escapeHtml(t("CR.Title"))}">
      <header class="cr-ribbon__header">
        <button class="cr-title" data-action="edit-title" title="${escapeHtml(t("CR.EditChallenge"))}">
          <small>${escapeHtml(t("CR.Title"))}</small>
          <strong>${escapeHtml(title)}</strong>
        </button>
        <div class="cr-header-actions">
          <button class="cr-icon-button ${state.hudVisible ? "is-active" : ""}" data-action="toggle-hud" title="${escapeHtml(hudLabel)}" aria-label="${escapeHtml(hudLabel)}">
            <i class="fa-solid ${state.hudVisible ? "fa-eye" : "fa-eye-slash"}"></i>
          </button>
          <button class="cr-icon-button" data-action="add" title="${escapeHtml(t("CR.AddCounter"))}" aria-label="${escapeHtml(t("CR.AddCounter"))}"><i class="fa-solid fa-plus"></i></button>
          <button class="cr-icon-button" data-action="collapse" title="${escapeHtml(collapsed ? t("CR.Expand") : t("CR.Collapse"))}" aria-label="${escapeHtml(collapsed ? t("CR.Expand") : t("CR.Collapse"))}">
            <i class="fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}"></i>
          </button>
        </div>
      </header>
      <div class="cr-ribbon__body">
        ${state.counters.length ? state.counters.map(counter => renderCounterRow(counter)).join("") : `<button class="cr-empty" data-action="add"><i class="fa-solid fa-plus"></i>${escapeHtml(t("CR.Empty"))}</button>`}
      </div>
    </section>
  `;
}

function renderCounterRow(counter) {
  const complete = counter.value >= counter.max;
  const archived = complete && counter.hideWhenComplete;
  const recent = isRecentlyCompleted(counter);
  const progress = counterProgress(counter);
  const kindLabel = counter.kind === "negative" ? t("CR.Threat") : t("CR.Progress");

  return `
    <article class="cr-counter cr-counter--${counter.kind} ${recent ? "is-completing" : ""} ${archived ? "is-archived" : ""}" data-counter-id="${counter.id}" style="--cr-progress:${progress}">
      ${renderHourglass(counter, "ribbon")}
      <button class="cr-counter__copy" data-action="edit" title="${escapeHtml(t("CR.EditCounter"))}">
        <b>${escapeHtml(counter.label)}</b>
        <small>${archived ? escapeHtml(t("CR.CompleteHidden")) : escapeHtml(kindLabel)}</small>
      </button>
      <span class="cr-counter__value">${counter.value}<small>/${counter.max}</small></span>
      <div class="cr-stepper">
        <button data-action="decrement" aria-label="− ${escapeHtml(counter.label)}">−</button>
        <button data-action="increment" aria-label="+ ${escapeHtml(counter.label)}">+</button>
      </div>
    </article>
  `;
}

function renderHud(state, title) {
  if (!state.hudVisible) return "";

  const counters = state.counters.filter(counter => {
    if (!counter.showToPlayers && !game.user.isGM) return false;
    if (!counter.hideWhenComplete || counter.value < counter.max) return true;
    return isRecentlyCompleted(counter);
  });

  if (!counters.length) return "";

  return `
    <section class="cr-hud" aria-label="${escapeHtml(t("CR.Title"))}">
      <div class="cr-hud__title"><small>${escapeHtml(t("CR.Title"))}</small><strong>${escapeHtml(title)}</strong></div>
      <div class="cr-hud__counters">
        ${counters.map(counter => renderHudCounter(counter)).join("")}
      </div>
    </section>
  `;
}

function renderHudCounter(counter) {
  const recent = isRecentlyCompleted(counter);
  const exits = recent && counter.hideWhenComplete;
  return `
    <div class="cr-hud-counter cr-counter--${counter.kind} ${recent ? "is-completing" : ""} ${exits ? "will-exit" : ""}" style="--cr-progress:${counterProgress(counter)}">
      ${renderHourglass(counter, "hud")}
      <span class="cr-hud-counter__label">${escapeHtml(counter.label)}</span>
      <span class="cr-hud-counter__value">${counter.value}/${counter.max}</span>
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
  if (!target || !game.user.isGM) return;

  const action = target.dataset.action;
  const row = target.closest("[data-counter-id]");
  const id = row?.dataset.counterId;
  const state = getState();
  const index = state.counters.findIndex(counter => counter.id === id);
  const counter = index >= 0 ? state.counters[index] : null;

  if (action === "add") return openCounterDialog();
  if (action === "edit-title") return openTitleDialog(state);
  if (action === "edit" && counter) return openCounterDialog(counter, index);

  if (action === "toggle-hud") state.hudVisible = !state.hudVisible;
  if (action === "collapse") {
    await game.settings.set(MODULE_ID, "ribbonCollapsed", !game.settings.get(MODULE_ID, "ribbonCollapsed"));
    renderChallengeRibbon();
    return;
  }
  if (action === "increment" && counter) {
    const previous = counter.value;
    counter.value = clamp(counter.value + 1, 0, counter.max);
    if (previous < counter.max && counter.value >= counter.max) counter.completedAt = Date.now();
  }
  if (action === "decrement" && counter) {
    counter.value = clamp(counter.value - 1, 0, counter.max);
    if (counter.value < counter.max) counter.completedAt = null;
  }

  await saveState(state);
}

async function toggleRibbon() {
  const open = game.settings.get(MODULE_ID, "ribbonOpen");
  await game.settings.set(MODULE_ID, "ribbonOpen", !open);
  renderChallengeRibbon();
}

function openCounterDialog(existing = null, existingIndex = -1) {
  const counter = existing ?? {
    label: "",
    kind: "positive",
    start: 0,
    value: 0,
    max: 4,
    showToPlayers: true,
    hideWhenComplete: false,
  };

  const dialog = createDialog("cr-counter-dialog");
  dialog.innerHTML = `
    <form method="dialog" class="cr-form">
      <header><h2>${escapeHtml(existing ? t("CR.EditCounter") : t("CR.AddCounter"))}</h2><button value="cancel" aria-label="${escapeHtml(t("CR.Cancel"))}">×</button></header>
      <label class="cr-field cr-field--wide"><span>${escapeHtml(t("CR.CounterName"))}</span><input name="label" maxlength="40" required value="${escapeHtml(counter.label)}" placeholder="${escapeHtml(t("CR.CounterNamePlaceholder"))}" autofocus /></label>
      <label class="cr-field cr-field--wide"><span>${escapeHtml(t("CR.Type"))}</span><select name="kind"><option value="positive" ${counter.kind === "positive" ? "selected" : ""}>${escapeHtml(t("CR.Positive"))}</option><option value="negative" ${counter.kind === "negative" ? "selected" : ""}>${escapeHtml(t("CR.Negative"))}</option></select></label>
      <div class="cr-form__numbers">
        <label class="cr-field"><span>${escapeHtml(t("CR.Start"))}</span><input name="start" type="number" min="0" max="999" value="${counter.start}" required /></label>
        <label class="cr-field"><span>${escapeHtml(t("CR.Current"))}</span><input name="value" type="number" min="0" max="999" value="${counter.value}" required /></label>
        <label class="cr-field"><span>${escapeHtml(t("CR.Maximum"))}</span><input name="max" type="number" min="1" max="999" value="${counter.max}" required /></label>
      </div>
      <label class="cr-check"><input name="showToPlayers" type="checkbox" ${counter.showToPlayers !== false ? "checked" : ""} /><span>${escapeHtml(t("CR.ShowToPlayers"))}</span></label>
      <label class="cr-check"><input name="hideWhenComplete" type="checkbox" ${counter.hideWhenComplete ? "checked" : ""} /><span>${escapeHtml(t("CR.HideWhenComplete"))}</span></label>
      <footer>
        ${existing ? `<button type="button" class="cr-danger" data-dialog-action="delete">${escapeHtml(t("CR.Delete"))}</button><button type="button" data-dialog-action="reset">${escapeHtml(t("CR.Reset"))}</button><button type="button" data-dialog-action="up" ${existingIndex <= 0 ? "disabled" : ""}>↑ ${escapeHtml(t("CR.MoveUp"))}</button><button type="button" data-dialog-action="down">↓ ${escapeHtml(t("CR.MoveDown"))}</button>` : ""}
        <span class="cr-form__spacer"></span>
        <button value="cancel">${escapeHtml(t("CR.Cancel"))}</button>
        <button value="save" class="cr-primary">${escapeHtml(t("CR.Save"))}</button>
      </footer>
    </form>
  `;

  dialog.querySelector("form").addEventListener("submit", async event => {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const max = Math.max(1, Number(data.get("max")) || 1);
    const value = clamp(Number(data.get("value")) || 0, 0, max);
    const start = clamp(Number(data.get("start")) || 0, 0, max);
    const state = getState();
    const updated = {
      id: existing?.id ?? foundry.utils.randomID(),
      label: String(data.get("label")).trim(),
      kind: data.get("kind") === "negative" ? "negative" : "positive",
      start,
      value,
      max,
      showToPlayers: data.has("showToPlayers"),
      hideWhenComplete: data.has("hideWhenComplete"),
      completedAt: value >= max && existing?.value < max ? Date.now() : (value >= max ? existing?.completedAt ?? null : null),
    };
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
    if (action === "up" && currentIndex > 0) {
      [state.counters[currentIndex - 1], state.counters[currentIndex]] = [state.counters[currentIndex], state.counters[currentIndex - 1]];
    }
    if (action === "down" && currentIndex < state.counters.length - 1) {
      [state.counters[currentIndex + 1], state.counters[currentIndex]] = [state.counters[currentIndex], state.counters[currentIndex + 1]];
    }
    await saveState(state);
    dialog.close();
  });

  dialog.showModal();
}

function openTitleDialog(state) {
  const dialog = createDialog("cr-title-dialog");
  dialog.innerHTML = `
    <form method="dialog" class="cr-form cr-form--compact">
      <header><h2>${escapeHtml(t("CR.EditChallenge"))}</h2><button value="cancel" aria-label="${escapeHtml(t("CR.Cancel"))}">×</button></header>
      <label class="cr-field cr-field--wide"><span>${escapeHtml(t("CR.EditChallenge"))}</span><input name="title" maxlength="60" required value="${escapeHtml(state.title || t("CR.DefaultChallenge"))}" autofocus /></label>
      <footer><span class="cr-form__spacer"></span><button value="cancel">${escapeHtml(t("CR.Cancel"))}</button><button value="save" class="cr-primary">${escapeHtml(t("CR.Save"))}</button></footer>
    </form>
  `;
  dialog.querySelector("form").addEventListener("submit", async event => {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    state.title = String(new FormData(event.currentTarget).get("title")).trim();
    await saveState(state);
    dialog.close();
  });
  dialog.showModal();
}

function createDialog(className) {
  document.querySelector(`dialog.${className}`)?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = `cr-dialog ${className}`;
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog);
  return dialog;
}

function counterProgress(counter) {
  return clamp(counter.max > 0 ? counter.value / counter.max : 0, 0, 1).toFixed(3);
}

function isRecentlyCompleted(counter) {
  if (!counter.completedAt || counter.value < counter.max) return false;
  return Date.now() - counter.completedAt < HUD_EXIT_MS;
}

function nextCompletionExit(state) {
  const times = state.counters
    .filter(counter => counter.completedAt && counter.value >= counter.max)
    .map(counter => HUD_EXIT_MS - (Date.now() - counter.completedAt))
    .filter(remaining => remaining > 0);
  return times.length ? Math.min(...times) : null;
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
