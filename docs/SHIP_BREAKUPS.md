# Enemy ship destruction

Seven small enemies break into recognizable parts from their original fleet models. A final hit starts the rupture on the side it came from. The wreck inherits the ship’s position, scale, rotation and flight velocity. Debris has no collision body. Damage, score, salvage and drops resolve on the original kill.

| Ship | What releases | Duration |
| --- | --- | ---: |
| Scout | The wing root flashes, the canopy splinters and the far engine comes off last. | 1.00 s |
| Bomber | A loaded pod comes loose and ignites, followed by a vent in the center chassis. | 1.40 s |
| Interceptor | An engine pod shears away with its cooling fins and leaves a short blue exhaust flare. | 1.03 s |
| Sniper | The capacitor arcs and the long cannon slides forward from its breech. | 1.20 s |
| Mine Layer | The forward hatch lifts first. The departing mine cassette ignites a moment later. | 1.33 s |
| Shield Carrier | A side emitter separates, then the induction ring tears free in a violet discharge. | 1.27 s |
| Reclaimer | The struck salvage arm swings away with its claw attached. The opposite drive vents later. | 1.10 s |

Each effect uses one transparent sprite in play. Three opening bank angles converge on shared later frames. The Bomber and Mine Layer have a timed secondary ignition sound. The Shield Carrier has a separate electrical collapse. These cues follow the animation through a pause. Network co-op sends the same sprite, frame and mirror direction to the second pilot.

## Editing and rebuilding

Open the ship’s Blender scene in the local model library under `assets/graphics-v2/destruction/`. Frame zero shows the intact ship. Timeline markers locate ruptures and secondary events. Each assembly records its release frame and distance from the initial breach.

The render script imports the original GLBs from `assets/graphics-v2/models/`. Its ship profiles define the fracture sites, directional motion and volume effects. `src/game/assets/ship-breakups.json` sets playback lengths, bank transitions and secondary sound frames. To rebuild one effect, pass its ship ID to both commands.

```sh
blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P scripts/render-ship-breakups.py -- shieldCarrier
python3 scripts/pack-ship-breakups.py shieldCarrier
```

Blender writes the editable scene and bank renders to `work/ship-breakups/<ship ID>/`. Append `--metal` to use a Mac GPU, or `--scene-only` to save the editable scene without rendering. The packer requires Pillow. With no ship IDs it repacks all seven from their renders.

The public PNG and JSON pairs live in `public/graphics-v2/breakups/`. The production build checks their hashes, timing, dimensions and frame bounds. For local visual review, launch a mission in Mission Lab, isolate a craft and fire from either side.
