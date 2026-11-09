# Aegis Vector: dimensional arcade graphics

This document records the original, reversible 21-model graphics pass and its
verification baseline. The additional four-model fleet, final-relay atmosphere
and sparse fortress structural trial are documented in `GRAPHICS_EXPANSION.md`.

## Preservation boundary

This pass changes presentation only. Audio, simulation, mission definitions,
physics footprints, enemy patterns and rewards remain untouched. Save writes are
additionally suppressed in the explicit debug art-review mode; normal campaign
saving is unchanged. Compact HUD spacing separates Audio/Pause and protects the
mission strip. The original art remains intact in Classic mode.
Pre-change source **and uncommitted work** plus all public assets are archived at
`work/graphics-rollback-2026-10-31/pre-graphics-upgrade.tar.gz`.
SHA-256: `ed4191967fdc3f6e5362af97f46b97cc579604a5783954284c115d41278c6b9f`.
Extract into a separate folder to inspect/restore; do not blindly overwrite later work.

## Art direction and asset contract

- Keep Phaser and the arcade silhouette/readability; no Unity migration.
- Silver/blue Kestrel-inspired player, gunmetal hostile family with role-specific
  silhouettes and emissive recognition colors. Real editable GLBs are rendered
  through a fixed orthographic camera at 16 bank angles. They are not AI-generated
  pseudo-turnarounds or 2D shears. Offline Blender never touches an open scene.
- Render at 3x then downsample into the **original logical frame dimensions**.
  This avoids changing any existing physics, weakpoint, or arrival dimensions.
- Every mission receives dedicated top-down scenery. Distant surface, elevated
  haze/clouds and near atmospheric detail scroll at different speeds.
  The planes move at 28, 47 and 79 world pixels per second. Forward-only wrapping
  overlaps tiles by 10% and feathers the join at runtime; scenery is never
  vertically mirrored. The original mirrored-wrap implementation was replaced
  because it inverted authored structures on every other tile. These are
  repeating scenery planes, not individually authored terrain across a mission.
- New art is additive under `public/graphics-v2`; original generated textures stay
  intact. `?visuals=classic` restores them. `?visuals=dimensional` selects new art.
- UI selector persists only a visual preference, independently of the campaign save.

## Rebuild and source assets

All 21 editable GLB models are in `assets/graphics-v2/models/`. The unchanged
generated background masters are in `assets/graphics-v2/environments/`. The
shipping pack contains 21 transparent 4x4 PNG atlases and eight WebP textures,
totalling 7.28 MiB. Source meshes and background masters are not loaded by the game.

From the repository root, with Blender and Python/Pillow installed:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/render-fleet.py
python3 scripts/pack-graphics.py
npm run verify:graphics
npm test
npm run build
```

The fixed orthographic camera is fitted to the union of all bank poses, not
individually zoomed for each frame. Every native sprite dimension matches its
Classic counterpart. Frame 7 is neutral. Bank angles are
`-36,-30,-24,-18,-12,-8,-4,0,4,8,12,18,24,30,36,42` degrees.
These are roll/bank views for the vertical shooter, not 360-degree heading views.
Position-driven enemies derive their visible bank from measured movement without
writing to their velocities, movement origins, attack phase or collision bodies.

## Verification completed locally

- 77 tests pass across 13 files, including full mission/enemy coverage, frame
  dimensions, 16-bank quantization, frame-rate-independent easing, read-only
  banking, explicit preview gating and two complete scenery wraps.
- Production asset validation decodes all 336 transparent frames, checks they are
  distinct, validates hashes/dimensions, verifies all 21 real GLB mesh sources,
  checks every mission surface, and enforces a 20 MB graphics budget. Packaging
  additionally rejects clipped source renders.
- Live browser review covers all seven locations at 1280x720 and 800x450,
  regular and command ships, hit flashes, mine/beam warnings, player banking,
  standard/MK II drones and Overdrive. Screenshots and runtime samples are in
  `outputs/graphics-v2/`; the fleet contact sheet is
  `work/graphics-v2/fleet-contact.png`.
- Compact HUD spacing and Audio/Pause separation were visually checked. The
  menu also fits a 751-pixel-wide preview panel without horizontal cropping.
- Runtime frame-rate samples were 97-121 FPS on this Mac (initial samples near
  97, warmed-up play near 120). This is local evidence, not a guarantee for other
  devices. The near plane is disabled at Low quality and reduces opacity during
  heavy projectile traffic.
- Pause freezes the environment offsets exactly. Classic comparison restores
  original spacecraft and scenery. Menu style changes retain the existing
  Resume Mission entry. Art-review scores do not replace the saved high score.
- A separate local production server deliberately returns 404 for `boss.png`.
  Boot displays the recovery notice, selects the complete Classic set, and
  combat remains playable. No live shipping files are renamed or deleted.
- The final production build was played under the nested `/aegis-vector/`
  path with no browser warnings or errors. Low quality correctly hides the
  near plane; the surface and middle plane continue scrolling. Extraction
  retains the new player art and reaches the existing The Forked Truth scene.
- The backup SHA-256 above was rechecked. Byte comparisons against the extracted
  backup show no changes in `src/audio`, `src/game/simulation`,
  `src/game/content`, or any pre-existing public asset. The BattleScene diff is
  restricted to visual selection, banking, scenery, debug diagnostics and the
  art-review high-score guard. Enemy movement patterns are unchanged.

The build still reports its existing large Phaser bundle warning and the two
pre-existing pending ElevenLabs story-score notices. This graphics pass does not
generate those scores or publish to GitHub.

## Rollback

For normal use, select Classic on the menu; no file restoration is needed.
For a full source rollback, first preserve any newer edits, verify the archive
hash above, then extract it into a **new empty directory** and compare files.
The archive includes the uncommitted story/audio work that existed before this
graphics pass. It is a local backup under ignored `work/`, not a Git commit.

## Tool provenance

The live Blender connector was offline at inspection. The local installed Blender
background renderer is used with a factory-startup scene, never a user scene.
The previously mentioned fighter-bomber could not be located in Documents,
Downloads or Desktop; the player is newly modeled from the established Kestrel
design language instead.
