# Changelog

## 0.5.0 — 2026-09-09

- Fixed new reverse counters so Start and Current automatically follow the configured Limit.
- Prevented negative Start and Current values in both the editor and counter model.
- Made legacy Scene migration retry when a Scene becomes ready and record one-time completion, preventing deleted counters from reappearing.
- Centralized direction-dependent counter behavior in a tested `counter-model.js` module.
- Removed the unrequested double-click position reset.

## 0.4.0 — 2026-09-09

- Made the entire GM ribbon movable by dragging the free area in its toolbar.
- Persisted the ribbon position per client and clamped it to the visible interface.
- Kept a wide drag area available while the ribbon is collapsed.
- Added double-click on the drag area to restore the default position.
- Removed the redundant empty-state “Add the first counter” button; the toolbar plus remains available.

## 0.3.0 — 2026-09-09

- Replaced drag-and-drop ordering with reliable up/down buttons beside the counter controls.
- Simplified numeric configuration to Start, Current and Limit; reverse counters always finish at zero.
- Restyled the ribbon, HUD, controls and hourglasses with warm wood, brass and parchment tones.
- Strengthened the red background for negative counters.
- Added a two-beat red completion pulse for negative counters.

## 0.2.0 — 2026-09-09

- Removed challenge titles from both the GM ribbon and public HUD.
- Moved counter state from individual Scenes to a shared world setting.
- Added reverse counters that complete at their configurable minimum.
- Added drag-and-drop reordering directly in the ribbon.
- Changed the Save action to green and removed the redundant Cancel footer button.
- Clicking the dialog backdrop now closes without saving.
- Fixed the lingering mouse-focus highlight after closing the editor.

## 0.1.0 — 2026-09-09

- Initial Foundry VTT 14 release.
- Compact GM ribbon and public HUD.
- Positive and negative hourglass counters.
- Completion flash and optional removal from the HUD.
- Per-Scene state, counter editing, reset, deletion and ordering.
- English and Russian localization.
