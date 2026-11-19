"""Bake enemy destruction using the same GLBs, camera and lights as the fleet art.

blender -b -t 6 --factory-startup -P scripts/render-ship-breakups.py -- scout
Pass the same ship ID to pack-ship-breakups.py to produce its gameplay atlas.
The saved .blend contains the neutral-bank shot with editable mesh fragments,
linear flight curves, volumes and lights. Frame zero is the undamaged reference.
"""
import json
import math
import random
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from breakup_blender import add_burst, cut_section, key

KIND = sys.argv[sys.argv.index('--') + 1]
SCOUT_WING_SEEDS = ((.53, -.45), (.73, .31), (1.14, .32), (1.23, -.44))
POD_WING_SEEDS = ((.72, -.35), (1.23, .2), (1.61, .4), (1.92, .21), (1.63, -.58))
SMALL_CANOPY_SEEDS = ((-.10, .26), (.11, .36), (-.07, .54), (.095, .67), (-.04, .84))
LARGE_CANOPY_SEEDS = ((-.09, .18), (.08, .31), (-.12, .44), (.11, .53), (-.06, .63), (.105, .78), (-.06, .92))


@dataclass(frozen=True)
class Vent:
    label: str
    part: str
    point: tuple
    start: int
    life: int
    radius: float
    drift: tuple
    color: str = 'fire'


@dataclass(frozen=True)
class Fracture:
    field: tuple
    seed: int
    breach: tuple
    label: str
    flash: tuple  # duration, radius
    skin: tuple   # fracture sites in the struck wing
    glass: tuple
    propagation: float
    sparks: int
    vents: tuple
    kick: tuple = ()  # assembly, direction, speed, release frame


PROFILES = {
    'scout': Fracture((216, 192), 379, (.88, .22, .27), 'Wing-root breach', (11, .82),
        SCOUT_WING_SEEDS, SMALL_CANOPY_SEEDS, 2.3, 12,
        (Vent('Aft vent', 'Aft keel', (.13, -.55, .38), 7, 9, .54, (.12, -.49, .23)),)),
    'bomber': Fracture((280, 232), 1573, (1.49, .16, .38), 'Pod mount breach', (13, 1.05),
        POD_WING_SEEDS, LARGE_CANOPY_SEEDS, 2.9, 21,
        (Vent('Detached rack ignition', 'Near ordnance pod', (1.55, -.24, .44), 9, 17, 1.05, (.43, -.28, .55)),
         Vent('Chassis vent', 'Center chassis', (-.17, -.15, .38), 15, 13, .65, (-.46, -.18, .44))),
        ('Near ordnance pod', (.89, -.32, .42), 3.25, 1)),
    'interceptor': Fracture((264, 220), 6001, (1.04, -.62, .19), 'Nacelle seam rupture', (8, .69),
        ((.62, -.68), (1.04, -.46), (1.53, .12), (1.65, -.44)), SMALL_CANOPY_SEEDS, 2.65, 11,
        (Vent('Venting drive', 'Near engine', (1.08, -1.04, .19), 5, 12, .74, (.04, -.92, .21), 'ion'),),
        ('Near engine', (.79, -.79, .32), 3.9, 1)),
    'sniper': Fracture((288, 244), 7103, (.24, -.05, .47), 'Capacitor housing rupture', (9, .68),
        ((.58, -.35), (.91, .25), (1.42, .03), (1.48, -.62)), SMALL_CANOPY_SEEDS, 2.85, 13,
        (Vent('Capacitor arc', 'Cannon capacitor', (.03, -.19, .55), 5, 10, .78, (-.20, -.42, .47), 'arc'),
         Vent('Barrel breech vent', 'Siege barrel', (0, .28, .55), 10, 8, .43, (.1, -.46, .32))),
        ('Siege barrel', (-.12, 1, .24), 3.45, 4)),
    'mineLayer': Fracture((310, 260), 8741, (1.56, .35, .43), 'Forward hatch breach', (10, .77),
        POD_WING_SEEDS, LARGE_CANOPY_SEEDS, 3.0, 17,
        (Vent('Mine cassette cookoff', 'Near ordnance pod', (1.55, -.32, .41), 12, 15, 1.03, (.52, -.51, .47)),
         Vent('Cracked spine vent', 'Aft keel', (.09, -.47, .29), 18, 10, .52, (-.18, -.5, .40))),
        ('Near ordnance pod', (.88, -.34, .24), 2.85, 3)),
    'shieldCarrier': Fracture((314, 256), 9011, (1.30, 0, .45), 'Emitter housing rupture', (10, .76),
        ((.71, -.4), (1.1, .25), (1.54, .12), (1.68, -.57)), SMALL_CANOPY_SEEDS, 3.05, 13,
        (Vent('Induction field collapse', 'Induction ring', (.21, -.19, .55), 10, 15, .98, (-.24, -.06, .61), 'field'),
         Vent('Cooling line vent', 'Near field emitter', (1.30, 0, .40), 16, 9, .39, (.45, -.12, .13))),
        ('Near field emitter', (.99, .2, .4), 3.05, 1)),
    'reclaimer': Fracture((280, 236), 11003, (.94, .52, .22), 'Grapple joint rupture', (9, .71),
        ((.55, -.42), (.83, .26), (1.22, .12), (1.36, -.52)), SMALL_CANOPY_SEEDS, 2.8, 12,
        (Vent('Torn hydraulic line', 'Near grapple', (1.01, .61, .20), 6, 7, .43, (-.39, -.48, .19)),
         Vent('Drive bay vent', 'Far engine', (-.94, -.80, .14), 12, 11, .63, (-.25, -.69, .32))),
        ('Near grapple', (.74, .72, .28), 3.35, 1)),
}
profile = PROFILES[KIND]
catalog = json.loads((ROOT / 'src/game/assets/ship-breakups.json').read_text())
assert set(catalog) == set(PROFILES)
fleet = json.loads((ROOT / 'public/graphics-v2/manifest.json').read_text())['ships'][KIND]
WIDTH, HEIGHT = fleet['width'], fleet['height']
OUT = ROOT / 'work/ship-breakups' / KIND
OUT.mkdir(parents=True, exist_ok=True)
FIELD = profile.field
END, LEVEL = catalog[KIND]['frames'], catalog[KIND]['bankFrames']
FPS = 30
BANKS = fleet['angles']
BREACH = Vector(profile.breach)
rng = random.Random(profile.seed)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.cycles.volume_step_rate = 2
scene.render.use_persistent_data = True
if '--metal' in sys.argv:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    for device in prefs.get_devices_for_type('METAL'):
        device.use = device.type == 'METAL'
    scene.cycles.device = 'GPU'
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.resolution_percentage = 100
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 0, END
scene.world.color = (.16, .16, .16)
scene.view_settings.view_transform = 'AgX'


