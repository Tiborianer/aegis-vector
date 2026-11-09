# New fleet and dimensional environment refinements

## Four new mesh families

The original 21 atlases remain byte-for-byte unchanged. Four additional meshes
were authored in the existing clean offline Blender scene and rendered at the
same 16 bank angles and fixed camera-fit contract:

| ID | Native frame | Distinct silhouette |
| --- | --- | --- |
| skimmer | 100 × 76 | Asymmetric cyan crescent, exposed offset turbine, twin ion lances |
| weaver | 108 × 90 | Slender spindle and three separated emitter lobes connected by open rails |
| seraph | 320 × 164 | Golden split-ring guardian, open crescent wings, radial reactor bridges |
| nullArchitect | 260 × 210 | Tall cathedral keel, nested lancet prongs, twin raised violet reactor towers |

Source GLBs are under `assets/graphics-v2/models/`; shipping 4×4 transparent PNG
atlases are under `public/graphics-v2/ships/`. The production graphics manifest
now lists all 25 models and 400 bank frames. The retained expansion manifest is
generation provenance, not an alternate runtime dependency. The validator checks
all frames decode, are distinct and have transparency, as well as every real GLB
source. Packaging rejects clipped source renders.

Selective rebuild (using a Python with Pillow):

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/render-fleet.py -- --only=skimmer,weaver,seraph,nullArchitect
python3 scripts/pack-graphics.py --only=skimmer,weaver,seraph,nullArchitect
node scripts/verify-graphics.mjs public
```

The renderer merges prior bake metadata. The packer updates only selected atlases
and preserves all other manifest entries. Add `--staged` to create a review
manifest without changing the production one. Review contact sheet:
`work/graphics-v2/expansion-contact.png`.

## Fortress structural layer

Fortress Approach now has an opaque, organic carrier exoskeleton above the
scenery and below every ship, projectile and warning. This replaces the earlier
25%-opacity rectilinear grid. Two curved keels and seven tapered, staggered ribs
form large open windows. Dark slate-metal bodies, recessed insets, thin bevels
and small warm root fixtures are drawn as native polygons and baked once into a
Phaser texture. Metal interiors remain at alpha 1; the openings are transparent.
There are no broad filled hull panels or cross-screen bars.

The structure scrolls at 39 pixels/second independently of the 28-pixel/second
surface. A conservative polygon-area calculation, including inflated shadow
bounds, end margins, fixtures, overlapping shapes and partial out-of-tile ribs,
leaves over 75% empty space. A permanent 600-pixel-wide central corridor remains
open at every scroll position. The layer does not become translucent under fire;
readability instead comes from its sparse geometry, subdued material, and depth
below combat elements. The repeating tile is 1400 × 1200 world pixels. Pause
freezes it with the existing environment update. It has no collisions or gameplay
effects. No external bitmap was generated or edited for this structure.

Use `?structuralPlane=off` (or append `&structuralPlane=off` to an existing query)
for direct comparison. It is absent from every other mission and from Classic.
Debug environment snapshots expose `structure.visible`, offset, alpha, speed,
`shape: organic-carrier-ribs`, `clearCorridorWidth`, and the conservative gap
fraction. Browser visual acceptance remains a root-agent playtest step; unit
geometry checks alone do not establish visual quality.

## Scenery orientation and joins

The old `setFlipY(index === 1)` alternation turned level scenery upside-down on
every second tile. Both repeated images now remain forward-facing at all times,
including mission changes and repeated scroll wraps. Runtime-only CanvasTextures
retain the source orientation and feather the leading 10% of each tile over the
opaque tail of the preceding tile. Their ordering is updated at the wrap so the
feathered leading image always composites on top. The authored image files are
unchanged; no full-scene mirroring or new image generation is used to hide joins.

Transparent clouds and relay lights feather both ends, avoiding a hard cutoff
where two translucent layers overlap. Switching mission textures also recomputes
display height from the new source aspect ratio. `SurfacePlane.snapshot()`
reports `orientation: authored-forward`, `flipY: [false, false]`, and the displayed
`blendHeight` for browser checks.

## Accentuated cloud depth

Clouds use brighter blue-white tints and a clearer three-plane separation while
retaining the existing 28 / 47 / 79 pixels-per-second speeds. Regular atmospheric
cloud alpha is 0.40, storm cloud alpha 0.48, and space haze 0.30. Low quality uses
80% of these values. High-quality near vapor is 0.22, balanced/auto is 0.18, and
low quality omits the near plane. At maximum projectile density, far cloud alpha
falls by 10% and near vapor by 70%. All remain below ship, projectile, and warning
depths. This increases visible cloud relief without placing a fog blanket over
the combat silhouettes.

The renderer tests exercise multiple actual SurfacePlane wraps with a mocked
Phaser surface, proving no vertical flip and correct overlap ordering, source
aspect updates, cached texture reuse, and soft cloud tails. Pure tests cover
viewport coverage, conservative rib openings, the clear corridor, density
clamping and cloud visibility. Screenshots and live-motion checks remain required
for aesthetic acceptance; these tests are not a claim of visual approval.

## Final relay atmosphere

`lastLight` deliberately aliases the existing Dreadnought hull image; this is
recorded as `aliasOf: dreadnought` in the manifest and counts once toward the byte
budget. Its distinct runtime lighting starts colder and gradually softens over
three minutes, with a few distant amber maintenance fixtures. This reuses an
existing surface rather than pretending that a new gameplay background was
generated. The added finale story/ending images are managed separately.
