# Desktop development candidates

Internal QA only. These are not publisher-signed, notarized, Steam-uploaded or Steam-validated releases. Audio provenance and public/commercial distribution rights must be cleared before sharing outside the authorized test team. No Steam account, App ID, Steam SDK, achievements or ownership checks are assumed.

## Build and run

Use Node 22.12 or newer. Electron **45.2.1** and `@electron/packager` **20.3.0** are pinned in the lockfile. The first package downloads the official runtime for the target; it does not install Steam or change global system settings.

```sh
npm ci
npm run desktop:test
npm run desktop:package:windows
npm run desktop:package:mac
```

Windows is x64; the local Mac candidate is Apple Silicon arm64. Artifacts and their inventory are written into a timestamped, target-specific unique folder under `outputs/desktop-candidates/`. Packaging never overwrites an earlier candidate, including simultaneous jobs. `work/desktop-staging/` holds intermediate allowlisted copies. Both locations are already ignored by Git.

For local development, run `npm run build` followed by `npm run desktop:start`. Windows testers launch `AegisVector.exe` from the complete Windows package folder; do not send the executable alone. Keep the complete Mac platform folder too: official Electron/Chromium license notices are alongside the `.app`, not just inside it. F11 and the View menu toggle fullscreen; the Game menu or Ctrl+Q / Command+Q quits.

## Isolation and saves

The game runs from the stable `app://aegis` origin with a sandbox, context isolation and no renderer Node integration or preload/IPC bridge. Remote requests, new windows, page-initiated navigation, downloads and permissions are denied. The packaged asset handler rejects traversal, malformed paths and symlinks escaping `dist`, and streams MP4 byte ranges without loading the full introduction into memory. CSP only allows packaged scripts and local media/images; inline styles remain necessary for the existing HUD.

The user-data directory is `AegisVector` under the operating system's application-data folder, using a persistent `aegis-vector` session. This is deliberately stable across development candidates. Browser saves are separate and are not silently imported. No cloud-save support is claimed.

Only explicitly selected `dist` assets, compiled JavaScript/CSS, the three runtime shell modules, a minimal package manifest and the Phaser/EventEmitter3 licenses are staged. [The desktop asset contract](../scripts/desktop-assets.mjs) lists each current media file; it is not inferred from minified bundles. Packaging fails if any required file is missing, including all eleven recordings selected by `src/audio/radio-files.json` (v2 originals plus the active v3/v4 corrections and v5 Shield Hit). This prevents a silent fallback to retired recordings.

Hidden files (including `.DS_Store`), source maps, source/docs, the project's `node_modules`, environment files, development tests, old `story`/`story-v2` images, unused cinematic audio/keyframes, old `audio/voice` recordings and production-only graphics manifests are not shipped. The source files are retained, and the Vite web build is unchanged. Electron supplies its own runtime/license files. See the [rights register](../docs/steam/ASSET_RIGHTS_REGISTER.md); an allowlisted file is not automatically rights-cleared. App IDs and publisher-signing identity must be confirmed before release.

## Verification and release blockers

`desktop:test` checks isolation policy, traversal, byte ranges and staging allowlists. `scripts/desktop-protocol-smoke.mjs` can be launched with an Electron executable to exercise the real custom protocol and intro ranges without opening a window; `--asset-root` can point to a packaged `app.asar/dist` directory.

Still required: native Windows launch, complete intro viewing, audio controls, keyboard/gamepad review, pause/restore/relaunch saves, fullscreen/window scaling, complete campaign/ending, minimum-spec performance, AV/SmartScreen behavior, signing/notarization decisions, accessibility, content/license review, and Steamworks/store/depot review once the owner has an account. Building a candidate is not evidence these tests passed. Never disable antivirus or operating-system security protections to run an untrusted build.

Implementation references: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [custom protocols](https://www.electronjs.org/docs/latest/api/protocol), and [Electron Packager options](https://electron.github.io/packager/main/interfaces/Options.html).
