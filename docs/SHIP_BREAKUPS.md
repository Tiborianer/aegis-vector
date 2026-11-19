# Ship destruction

All 24 campaign enemies break into parts from their original fleet models. The fatal hit determines which side opens first. The wreck inherits the ship’s bank, rotation, scale and flight velocity. Debris has no collision body. Kill credit, salvage, drops and mission progress resolve on the original hit.

## Player fighter and crew rescue

The Kestrel breaks into 15 assemblies over 1.23 seconds. The struck wing opens first, the cockpit collar releases, a drive nacelle vents and the central keel splits. The cockpit stays in one piece. Both pilots use the same geometry and retain their fighter’s bank and flight colors.

A solo defeat or squad wipe lets the wreck finish before the results appear. With a wingmate still flying, the cockpit settles at the rescue beacon. Stay within 88 world pixels for 1.5 continuous seconds to recover the pilot. A downed pilot who has already used their field rescue returns at the next waypoint. The rescue position, timer and collision checks belong to the flight simulation. The wreck and cockpit are visual objects.

Open `assets/graphics-v2/destruction/Player-breakup.blend` in the local model library to edit the scene. Rebuild the player art with the moving-assembly commands below, using `player` for the Blender ship ID and `kestrel` for the atlas.

## Small ship animations

| Ship | What releases | Duration |
| --- | --- | ---: |
| Scout | The wing root flashes, the canopy splinters and the far engine comes off last. | 1.00 s |
| Bomber | A loaded pod comes loose and ignites, followed by a vent in the center chassis. | 1.40 s |
| Interceptor | An engine pod shears away with its cooling fins and leaves a short blue exhaust flare. | 1.03 s |
| Sniper | The capacitor arcs and the long cannon slides forward from its breech. | 1.20 s |
| Mine Layer | The forward hatch lifts first. The departing mine cassette ignites a moment later. | 1.33 s |
| Shield Carrier | A side emitter separates, then the induction ring tears free in a violet discharge. | 1.27 s |
| Reclaimer | The struck salvage arm swings away with its claw attached. The opposite drive vents later. | 1.10 s |

These seven ships each use one transparent sprite in play. Three opening bank angles converge on shared later frames. The Bomber and Mine Layer have a timed secondary ignition sound. The Shield Carrier has a separate electrical collapse. These cues follow the animation through a pause. Network co-op sends the same sprite, frame and mirror direction to the second pilot.

## Ships with moving assemblies

Nine fighters and escorts use independently tumbling assemblies. Heavy structural parts drift, small fragments spin faster, and drive, field and magazine failures originate at different points on the hull.

| Ship | Order of failure | Duration |
| --- | --- | ---: |
| Elite | Emitter seam, drive, keel | 1.18 s |
| Charger | Leading edge, drive, spine | 1.03 s |
| Phantom Raider | Drive and cloak, dorsal blade, spinal vent | 1.17 s |
| Skimmer | Crescent, turbine, command pod | 1.24 s |
| Weaver | Emitter drum, lobe bridge, spindle | 1.34 s |
| Prism | Lateral optic, spar, optical nexus | 1.30 s |
| Leech | Mandible pivot, back armor, induction well | 1.34 s |
| Bulwark | Armor, side pod, reactor, main hull | 1.49 s |
| Artillery Skimmer | Battery, capacitor, magazine, chassis | 1.45 s |

## Command ships and bosses

The opening breach travels across each hull over four or five stages. The last stage of a final boss continues through the pilot’s escape. Reduced-motion playback shortens the sequence to at most 1.28 seconds, reduces displacement and dims the flashes.

| Ship | Order of failure after the fatal hit | Duration |
| --- | --- | ---: |
| Razorwing Ace | Wing root, near drive, opposite stabilizer, keel | 1.86 s |
| Crown Pursuer | Pursuit bank, emitter, far drive, center hull | 2.02 s |
| Warden | Near emitter, far emitter, field ring, drives, keel | 2.26 s |
| Gatekeeper Frigate | Battery, deck, opposing engines, bridge and spine | 2.32 s |
| Bastion Carrier | Outer hangar, broadside, far hangar, engines, bridge and keel | 2.62 s |
| Pale Harrow | Near crescent, gun deck, far crescent, containment ring, spine | 2.79 s |
| Eclipse Seraph | Wing bearing, near crescent, far lance and wing, reactor, citadel | 2.44 s |
| Obsidian Crown | Near outrigger, armor ribs, far outriggers, drive spine, reactor | 2.82 s |

Seraph’s fragments begin at its current wing sweep. Each of the Crown’s six guns flies off at its last aimed angle when that turret is disabled during combat. The eventual hull breakup uses the exposed gun mounts. Both pilots see the host’s fragment poses. Pausing freezes the entire sequence.

## Editing and rebuilding

### Original seven sprite animations

Open the ship’s Blender scene in the local model library under `assets/graphics-v2/destruction/`. Frame zero shows the intact ship. Timeline markers locate ruptures and secondary events. Each assembly records its release frame and distance from the initial breach.

The render script imports the original GLBs from `assets/graphics-v2/models/`. Its ship profiles define the fracture sites, directional motion and volume effects. `src/game/assets/ship-breakups.json` sets playback lengths, bank transitions and secondary sound frames. To rebuild one effect, pass its ship ID to both commands.

```sh
blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P scripts/render-ship-breakups.py -- shieldCarrier
python3 scripts/pack-ship-breakups.py shieldCarrier
```

Blender writes the editable scene and bank renders to `work/ship-breakups/<ship ID>/`. Append `--metal` to use a Mac GPU, or `--scene-only` to save the editable scene without rendering. The packer requires Pillow. With no ship IDs it repacks all seven from their renders.

The public PNG and JSON pairs live in `public/graphics-v2/breakups/`. The production build checks their hashes, timing, dimensions and frame bounds. For local visual review, launch a mission in Mission Lab, isolate a craft and fire from either side.

### Moving assemblies and boss stages

The player and the remaining 17 enemies use the same source GLBs. Each editable Blender scene has 11 to 22 structural assemblies and timeline markers for each failure. The game draws twelve lit orientations per assembly. It chooses the initial position from the live bank, applies the authored release for the impact side, and advances the tumbling parts and their sounds on one scene clock.

Edit the ordered stage names, timings and effects in `scripts/wreck_profiles.py`. The source mesh grouping and fracture geometry live in `scripts/render-wreck-parts.py`. Use the original neutral ship art in `public/graphics-v2/ships/` when checking how overlapping pieces fit. The packer also uses those images to order the pieces front to back.

```sh
blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P scripts/render-wreck-parts.py
python3 scripts/pack-wreck-parts.py
```

The first command renders the full fleet and the shared plumes to `work/wreck-parts/`. After a full build, a ship can be rebuilt individually. For example, append `-- seraph` to the Blender command, then pass `finale` to the packer. Use `-- --scene-only seraph` to update just the scene or `-- --metal seraph` for a Metal render on a Mac. Ship-to-atlas assignments are in `src/game/assets/wreck-ships.json`.

Six WebP/JSON pairs ship under `public/graphics-v2/breakups/`. Four enemy atlases and one Kestrel atlas contain the assemblies. The shared effects atlas contains fire, field and ion plumes and a spark. `npm run build` verifies coverage of the complete enemy roster, atlas hashes, frame bounds, bank anchors and stage timing. To review a change, fire from both sides in Mission Lab, then check the transition from Seraph to Crown in Last Light.
