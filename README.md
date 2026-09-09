# Challenge Ribbon 0.3.0

A compact, system-agnostic Foundry VTT 14 module for skill-challenge counters.

## Features

- GM-only ribbon with multiple positive and negative counters.
- Public, read-only HUD for players.
- Prominent animated hourglass for every counter.
- Increasing green or red intensity as a counter approaches its maximum.
- Completion flash.
- Optional **hide from HUD when complete** animation per counter.
- Start, current and limit values.
- Forward counters that complete at the limit and reverse counters that complete at zero.
- Per-counter player visibility (UI-only; not secure storage).
- Reset, delete and direct up/down reordering controls.
- Russian and English localization.
- Reduced-motion support.

## Install from The Forge

After a GitHub release is published, open **Bazaar → Custom Modules → Install via Manifest URL** and paste:

```text
https://github.com/apuer/challenge-ribbon/releases/latest/download/module.json
```

If Forge offers a Bazaar copy, disable **Install from the Bazaar if the package is found** so the custom manifest is used.

The URL remains stable across releases. New tags such as `v0.2.0` automatically publish an updated manifest and module archive through GitHub Actions.

## Install manually

1. Copy the `challenge-ribbon` directory into Foundry's `Data/modules/` directory.
2. Restart Foundry VTT.
3. Enable **Challenge Ribbon** in the world's module settings.
4. Open a Scene and use the hourglass button in Token Controls.

The module stores one shared set of counters for the whole World, so counters remain active while changing Scenes. Version 0.2.0 migrates counters from the active Scene when upgrading from 0.1.0.

## Notes

- Foundry VTT 14 is the first supported version.
- Only GMs can change counters.
- Player visibility is intentionally presentational rather than secure: counter state is stored on the Scene.
- This is a first functional version. Visual tuning and additional skins are expected later.

## Publishing a release

The repository validates itself on each push. To publish a version, update the version in `module.json` and `package.json`, commit it, then push a matching tag:

```sh
git tag v0.3.0
git push origin main --tags
```

The release workflow builds a Foundry-compatible archive with `module.json` at its root and attaches both required files to the GitHub Release.
