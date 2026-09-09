import test from "node:test";
import assert from "node:assert/strict";

const MODULE_ID = "challenge-ribbon";

test("legacy migration retries when the Scene becomes ready", async () => {
  const harness = await createHarness({ sceneReady: false });
  await harness.fireOnce("ready");
  assert.equal(harness.get("legacyMigrationComplete"), false);
  assert.equal(harness.get("state").counters.length, 0);

  harness.setScene(harness.legacyScene);
  await harness.fireOn("canvasReady");
  assert.equal(harness.get("legacyMigrationComplete"), true);
  assert.equal(harness.get("state").counters.length, 1);
  assert.equal(harness.get("state").counters[0].label, "Legacy counter");
});

test("completed migration never resurrects deleted counters", async () => {
  const harness = await createHarness({ sceneReady: true });
  await harness.fireOnce("ready");
  assert.equal(harness.get("legacyMigrationComplete"), true);
  assert.equal(harness.get("state").counters.length, 1);

  await harness.set("state", { version: 4, hudVisible: true, counters: [] });
  await harness.fireOn("canvasReady");
  assert.equal(harness.get("state").counters.length, 0);
});

async function createHarness({ sceneReady }) {
  const onCallbacks = new Map();
  const onceCallbacks = new Map();
  const settings = new Map();
  const settingConfigs = new Map();
  const root = {
    innerHTML: "",
    addEventListener() {},
    querySelector() { return null; },
  };
  const legacyScene = {
    id: "legacy-scene",
    getFlag() {
      return {
        version: 1,
        hudVisible: true,
        counters: [{ id: "legacy", label: "Legacy counter", kind: "positive", start: 0, value: 2, max: 4 }],
      };
    },
  };

  globalThis.Hooks = {
    on(name, callback) {
      const callbacks = onCallbacks.get(name) ?? [];
      callbacks.push(callback);
      onCallbacks.set(name, callbacks);
    },
    once(name, callback) {
      const callbacks = onceCallbacks.get(name) ?? [];
      callbacks.push(callback);
      onceCallbacks.set(name, callbacks);
    },
  };
  globalThis.game = {
    user: { isGM: true },
    i18n: { localize: key => key },
    settings: {
      register(namespace, key, config) {
        const id = `${namespace}.${key}`;
        settingConfigs.set(id, config);
        if (!settings.has(id)) settings.set(id, structuredClone(config.default));
      },
      get(namespace, key) {
        return settings.get(`${namespace}.${key}`);
      },
      async set(namespace, key, value) {
        const id = `${namespace}.${key}`;
        settings.set(id, structuredClone(value));
        settingConfigs.get(id)?.onChange?.(value);
        return value;
      },
    },
  };
  globalThis.canvas = { ready: sceneReady, scene: sceneReady ? legacyScene : null };
  globalThis.foundry = { utils: { deepClone: structuredClone, randomID: () => "generated-id" } };
  globalThis.document = {
    body: { append() {} },
    getElementById: id => id === "challenge-ribbon-root" ? root : null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  globalThis.window = {
    addEventListener() {},
    clearTimeout,
    setTimeout,
    requestAnimationFrame: callback => callback(),
  };

  await import(`../scripts/challenge-ribbon.js?test=${Date.now()}-${Math.random()}`);
  await fire(onceCallbacks, "init");

  return {
    legacyScene,
    get(key) { return structuredClone(settings.get(`${MODULE_ID}.${key}`)); },
    set(key, value) { return game.settings.set(MODULE_ID, key, value); },
    setScene(scene) { canvas.scene = scene; canvas.ready = true; },
    fireOnce(name) { return fire(onceCallbacks, name); },
    fireOn(name) { return fire(onCallbacks, name); },
  };
}

async function fire(callbackMap, name, ...args) {
  for (const callback of callbackMap.get(name) ?? []) await callback(...args);
  callbackMap.delete(name);
}
