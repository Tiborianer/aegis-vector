"""Build editable destruction scenes and lit turntables of the actual fleet components.

blender -b --factory-startup -P scripts/render-wreck-parts.py -- --metal elite
Use 'fire' to render the shared volumetric plumes, or omit ship IDs for the fleet.
"""
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from breakup_blender import add_burst, cut_section, key
from wreck_profiles import PROFILES

OUT = ROOT / 'work/wreck-parts'
MODELS = ROOT / 'assets/graphics-v2/models'
FLEET = json.loads((ROOT / 'public/graphics-v2/manifest.json').read_text())['ships']
CATALOG = json.loads((ROOT / 'src/game/assets/wreck-ships.json').read_text())
assert set(CATALOG) == set(PROFILES)
ARGS = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
STEPS = 12
Z180 = Quaternion((0, 0, 1), math.pi)
FPS = 30


def obj(name, data=None, parent=None):
    o = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    return o


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    s = bpy.context.scene
    s.world = bpy.data.worlds.new('Fleet sky')
    s.world.color = (.16, .16, .16)
    s.render.engine = 'CYCLES'
    s.cycles.samples = 14
    s.cycles.use_denoising = True
    if '--metal' in ARGS:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        for device in prefs.get_devices_for_type('METAL'):
            device.use = device.type == 'METAL'
        s.cycles.device = 'GPU'
    s.render.film_transparent = True
    s.render.image_settings.color_mode = 'RGBA'
    s.render.image_settings.file_format = 'PNG'
    s.render.resolution_percentage = 100
    s.render.use_persistent_data = True
    s.view_settings.view_transform = 'AgX'
    s.render.fps = FPS
    cam = obj('Fleet orthographic camera', bpy.data.cameras.new('Fleet orthographic'))
    cam.location = (0, -7, 20)
    cam.rotation_euler = (-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type = 'ORTHO'
    s.camera = cam
    for name, pos, watts, size, rgb in [
        ('Key',(-5,2,9),1800,5,(.83,.91,1)),('Fill',(5,-1,5),950,5,(.32,.60,1)),('Rim',(1,5,4),2100,3,(1,.65,.42))]:
        lamp = obj(name, bpy.data.lights.new(name,'AREA'))
        lamp.data.energy, lamp.data.size, lamp.data.color = watts,size,rgb
        lamp.data.shape = 'DISK'
        lamp.location = pos
        lamp.rotation_euler = (-lamp.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.view_layer.update()
    return s, cam


def bands(names, normal, cuts):
    direction = Vector(normal).normalized()
    result = []
    for i, name in enumerate(names):
        planes = []
        if i:
            planes.append((direction*cuts[i-1], -direction))
        if i < len(cuts):
            planes.append((direction*cuts[i], direction))
        result.append((name, planes))
    return result


def assignments(kind, label, c, span, length):
    # Split continuous castings with closed cut faces. Group fittings with the
    # piece they are bolted to, including sights, lenses and exhaust hardware.
    x,y,z = c
    side = 'Starboard' if x > 0 else 'Port'
    lon = 'fore' if y > .20*length else 'aft' if y < -.22*length else 'mid'
    cap = kind in ('gatekeeper','carrierBoss','boss')
    label = label.removeprefix('Inset plating / ')
    def one(name): return [(name, [])]
    spine = lambda: bands(['drive:Aft keel','core:Central chassis','core:Forebody'],(.15,1,.05),[-.26*length,.30*length])
    if label in ('Sensor canopy','Crimson raider canopy','Weaver crimson sensor'):
        return bands(['glass:Canopy aft','glass:Canopy center','glass:Canopy fore'],(.31,1,.02),[y-.09,y+.09])
    engine = label.startswith(('Engine armored','Engine cooling','Ion exhaust','Square exhaust','Aft drive','Engine heat exchanger'))
    if engine:
        bank = (' inner' if abs(x)<1.5 else ' middle' if abs(x)<2.2 else ' outer') if cap else ''
        if kind in ('weaver','prism') and abs(x)<.4: side = 'Axial'
        return one('drive:'+side+bank+' engine')
    if kind == 'seraph':
        mobile = label.startswith(('Eclipse','Wing '))
        if mobile:
            if 'lance' in label or 'gun sponson' in label: return one('weapon:'+side+' lance')
            if any(k in label for k in ('actuator','bearing','torque')): return one('hinge:'+side+' sweep bearing')
            return bands(['skin:'+side+' wing root','skin:'+side+' outer crescent'],
                         (1 if x>0 else -1,.12,.02),[.76*span])
        if 'reactor' in label.lower() or 'containment' in label: return one('reactor:Reactor and vanes')
        if 'bearing' in label: return one('hinge:'+side+' fixed socket')
        if 'citadel' in label.lower() or 'antenna' in label: return one('core:Command citadel')
        return spine()
    if kind == 'nullArchitect':
        if label.startswith(('Crown diagonal','Crown swept','Turret_')):
            return one('tip:'+side+' '+lon+' outrigger')
        if label.startswith(('Crown overlapping','Crown lower tendon','Crown exposed')):
            return one('skin:'+side+' '+lon+' rib bank')
        if 'reactor' in label.lower() or 'containment' in label: return one('reactor:Containment iris')
        if 'sickle' in label or 'fin scarlet' in label: return one('weapon:Dorsal command fin')
        if 'citadel' in label.lower() or 'antenna' in label: return one('core:Command citadel')
        return spine()
    if kind=='skimmer':
        if label.startswith(('Asymmetric','Crescent dorsal','Forward ion','Scythe structural')):
            return bands(['skin:Port scythe','skin:Scythe center','skin:Starboard scythe'],(1,.12,0),[-.35*span,.38*span])
        if 'turbine' in label.lower() or 'Turbine' in label: return one('reactor:Offset turbine')
        if 'lance' in label.lower(): return one('weapon:'+side+' ion lance')
        return one('core:Off-axis command pod')
    if kind=='weaver':
        lobe = 'Aft' if abs(x)<.52 else side
        if label.startswith(('Lobe','Crossfire','Forward emitter')): return one('weapon:'+lobe+' emitter drum')
        if 'bridge' in label: return one('skin:'+lobe+' rail bridge')
        return spine()
    if kind=='prism':
        if label.startswith('Prism lobe'):
            number=label.split()[2]
            if 'beam optic' in label: return one('glass:Optic '+number)
            return one('weapon:Optical lobe '+number)
        if 'nexus' in label: return one('core:Optical nexus')
        return bands(['skin:Port spar','core:Spar junction','skin:Starboard spar'],(1,.14,0),[-.25*span,.25*span])
    if kind=='leech':
        if 'jaw' in label or 'tine' in label or 'induction channel' in label: return one('weapon:'+side+' mandible')
        if 'rear armor' in label: return one('skin:'+side+' rear armor')
        if any(k in label for k in ('iris','well','pressure core','collar')): return one('core:Induction well')
        if 'shell' in label or 'carapace' in label:
            return bands(['skin:Port carapace','core:Carapace spine','skin:Starboard carapace'],(1,.18,.04),[-.28*span,.27*span])
        return one('core:Rear command crest')
    if label.startswith(('Wing ','Harrow crescent','Swept vertical')):
        return bands(['skin:'+side+' wing root','skin:'+side+' wingtip'],(1 if x>0 else -1,.14,.02),[span*.67])
    if label.startswith(('Ordnance','Hatch status')): return one(('payload:' if kind=='artillery' else 'weapon:')+side+' magazine')
    if label in ('Long siege cannon','Stealth dorsal blade'): return one('weapon:'+label)
    if label.startswith(('Exposed reactor','Reactor housing','Reactor iris','Cannon capacitor')): return one('reactor:'+side+' emitter' if 'Cannon' not in label else 'reactor:Capacitor')
    if label == 'Torus': return one('ring:Induction ring')
    if label.startswith(('Reactor well','Red reactor','Reactor armored center')): return one('reactor:Reactor well')
    if label.startswith(('Bridge ','Bridge windows')): return one('core:Command bridge')
    if label.startswith(('Armored turret','Recessed turret','Cannon barrel','Targeting optic')):
        return one('weapon:'+side+(' outer' if abs(x)>2.25 else ' inner')+' battery')
    if label.startswith(('Capital armored','Deck service')): return one('skin:'+side+(' outer' if abs(x)>2.1 else ' inner')+' deck')
    if label.startswith(('Dorsal','Keel','Hull radiator')): return spine()
    raise ValueError((kind,label))


def build(kind):
    scene,cam=setup()
    spec=FLEET[kind];w,h=spec['width'],spec['height']
    duration,beats=PROFILES[kind]
    seed=sum((i+1)*ord(c) for i,c in enumerate(kind))
    rng=random.Random(seed)
    out=OUT/kind;out.mkdir(parents=True,exist_ok=True)
    bpy.ops.import_scene.gltf(filepath=str(MODELS/(kind+'.glb')))
    rig=bpy.data.objects['HERO_'+kind];rig.rotation_mode='XYZ'
    originals=list(rig.children);points=[]
    view=cam.matrix_world.inverted().to_3x3()
    for bank in spec['angles']:
        rig.rotation_euler=(0,math.radians(bank),math.pi);bpy.context.view_layer.update()
        points.extend(view @ (o.matrix_world @ Vector(pt)) for o in originals for pt in o.bound_box)
    span_cam=2.24*max(max(abs(p.x) for p in points),max(abs(p.y) for p in points)*w/h)
    ppu=w/span_cam
    cam.data.ortho_scale=span_cam*2.6
    scene.render.resolution_x,scene.render.resolution_y=w*4,h*4
    rig.rotation_euler=(0,0,0);bpy.context.view_layer.update()
    corners=[o.matrix_world @ Vector(pt) for o in originals for pt in o.bound_box]
    span=max(abs(pt.x) for pt in corners);length=max(abs(pt.y) for pt in corners)
    cut=bpy.data.materials.new('Torn alloy | exposed cross section')
    cut.diffuse_color=(.19,.093,.050,1);cut.use_nodes=True
    bsdf=cut.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(.19,.093,.050,1);bsdf.inputs['Metallic'].default_value=.66
    groups={}
    for o in originals:
        m=o.data.copy();m.transform(o.matrix_world)
        center=sum((v.co for v in m.vertices),Vector())/len(m.vertices)
        for name,planes in assignments(kind,o.name.split('.')[0],center,span,length):
            part=cut_section(m,o.name+' | '+name,planes,cut)
            if part: groups.setdefault(name,[]).append(obj(part.name,part))
        bpy.data.meshes.remove(m);bpy.data.objects.remove(o,do_unlink=True)
    rig.rotation_euler.z=math.pi
    density=1.55 if kind in ('seraph','nullArchitect') else 1.15
    parts=[];nodes=[];centers=[];radii=[]
    for i,(name,meshes) in enumerate(sorted(groups.items())):
        role,label=name.split(':')
        vertices=[v.co for o in meshes for v in o.data.vertices]
        center=Vector([(min(v[j] for v in vertices)+max(v[j] for v in vertices))*.5 for j in range(3)])
        pivot=obj(label,parent=rig);pivot.location=center;pivot.empty_display_size=.13
        for mesh in meshes: mesh.parent=pivot;mesh.location=-center
        projected=[]
        for angle in spec['angles']:
            v=view @ (Z180 @ (Quaternion((0,1,0),math.radians(angle)) @ center))
            projected.append([round(v.x*ppu,2),round(-v.y*ppu,2)])
        radius=max((v-center).length for v in vertices)*ppu
        arm=0
        if kind=='seraph' and role in ('skin','weapon','hinge') and 'fixed' not in label:
            arm=-1 if projected[7][0]<0 else 1
        parts.append(dict(name=label,role=role,anchors=projected,depth=round((view@(Z180@center)).z,3),arm=arm,paths=[]))
        centers.append(center);nodes.append(pivot);radii.append(radius)
    events=[]
    for beat in beats:
        candidates=[i for i,p in enumerate(parts) if p['role']==beat.role]
        if not candidates: raise ValueError((kind,beat.role,'missing ignition site'))
        sites=[]
        for side in (-1,1):
            want=side*(-1 if beat.side=='far' else 1)
            sites.append(max(candidates,key=lambda i: parts[i]['anchors'][7][0]*want if beat.role not in ('core','reactor') or len(candidates)<=2 else -abs(parts[i]['anchors'][7][0])))
        events.append(dict(time=beat.time,label=beat.label,role=beat.role,sites=sites,color=beat.color,size=round(w*beat.size,2),
                           life=round(.28+beat.size*.69+(duration>1.7)*.10,2)))
    for i,p in enumerate(parts):
        x,y=p['anchors'][7];role=p['role'];light=role=='glass'
        for side_idx,side in enumerate((-1,1)):
            same_side=x*side>0
            matching=[e for e in events if e['role']==role]
            if matching:
                chosen=matching[0] if same_side or len(matching)==1 else matching[-1]
            elif role=='glass': chosen=events[0]
            elif role in ('core','ring','reactor'): chosen=events[-1]
            else: chosen=events[min(1,len(events)-1)]
            delay=chosen['time']+rng.uniform(0,.055)+(.13 if duration>1.7 else .055)*(not same_side and abs(x)>w*.12)
            hit_x,hit_y=parts[events[0]['sites'][side_idx]]['anchors'][7]
            dx=x-hit_x*.51+rng.uniform(-w*.10,w*.10);dy=y-hit_y*.55+rng.uniform(-h*.16,h*.16)
            mag=max(1,math.hypot(dx,dy));speed=(w*.44+24)*rng.uniform(.67,1.10)*(1.58 if light else .76 if role in ('core','drive','reactor') else 1)
            spin=rng.choice((-1,1))*rng.uniform(.9,2.5)*(1.85 if light else .68 if role=='core' else 1)
            roll=rng.choice((-1,1))*rng.uniform(1.5,4.0)*(1.6 if light else .78 if role in ('core','drive') else 1)
            p['paths'].append([round(n,3) for n in (delay,dx/mag*speed,dy/mag*speed,spin,roll)])
    # The editable neutral-bank scene carries the same projected velocities, roll
    # and release clock as the runtime. Authoring units are converted only here.
    scene.frame_start=0;scene.frame_end=round(duration*FPS)
    right,up,eye=(cam.matrix_world.to_quaternion()@Vector(v) for v in ((1,0,0),(0,1,0),(0,0,1)))
    for node,center,p in zip(nodes,centers,parts):
        delay,vx,vy,spin,roll=p['paths'][0];dt=duration-delay
        flow=Z180.inverted()@((right*vx-up*vy)/ppu)
        node['release_seconds']=delay
        node['assembly_role']=p['role']
        key(node,'location',center,delay*FPS);key(node,'location',center+flow*dt,duration*FPS)
        node.rotation_mode='QUATERNION'
        for f in range(math.floor(delay*FPS),scene.frame_end+1,2):
            t=max(0,f/FPS-delay)
            q=Z180.inverted()@Quaternion(eye,-spin*t)@Z180@Quaternion((0,1,0),roll*t)
            key(node,'rotation_quaternion',q,f)
        anim=node.animation_data
        for fc in anim.action.layers[0].strips[0].channelbag(anim.action_slot).fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
    for e in events:
        at=e['sites'][0]
        scene.timeline_markers.new(e['label'],frame=round(e['time']*FPS))
        add_burst(rng,e['label'],Vector((0,0,0)),e['time']*FPS,e['life']*FPS,e['size']/ppu/2.5,
                  Vector((.20,-.15,.16)),nodes[at],e['color'])
    scene['structural_pieces']=len(parts);scene['death_sequence_seconds']=duration
    scene.frame_set(0);scene.render.filepath='//frames/'+kind+'-'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
    filename=kind[0].upper()+kind[1:]+'-breakup.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(out/filename),compress=True)
    if '--scene-only' in ARGS:return
    for o in list(scene.objects):
        if o.type=='LIGHT' and o.data.type=='POINT' or ' | lobe ' in o.name:
            bpy.data.objects.remove(o,do_unlink=True)
    # Lay isolated solids on the camera plane. Every tile shares one lighting
    # rig and the exact pixels-per-metre ratio of the intact fleet sprite.
    tile=2*math.ceil(max(radii)*density+4);cols=math.ceil(math.sqrt(len(parts)));rows=math.ceil(len(parts)/cols)
    render_w,render_h=cols*tile,rows*tile
    for ob in scene.objects:
        if ob.type=='LIGHT':
            ob.location*=45;ob.data.size*=45;ob.data.energy*=45**2
    cam.location=eye*140;cam.data.clip_end=500;cam.data.ortho_scale=max(render_w,render_h)/(ppu*density)
    scene.render.resolution_x,scene.render.resolution_y=render_w,render_h
    for i,node in enumerate(nodes):
        node.animation_data_clear();node.parent=None
        px=((i%cols+.5)*tile-render_w*.5)/(ppu*density);py=(render_h*.5-(i//cols+.5)*tile)/(ppu*density)
        node.location=right*px+up*py
    for k in range(STEPS):
        q=Z180@Quaternion((0,1,0),math.tau*k/STEPS)
        for node in nodes:node.rotation_quaternion=q
        scene.render.filepath=str(out/f'roll-{k:02d}.png')
        bpy.ops.render.render(write_still=True)
    data=dict(duration=duration,density=density,parts=parts,events=events,tile=tile,cols=cols,steps=STEPS)
    (out/'pieces.json').write_text(json.dumps(data,separators=(',',':')))
    print('BUILT',kind,len(parts),len(events),flush=True)


def fire():
    for color in ('fire','field','ion'):
        scene,cam=setup()
        cam.data.ortho_scale=4.6;scene.render.resolution_x=scene.render.resolution_y=112
        anchor=obj('Plume source')
        add_burst(random.Random(517),color,Vector((0,0,0)),0,18,1,Vector((.1,0,.18)),anchor,color)
        folder=OUT/'fire';folder.mkdir(parents=True,exist_ok=True)
        for f in range(18):
            scene.frame_set(f);scene.render.filepath=str(folder/f'{color}-{f:02d}.png');bpy.ops.render.render(write_still=True)


for kind in [x for x in ARGS if not x.startswith('--')] or ['fire',*CATALOG]:
    fire() if kind=='fire' else build(kind)