def scene_object(name, data=None, parent=None):
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.parent = parent
    return obj


def material(name, color, metallic=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = .37
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    return mat


def inertial_flight(obj):
    # Set the actual saved curves. Blender's UI keying preference does not
    # control the interpolation type chosen by the Python insertion API.
    anim = obj.animation_data
    curves = anim.action.layers[0].strips[0].channelbag(anim.action_slot).fcurves
    for curve in curves:
        if curve.data_path in ('location', 'rotation_euler'):
            for point in curve.keyframe_points:
                point.interpolation = 'LINEAR'


camera = scene_object('Fleet orthographic camera', bpy.data.cameras.new('Fleet lens'))
camera.location = (0, -7, 20)
camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
scene.camera = camera
for name, loc, energy, size, color in [
    ('Key', (-5, 2, 9), 1800, 5, (.83, .91, 1)),
    ('Fill', (5, -1, 5), 950, 5, (.32, .60, 1)),
    ('Rim', (1, 5, 4), 2100, 3, (1, .65, .42)),
]:
    light = scene_object(name, bpy.data.lights.new(name, 'AREA'))
    light.data.energy, light.data.size, light.data.color = energy, size, color
    light.data.shape = 'DISK'
    light.location = loc
    light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()

bpy.ops.import_scene.gltf(filepath=str(ROOT / 'assets/graphics-v2/models' / (KIND + '.glb')))
rig = bpy.data.objects['HERO_' + KIND]
rig.rotation_mode = 'XYZ'
originals = list(rig.children)
view = camera.matrix_world.inverted()
points = []
for angle in BANKS:
    rig.rotation_euler = (0, math.radians(angle), math.pi)
    bpy.context.view_layer.update()
    points.extend(view @ obj.matrix_world @ Vector(p) for obj in originals for p in obj.bound_box)
fleet_span = 2.24 * max(max(abs(p.x) for p in points), max(abs(p.y) for p in points) * WIDTH / HEIGHT)
camera.data.ortho_scale = fleet_span * FIELD[0] / WIDTH
scene.render.resolution_x, scene.render.resolution_y = [2 * x for x in FIELD]
rig.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
cut_steel = material('Torn cross section | oxidised alloy', (.16, .071, .039), .67)
cut_glass = material('Fresh edge | sensor laminate', (.32, .16, .19), .65)
groups = defaultdict(list)


def cells(points):
    """Half spaces for a few hand-placed fracture seeds, in ship coordinates."""
    seeds = [Vector((x, y, 0)) for x, y in points]
    return [[((p + q) * .5, (q - p).normalized()) for q in seeds if p != q] for p in seeds]


wing_cells = cells(profile.skin)
glass_cells = cells(profile.glass)
normal = Vector((.29, 1, .10)).normalized()
aft = Vector((0, -.32, .20))
fore = Vector((0, .63, .24))
keel_cells = [[(aft, normal)], [(aft, -normal), (fore, normal)], [(fore, -normal)]]


for obj in originals:
    mesh = obj.data.copy()
    mesh.transform(obj.matrix_world)
    label = obj.name.split('.')[0]
    center = sum((v.co for v in mesh.vertices), Vector()) / len(mesh.vertices)
    near = center.x > 0
    side = 'Near' if near else 'Far'
    if label == 'Sensor canopy':
        spec = [('Glass %d' % (i + 1), planes) for i, planes in enumerate(glass_cells)]
    elif label.startswith(('Keel', 'Dorsal', 'Hull radiator')):
        spec = list(zip(('Aft keel', 'Center chassis', 'Forebody'), keel_cells))
    elif label.startswith(('Engine', 'Ion exhaust', 'Square exhaust')):
        spec = [(side + ' engine', [])]
    elif KIND == 'mineLayer' and near and label in ('Ordnance hatch', 'Hatch status') and center.y > .20:
        spec = [('Forward hatch lid', [])]
    elif label in ('Long siege cannon', 'Cannon capacitor'):
        spec = [('Siege barrel' if label == 'Long siege cannon' else 'Cannon capacitor', [])]
    elif label in ('Reactor housing', 'Exposed reactor', 'Reactor iris'):
        spec = [(side + ' field emitter', [])]
    elif label == 'Torus':
        spec = [('Induction ring', [])]
    elif label in ('Salvage arm', 'Salvage claw'):
        spec = [(side + ' grapple', [])]
    elif label.startswith(('Ordnance', 'Hatch status')):
        spec = [(side + ' ordnance pod', [])]
    elif label.startswith(('Wing', 'Swept vertical')):
        spec = [('Wing tear %d' % (i + 1), planes) for i, planes in enumerate(wing_cells)] if near else [('Far wing', [])]
    else:
        raise ValueError('Unassigned source part ' + label)
    for name, planes in spec:
        part = cut_section(mesh, obj.name + ' | ' + name, planes, cut_glass if name.startswith('Glass') else cut_steel)
        if part:
            groups[name].append(scene_object(part.name, part))
    bpy.data.meshes.remove(mesh)
    bpy.data.objects.remove(obj, do_unlink=True)

# One rigid assembly per group. Mounts, exhausts and cooling fins stay on their engines.
pieces = {}
for name, objects in groups.items():
    coords = [v.co for obj in objects for v in obj.data.vertices]
    center = Vector([(min(p[i] for p in coords) + max(p[i] for p in coords)) / 2 for i in range(3)])
    part = scene_object(name, parent=rig)
    part.empty_display_size = .12
    for obj in objects:
        obj.parent = part
        obj.location = -center
    distance = (center - BREACH).length
    glass = name.startswith('Glass')
    engine = 'engine' in name
    delay = round(distance * profile.propagation + rng.uniform(-.6, .6))
    if name == 'Far engine':
        delay += 2
    delay = max(0, delay)
    direction = center - BREACH * .62
    direction += Vector((rng.uniform(-.26, .26), rng.uniform(-.31, .31), rng.uniform(-.22, .40)))
    if glass:
        direction += Vector((.23, .37, rng.uniform(.3, .9)))
    direction.normalize()
    if glass:
        speed = rng.uniform(3.7, 6.2)
    elif engine or name in ('Far wing', 'Aft keel'):
        speed = rng.uniform(1.7, 2.65)
    else:
        speed = rng.uniform(2.55, 4.4)
    if profile.kick and name == profile.kick[0]:
        direction = Vector(profile.kick[1]).normalized()
        speed, delay = profile.kick[2:]
    if name == 'Forward hatch lid':
        direction = Vector((.48, .65, 1.17)).normalized()
        speed = 5.6
    velocity = direction * speed
    tumble = Vector([rng.uniform(-1, 1) for _ in range(3)]).normalized() * (rng.uniform(5.0, 9.0) if glass else rng.uniform(1.5, 4.1))
    dt = (END - delay) / FPS
    key(part, 'location', center, delay)
    key(part, 'location', center + velocity * dt, END)
    key(part, 'rotation_euler', (0, 0, 0), delay)
    key(part, 'rotation_euler', tumble * dt, END)
    inertial_flight(part)
    part['release_frame'], part['distance_from_breach'] = delay, round(distance, 3)
    pieces[name] = (part, center)


def burst(name, at, start, life, radius, direction, anchor=rig, color='fire'):
    add_burst(rng, name, at, start, life, radius, direction, anchor, color)


burst(profile.label, BREACH, 1, *profile.flash, Vector((.52, .30, .51)))
for vent in profile.vents:
    part, center = pieces[vent.part]
    burst(vent.label, Vector(vent.point) - center, vent.start, vent.life, vent.radius,
          Vector(vent.drift), part, vent.color)

spark_mats = [material('Incandescent metal', (1, .22, .032), emission=7),
              material('White-hot tip', (1, .65, .25), emission=12)]
for i in range(profile.sparks):
    second = i % 3 == 0
    delay = rng.randint(1, 4) + ((5 if KIND == 'scout' else profile.vents[0].start) if second else 0)
    life = rng.randint(4, 10)
    source = BREACH.copy()
    if second:
        parent_name = profile.vents[0].part
        part, _ = pieces[parent_name]
        scene.frame_set(delay)
        source = part.location.copy()
    v = Vector((rng.uniform(.45, 1.4), rng.uniform(-1.1, .65), rng.uniform(-.20, .85)))
    if second:
        v.x *= -.45 if KIND == 'scout' else .75
    v.normalize()
    speed = rng.uniform(5.0, 11)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1)
    spark = bpy.context.object
    spark.name = 'Cooling spall %02d' % (i + 1)
    spark.parent = rig
    spark.data.materials.append(spark_mats[i % 2])
    spark.rotation_euler = v.to_track_quat('Z', 'Y').to_euler()
    width = rng.uniform(.012, .027)
    shape = Vector((width, width, speed * .015))
    key(spark, 'location', source, delay)
    key(spark, 'location', source + v * speed * life / FPS, delay + life)
    key(spark, 'scale', (.0001,) * 3, delay - 1)
    key(spark, 'scale', shape, delay)
    key(spark, 'scale', shape * .70, delay + life * .70)
    key(spark, 'scale', (.0001,) * 3, delay + life)
    inertial_flight(spark)

for f, label in [(1, profile.label), *((v.start, v.label) for v in profile.vents)]:
    scene.timeline_markers.new(label, frame=f)
scene['structural_pieces'] = len(pieces)
scene['shared_tail_frame'] = LEVEL
display_name = KIND[0].upper() + KIND[1:]
rig.name = display_name + ' | flight attitude'
rig.rotation_euler = (0, 0, math.pi)
scene.frame_set(0)
scene.render.filepath = '//frames/' + KIND + '-'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / (display_name + '-breakup.blend')), compress=True)
for bank in (() if '--scene-only' in sys.argv else (0, -30, 30)):
    key(rig, 'rotation_euler', (0, math.radians(bank), math.pi), 0)
    key(rig, 'rotation_euler', (0, 0, math.pi), LEVEL)
    for frame in range(END if bank == 0 else LEVEL):
        scene.frame_set(frame)
        scene.render.filepath = str(OUT / ('%+d_%02d.png' % (bank, frame)))
        bpy.ops.render.render(write_still=True)
print('BAKED', KIND, len(pieces), 'assemblies:', sorted((p['release_frame'], name) for name, (p, _) in pieces.items()), flush=True)
