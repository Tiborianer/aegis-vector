"""Offline, reproducible Blender asset bake. Never opens or modifies a user's .blend.

Blender --background --factory-startup --python scripts/render-fleet.py -- --pilot
Blender --background --factory-startup --python scripts/render-fleet.py
Blender --background --factory-startup --python scripts/render-fleet.py -- --only=skimmer,weaver,seraph,nullArchitect
Blender --background --factory-startup --python scripts/render-fleet.py -- --only=prism,leech
The editable mesh source is exported per ship; runtime uses 16 genuinely rendered
bank angles (not stretched drawings). +Y is nose, Z is up, metres, fixed camera.
"""
import bpy
import math
import json
import sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'work/graphics-v2/fleet'
SOURCE = ROOT / 'assets/graphics-v2/models'
ANGLES = [-36, -30, -24, -18, -12, -8, -4, 0, 4, 8, 12, 18, 24, 30, 36, 42]
# The canvas sizes are the original game sizes: no collision or gameplay changes.
SPECS = {
    'player': (88,104,'kestrel','cyan'),
    'scout': (64,60,'wisp','red'),
    'interceptor': (76,68,'talon','orange'),
    'bomber': (104,78,'hammer','red'),
    'elite': (112,86,'crown','violet'),
    'charger': (78,76,'lance','red'),
    'sniper': (88,70,'needle','pink'),
    'mineLayer': (112,74,'hauler','orange'),
    'shieldCarrier': (104,84,'halo','violet'),
    'bulwark': (140,96,'bastion','orange'),
    'phantom': (82,68,'spectre','cyan'),
    'artillery': (126,82,'battery','orange'),
    'reclaimer': (86,76,'claw','green'),
    'razorwing': (112,82,'razor','red'),
    'gatekeeper': (184,104,'frigate','orange'),
    'pursuer': (158,96,'crown','violet'),
    'carrierBoss': (244,116,'carrier','orange'),
    'warden': (190,104,'halo','pink'),
    'boss': (300,120,'harrow','red'),
    'drone': (48,48,'drone','green'),
    'droneMk2': (48,48,'drone2','green'),
    'skimmer': (100,76,'crescentRaider','cyan'),
    'weaver': (108,90,'triptych','pink'),
    'seraph': (320,164,'approvedEclipse','gold'),
    'nullArchitect': (260,210,'approvedCrown','red'),
    'prism': (96,84,'prismTriad','cyan'),
    'leech': (98,88,'leechMandible','red'),
}
COLORS = {'cyan':(.015,.58,1), 'red':(1,.045,.055), 'orange':(1,.36,.025),
          'violet':(.46,.12,1), 'pink':(1,.1,.5), 'green':(.08,1,.36), 'gold':(1,.57,.08)}

def material(name, color, metal=.65, rough=.32, emit=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color,1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color,1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Emission Color'].default_value = (*color,1)
    p.inputs['Emission Strength'].default_value = emit
    return m

def finish(obj, mat, bevel=.04):
    obj.data.materials.append(mat)
    obj.parent = rig
    if bevel:
        b = obj.modifiers.new('Machined edge highlights','BEVEL'); b.width=bevel; b.segments=2
        obj.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
    return obj

def box(name, pos, scale, mat, bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o=bpy.context.object; o.name=name; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,mat,bevel)

def plate(name, points, z, thick, mat, bevel=.035):
    n=len(points)
    verts=[(x,y,z) for x,y in points]+[(x,y,z+thick) for x,y in points]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    return finish(o,mat,bevel)

def ellipsoid(name,pos,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=pos)
    o=bpy.context.object;o.name=name;o.scale=scale
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,mat,0)

def cylinder(name,pos,radius,depth,mat,rotation=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius,depth=depth,location=pos,rotation=rotation)
    o=bpy.context.object;o.name=name
    return finish(o,mat,.025)

def beam(name,a,b,radius,mat):
    mid=(Vector(a)+Vector(b))*.5
    o=cylinder(name,mid,radius,(Vector(b)-Vector(a)).length,mat)
    o.rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler()
    return o

def arc_ribbon(name,rx,ry,width,start,end,z,thick,mat,center=(0,0),steps=28):
    """True open elliptical shell: gaps remain transparent in every bank view."""
    angles=[math.radians(start+(end-start)*i/steps) for i in range(steps+1)]
    verts=[]
    for height in (z,z+thick):
        for inset in (0,width):
            verts.extend((center[0]+(rx-inset)*math.cos(a),center[1]+(ry-inset)*math.sin(a),height) for a in angles)
    n=steps+1;faces=[]
    for i in range(steps):
        faces.extend([(i,i+1,n+i+1,n+i),(2*n+i,3*n+i,3*n+i+1,2*n+i+1),
                      (i,2*n+i,2*n+i+1,i+1),(n+i,n+i+1,3*n+i+1,3*n+i)])
    faces.extend([(0,n,3*n,2*n),(n-1,3*n-1,4*n-1,2*n-1)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    return finish(o,mat,.025)

def engine(x,y,z,scale=1):
    box('Engine armored nacelle',(x,y,z),(.46*scale,.94*scale,.43*scale),dark)
    box('Square exhaust socket',(x,y-.47*scale,z),(.36*scale,.07,.3*scale),steel,.025)
    box('Ion exhaust',(x,y-.51*scale,z),(.27*scale,.04,.2*scale),glow,.015)
    for j in range(3):
        box('Engine cooling fin',(x,y+(.25-j*.16)*scale,z+.235*scale),(.33*scale,.06,.045),steel,.012)

def turret(x,y,z,r=.22):
    cylinder('Recessed turret ring',(x,y,z),r*1.4,.12,dark)
    cylinder('Armored turret',(x,y,z+.13),r,.22,steel)
    beam('Cannon barrel',(x,y,z+.22),(x,y+.65,z+.22),.055,dark)
    cylinder('Targeting optic',(x,y+.13,z+.27),.055,.05,glow)

def ribbed_hull(length=3,width=.7):
    pts=[(0,length*.56),(-width*.55,length*.26),(-width*.64,-length*.25),(-width*.4,-length*.47),
         (width*.4,-length*.47),(width*.64,-length*.25),(width*.55,length*.26)]
    plate('Keel armored lower hull',pts,-.17,.25,dark)
    plate('Dorsal shell',[(x*.88,y*.94) for x,y in pts],.05,.31,armor)
    plate('Dorsal center ridge',[(0,length*.47),(-width*.17,0),(-width*.19,-length*.38),(width*.19,-length*.38),(width*.17,0)],.36,.10,steel)
    for s in (-1,1):
        for j in range(5):
            box('Hull radiator louvre',(s*width*.43,-length*.3+j*.22,.39),(.16,.07,.035),dark,.009)

def wing(side,span,sweep,style='blade'):
    if style=='manta':
        points=[(.22,1.4),(.8,.72),(span,-.35),(span*.95,-.85),(1.15,-.6),(.55,-1.2),(.25,-.75)]
    elif style=='slab':
        points=[(.25,.6),(span*.87,.64),(span,.28),(span,-.88),(.9,-1.18),(.3,-.8)]
    else:
        points=[(.3,.7),(span,1.35+sweep),(span*.84,-.4),(.65,-1.18),(.25,-.85)]
    pts=[(x*side,y) for x,y in points]
    plate('Wing pressure shell',pts,-.08,.18,armor)
    inset=[(side*(.35+(x-.3)*.85),y*.86) for x,y in points]
    plate('Wing inset armor',inset,.12,.075,steel)
    beam('Wing energy channel',(side*.68,-.62,.23),(side*(span*.78),-.22,.23),.035,glow)
    beam('Wing leading reinforcement',(side*.58,.75,.17),(side*span,1.35+sweep if style=='blade' else -.35,.05),.04,dark)

def build(kind,family):
    friendly=kind in ('player','drone','droneMk2')
    if family=='approvedCrown':
        load_approved_crown()
        return
    if family=='approvedEclipse':
        load_approved_eclipse()
        return
    if family=='prismTriad':
        # Three angular optical housings share a load-bearing triangular spar.
        # Unlike Weaver's drums and wire frame, Prism is all faceted wedges.
        violet=material('prism_violet_optics',(.32,.045,.95),.55,.23,2.3)
        plate('Prism triangular spar',[(-1.74,-.89),(0,1.06),(1.74,-.89),(1.24,-1.24),(-1.24,-1.24)],-.22,.22,dark)
        lobes=[(0,.4,.52,1.47),(-1.37,-.26,.65,1.12),(1.37,-.26,.65,1.12)]
        for index,(x,y,width,length) in enumerate(lobes,1):
            points=[(x,y+length),(x-width,y+.05),(x-width*.78,y-length*.68),
                    (x,y-length*.88),(x+width*.78,y-length*.68),(x+width,y+.05)]
            plate(f'Prism lobe {index} pressure hull',points,-.14,.25,armor)
            inset=[(x+(px-x)*.88,y+(py-y)*.91) for px,py in points]
            # A low ridge produces genuine triangular reflections during banking.
            vertices=[(px,py,.12) for px,py in inset]+[(x,y+.08,.54)]
            mesh=bpy.data.meshes.new(f'Prism lobe {index} faceted roof')
            mesh.from_pydata(vertices,[],[(j,(j+1)%6,6) for j in range(6)]+[tuple(range(5,-1,-1))]);mesh.update()
            obj=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(obj);finish(obj,steel,.018)
            plate(f'Prism lobe {index} beam optic',[(x-.11,y+.6),(x,y+.89),(x+.11,y+.6),(x,y+.39)],.34,.075,glow,.012)
            for side in (-1,1):
                beam(f'Prism lobe {index} violet conduit',(x+side*.19,y-.66,.29),(x+side*.22,y-.12,.4),.025,violet)
                beam(f'Prism lobe {index} forward lens guard',(x+side*.16,y+.35,.24),(x+side*.12,y+.92,.22),.035,dark)
            engine(x,y-length*.67,-.10,.51)
        plate('Prism central optical nexus',[(-.25,-.46),(0,-.14),(.25,-.46),(0,-.76)],.27,.13,violet,.02)
        for side in (-1,1):
            beam('Prism paired beam coupling',(side*.3,-.40,.16),(side*.96,-.32,.16),.06,steel)
            beam('Prism paired optical fiber',(side*.39,-.37,.24),(side*.94,-.31,.24),.022,glow)
        return
    if family=='leechMandible':
        # Broad armored clam shell with two inward-curving jaws. The pressure
        # well is recessed in real geometry; the mouth is not a painted circle.
        shell=[(-1.76,.16),(-2.05,-.43),(-1.76,-1.09),(-.82,-1.55),(0,-1.65),
               (.82,-1.55),(1.76,-1.09),(2.05,-.43),(1.76,.16),(.85,-.13),(-.85,-.13)]
        plate('Leech ventral armored shell',shell,-.27,.29,dark)
        plate('Leech broad upper carapace',[(x*.95,y*.95) for x,y in shell],.02,.26,armor)
        for side in (-1,1):
            jaw=[(.66,-.6),(1.69,-.62),(2.03,.05),(1.83,.81),(1.11,1.57),(.52,1.71),
                 (.92,1.13),(1.25,.63),(1.22,.12),(.74,.04)]
            plate('Leech hooked pressure jaw',[(side*x,y) for x,y in jaw],-.09,.3,armor)
            plates=[[(1.03,-.48),(1.62,-.44),(1.87,.06),(1.59,.23),(1.32,.03)],
                    [(1.61,.33),(1.80,.23),(1.59,.84),(1.05,1.42),(.79,1.46),(1.28,.75)]]
            for points in plates:
                plate('Leech segmented jaw shield',[(side*x,y) for x,y in points],.23,.10,steel)
            beam('Leech inner induction channel',(side*.89,-.05,.25),(side*1.24,.58,.25),.035,glow)
            beam('Leech crushing contact tine',(side*1.22,.70,.13),(side*.74,1.28,.13),.07,dark)
            engine(side*.93,-1.22,-.02,.74)
            for j in range(4):
                plate('Leech overlapping rear armor',[(side*(.26+j*.36),-.65),(side*(.58+j*.34),-.62),
                      (side*(.67+j*.29),-1.21+j*.06),(side*(.32+j*.31),-1.33+j*.05)],.29,.075,steel,.018)
        cylinder('Leech induction well',(0,.14,-.07),.66,.18,dark)
        arc_ribbon('Leech crimson reactor collar',.56,.56,.095,0,359,.06,.07,glow,center=(0,.14))
        cylinder('Leech armored iris',(0,.14,.12),.37,.08,armor)
        cylinder('Leech pressure core',(0,.14,.18),.17,.09,glow)
        for angle in range(0,360,60):
            a=math.radians(angle)
            beam('Leech iris radial vane',(.20*math.cos(a),.14+.20*math.sin(a),.20),(.42*math.cos(a),.14+.42*math.sin(a),.18),.032,steel)
        plate('Leech rear command crest',[(-.26,-1.4),(-.38,-.64),(0,-.30),(.38,-.64),(.26,-1.4)],.35,.19,armor)
        box('Leech crimson sensor slit',(0,-.55,.56),(.32,.08,.06),glow,.018)
        return
    if family=='crescentRaider':
        # A continuous offset scythe, an exposed drive on the short wing and two
        # underslung ion lances: deliberately unlike the bilateral old fighters.
        arc_ribbon('Asymmetric crescent pressure hull',2.45,1.44,.56,12,193,-.11,.32,armor,center=(.13,-.04))
        arc_ribbon('Crescent dorsal armor',2.32,1.32,.32,18,190,.22,.12,steel,center=(.13,-.04))
        arc_ribbon('Forward ion induction seam',2.39,1.4,.035,25,176,.35,.035,glow,center=(.13,-.04))
        plate('Off-axis command pod',[(-.48,.72),(-.84,.03),(-.55,-.96),(-.14,-.75),(.1,.08)],.12,.26,armor)
        ellipsoid('Crimson raider canopy',(-.4,.06,.43),(.19,.39,.13),glass)
        for x,y,length in [(-1.25,.35,1.12),(.9,.53,.87)]:
            box('Ion lance armored mount',(x,y,.19),(.26,.4,.23),dark)
            beam('Twin ion lance',(x,y,.28),(x,y+length,.28),.075,steel)
            beam('Lance energized edge',(x,y+.2,.37),(x,y+length,.37),.026,glow)
        engine(-1.57,-.16,.04,.72)
        cylinder('Exposed offset turbine',(1.55,.08,.27),.31,.23,dark)
        arc_ribbon('Turbine induction ring',.25,.25,.06,0,355,.41,.05,glow,center=(1.55,.08))
        for i in range(4):
            beam('Scythe structural rib',(-1.75+i*.65,.78,.34),(-1.65+i*.65,1.18,.34),.028,dark)
        return
    if family=='triptych':
        # Tri-lobed command spindle, suspended rails and very open frame leave
        # visible negative space between the emitter lobes.
        plate('Weaver axial spindle',[(0,1.8),(-.3,.35),(-.2,-1.1),(.2,-1.1),(.3,.35)],-.1,.42,armor)
        plate('Spindle raised blade',[(0,1.5),(-.11,-.85),(.11,-.85)],.32,.22,steel)
        for x,y,scale in [(-1.65,-.12,.9),(1.65,-.12,.9),(0,-1.45,.72)]:
            for z in (-.06,.23):
                beam('Suspended lobe bridge',(0,.1,z),(x,y,z),.055,steel)
            cylinder('Lobe pressure drum',(x,y,.03),.43*scale,.35,armor)
            arc_ribbon('Lobe open ion cage',.36*scale,.49*scale,.08*scale,25,335,.26,.12,steel,center=(x,y))
            cylinder('Crossfire gate emitter',(x,y,.32),.19*scale,.09,glow)
            beam('Forward emitter fork',(x-.21*scale,y,.18),(x-.21*scale,y+.65*scale,.18),.045,steel)
            beam('Forward emitter fork',(x+.21*scale,y,.18),(x+.21*scale,y+.65*scale,.18),.045,steel)
            engine(x,y-.38,.0,.43*scale)
        ellipsoid('Weaver crimson sensor',(0,.65,.5),(.12,.28,.09),glass)
        beam('Spindle transmission spine',(0,-.4,.59),(0,.4,.59),.035,glow)
        return
    if family=='splitRing':
        # Guardian capital ship: two free-ended crescent wings, not a solid hull.
        # Thin radial bridges connect the golden central reactor to both rings.
        for side in (-1,1):
            start,end=(100,260) if side<0 else (-80,80)
            arc_ribbon('Seraph crescent lower hull',4.15,2.0,.64,start,end,-.2,.34,armor)
            arc_ribbon('Seraph crescent dorsal shield',4.04,1.92,.40,start+3,end-3,.14,.26,steel)
            arc_ribbon('Golden crescent inner conduit',3.53,1.36,.065,start+6,end-6,.27,.065,glow)
            for y in (-.7,.7):
                beam('Radial suspension bridge',(side*.72,y*.37,.02),(side*3.54,y,.02),.115,dark)
                beam('Suspension gold tracer',(side*.94,y*.37,.14),(side*3.5,y,.14),.025,glow)
            for i in range(7):
                a=math.radians(start+14+i*22)
                x,y=3.88*math.cos(a),1.7*math.sin(a)
                turret(x,y,.43,.19)
                beam('Crescent segmented buttress',(x*.94,y*.9,.41),(x*1.06,y*1.04,.41),.045,dark)
            engine(side*3.47,-.65,.01,.98)
        cylinder('Guardian reactor black socket',(0,0,.07),.94,.32,dark)
        arc_ribbon('Guardian gold reactor iris',.81,.81,.18,0,355,.31,.14,glow)
        cylinder('Guardian central crystal',(0,0,.45),.46,.34,steel)
        ellipsoid('Guardian white-hot heart',(0,0,.71),(.27,.27,.19),glow)
        for side in (-1,1):
            plate('Guardian central spear',[(side*.15,.65),(side*.51,1.25),(side*.12,2.1),(side*.03,.86)],.04,.22,armor)
            beam('Spear power channel',(side*.15,.82,.28),(side*.12,1.78,.28),.035,glow)
        return
    if family=='cathedral':
        # A vertical void cathedral with nested lancet prongs and two raised
        # reactor towers: a different silhouette, not another winged capital.
        plate('Architect dark keel',[(-.34,2.96),(-.79,1.12),(-.64,-1.95),(0,-2.42),(.64,-1.95),(.79,1.12),(.34,2.96)],-.32,.48,dark)
        plate('Architect central spire',[(-.18,2.65),(-.43,.85),(-.32,-1.72),(0,-2.16),(.32,-1.72),(.43,.85),(.18,2.65)],.16,.55,armor)
        for side in (-1,1):
            for j in range(3):
                x=side*(.72+j*.55);front=2.51-j*.47;rear=-1.71+j*.21
                plate('Nested lancet prong',[(x-side*.17,front),(x-side*.31,front-.88),(x-side*.29,rear),(x+side*.15,rear-.2),(x+side*.23,front-.68)],-.14+j*.09,.3,armor)
                plate('Spire sloped dorsal cap',[(x,front-.13),(x-side*.13,front-.95),(x-side*.13,rear+.18),(x+side*.11,rear+.04),(x+side*.11,front-.78)],.2+j*.09,.19,steel)
                beam('Prong violet edge',(x,front-.3,.46+j*.09),(x,rear+.25,.46+j*.09),.026,glow)
                for y in (-1.15,-.55,.05):
                    beam('Open flying buttress',(side*.3,y,.34),(x,y-.24,.08+j*.09),.09,steel)
                engine(x,rear-.16,-.07,.7)
            cylinder('Architect reactor tower',(side*.66,-.48,.5),.31,.68,dark)
            arc_ribbon('Architect red reactor crown',.29,.29,.075,0,355,.86,.15,glass,center=(side*.66,-.48))
            cylinder('Architect reactor beacon',(side*.66,-.48,1.05),.13,.15,glow)
        plate('Cathedral forward needle',[(-.12,.5),(-.08,3.12),(.08,3.12),(.12,.5)],.68,.14,steel)
        beam('Judgement beam emitter',(0,.7,.86),(0,2.5,.86),.055,glow)
        arc_ribbon('Architect broken halo',.61,1.02,.13,32,148,.78,.15,glow,center=(0,-.55))
        arc_ribbon('Architect broken halo',.61,1.02,.13,212,328,.78,.15,glow,center=(0,-.55))
        return
    if family=='kestrel':
        ribbed_hull(3.5,.74)
        wing(-1,1.9,-1.6,'manta');wing(1,1.9,-1.6,'manta')
        ellipsoid('Smoked blue cockpit glass',(0,.6,.51),(.3,.79,.27),glass)
        beam('Canopy spine',(0,.05,.76),(0,1.2,.63),.018,steel)
        for s in (-1,1):
            engine(s*.57,-.95,.1,.95)
            plate('Tail stabilizer',[(s*.75,-.6),(s*1.0,-1.55),(s*.5,-1.2)],.24,.11,armor)
            beam('Wingtip navigation light',(s*1.69,-.38,.13),(s*1.69,-.65,.13),.04,glow)
        return
    if family in ('drone','drone2'):
        ellipsoid('Drone fuselage',(0,0,0),(.4,.65,.22),armor)
        for s in (-1,1):
            wing(s,1.05,-.7,'blade');engine(s*.6,-.5,.08,.6)
        cylinder('Drone sensor',(0,.15,.25),.18,.10,glow)
        if family=='drone2':
            turret(-.42,.48,.17,.12);turret(.42,.48,.17,.12)
        return
    big=family in ('carrier','frigate','harrow')
    if big:
        ribbed_hull(3.4,1.15)
        for s in (-1,1):
            # Wide capital craft stays aligned with the established multipart hit zones.
            wing(s,3.5,-1.4,'slab')
            for j in range(3):
                box('Capital armored deck',(s*(1.18+j*.72),-.08,.21),(.64,1.5-j*.18,.3),armor)
                turret(s*(1.2+j*.72),.45,.42,.19)
                engine(s*(1.1+j*.73),-.87,.06,.8)
            for j in range(4):
                box('Deck service trench',(s*1.8,-.55+j*.27,.39),(2.1,.045,.03),dark,.005)
        if family=='harrow':
            # Crescent shoulder blades and a luminous central reactor recall Pale Harrow.
            for s in (-1,1):
                plate('Harrow crescent',[(s*1.7,-1.15),(s*3.65,-1.25),(s*3.95,.05),(s*3.1,1.0),(s*3.5,-.1),(s*2.5,-.65)],.06,.32,steel)
            cylinder('Reactor well',(0,0,.49),.68,.13,dark)
            cylinder('Red reactor ring',(0,0,.57),.49,.08,glow)
            cylinder('Reactor armored center',(0,0,.64),.34,.13,armor)
        else:
            box('Bridge tier 1',(0,-.18,.56),(.85,.85,.3),steel)
            box('Bridge tier 2',(0,-.32,.78),(.65,.5,.24),armor)
            box('Bridge windows',(0,-.03,.84),(.51,.05,.08),glow,.01)
        return
    span={'wisp':1.5,'talon':1.9,'hammer':2.1,'crown':2.15,'lance':1.3,'needle':1.85,
          'hauler':2.1,'halo':2,'bastion':2.65,'spectre':1.9,'battery':2.5,'claw':1.65,'razor':2.3}[family]
    slab=family in ('hammer','hauler','bastion','battery')
    ribbed_hull(3.1 if family in ('lance','needle') else 2.8,.66 if not slab else 1.0)
    for s in (-1,1):
        wing(s,span,-.5 if family in ('talon','razor') else -.95,'slab' if slab else 'blade')
        engine(s*(span*.57),-.8,.1,1 if slab else .75)
        if family in ('wisp','talon','lance','spectre','razor'):
            plate('Swept vertical stabilizer',[(s*.7,-.7),(s*.78,-1.1),(s*.8,-.2)],.20,.52,armor)
        if slab:
            box('Ordnance pod',(s*span*.74,0,.2),(.5,1.15,.36),armor)
            for j in range(3):
                cylinder('Ordnance hatch',(s*span*.74,-.36+j*.35,.4),.15,.08,dark)
                cylinder('Hatch status',(s*span*.74,-.36+j*.35,.45),.045,.03,glow)
    ellipsoid('Sensor canopy',(0,.52,.47),(.24,.49,.17),glass)
    if family in ('needle','battery'):
        beam('Long siege cannon',(0,.2,.55),(0,1.95,.55),.10,steel)
        cylinder('Cannon capacitor',(0,-.2,.5),.27,.14,glow)
    if family in ('halo','crown','bastion'):
        for s in (-1,1):
            cylinder('Reactor housing',(s*span*.65,0,.32),.30,.18,dark)
            cylinder('Exposed reactor',(s*span*.65,0,.44),.22,.08,glow)
            cylinder('Reactor iris',(s*span*.65,0,.50),.10,.05,steel)
        if family=='halo':
            bpy.ops.mesh.primitive_torus_add(major_radius=.66,minor_radius=.07,location=(0,-.28,.55))
            finish(bpy.context.object,glow,0)
    if family=='claw':
        for s in (-1,1):
            beam('Salvage arm',(s*.9,.4,.2),(s*1.3,1.2,.2),.12,steel)
            beam('Salvage claw',(s*1.3,1.2,.2),(s*.8,1.5,.2),.1,armor)
    if family=='spectre':
        plate('Stealth dorsal blade',[(-.17,-1),(-.13,.8),(.13,.8),(.17,-1)],.49,.13,steel)

def load_approved_eclipse():
    """Append the chosen editable design unchanged; keep its actual wing parts."""
    global seraph_wings
    source=ROOT/'assets/seraph-proposals-v1/eclipse.blend'
    with bpy.data.libraries.load(str(source),link=False) as (available,loaded):
        loaded.objects=list(available.objects)
    approved=next(o for o in loaded.objects if o and o.name.startswith('Seraph_Eclipse'))
    objects=[approved]+list(approved.children_recursive)
    for obj in objects:scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    hinges=[o for o in approved.children if o.name.startswith('Wing_')]
    seraph_wings=[]
    for hinge in hinges:
        meshes=[o for o in hinge.children_recursive if o.type=='MESH']
        seraph_wings.append({'pivot':hinge.matrix_world.translation.copy(),'meshes':meshes})
    for obj in list(approved.children_recursive):
        if obj.type=='MESH':
            matrix=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=matrix
    for hinge in hinges:bpy.data.objects.remove(hinge,do_unlink=True)
    bpy.data.objects.remove(approved,do_unlink=True)

def export_seraph_modules(w,h):
    """Neutral wing plates on a shared canvas with physical bearing origins.

    Runtime rotates these baked meshes, not invented vector wings. Projection
    data is also used for moving collision plates and actual firing origins.
    """
    folder=OUT/'modules';folder.mkdir(exist_ok=True)
    rig.rotation_euler=(0,0,math.pi);bpy.context.view_layer.update()
    def project(point):
        ndc=world_to_camera_view(scene,camera,rig.matrix_world@Vector(point))
        return [round((ndc.x-.5)*w,6),round((.5-ndc.y)*h,6)]
    entries=[]
    for wing in seraph_wings:
        hinge=project(wing['pivot']);side=-1 if hinge[0]<0 else 1
        source_side=-side
        muzzle=project((source_side*4.28,.58+.65*.95,.56+.34*.95))
        # Inscribed centers on the actual thick crescents and the gun sponson.
        colliders=[]
        for x,y,width,height in [(5.05,-.65,20,38),(5.05,.70,19,35),(4.28,.65,21,30),(3.0,-1.38,36,17)]:
            cx,cy=project((source_side*x,y,.40))
            colliders.append({'x':cx,'y':cy,'width':width,'height':height})
        for obj in rig.children:obj.hide_render=obj not in wing['meshes']
        filename='seraph-wing-left.png' if side<0 else 'seraph-wing-right.png'
        scene.render.filepath=str(folder/filename);bpy.ops.render.render(write_still=True)
        entries.append({'side':side,'file':'modules/'+filename,'textureKey':filename[:-4],
                        'hinge':hinge,'origin':[round(.5+hinge[0]/w,8),round(.5+hinge[1]/h,8)],
                        'muzzle':muzzle,'colliders':colliders})
    contract={'name':'Eclipse Seraph','source':'assets/seraph-proposals-v1/eclipse.blend',
              'width':w,'height':h,'textureDensity':2,'renderDensity':4,'neutralFrame':7,
              'sweepRadians':.10,'wings':sorted(entries,key=lambda wing:wing['side']),
              'note':'Coordinates in logical pixels from hull center; wing canvas shares the neutral hull projection. Rotate around the recorded physical hinge.'}
    (folder/'seraph-wings.json').write_text(json.dumps(contract,indent=2)+'\n')
    for obj in rig.children:obj.hide_render=False
    scene.render.filepath=str(folder/'seraph-complete.png');bpy.ops.render.render(write_still=True)
    print('SERAPH_MODULE_CONTRACT',json.dumps(contract),flush=True)

def load_approved_crown():
    """Use the exact approved editable geometry, with articulated parts split.

    Review sources remain immutable. Hull keeps only six stationary recesses;
    the bearing, armor, twin barrels and their plated skin become one module.
    """
    global crown_turret_meshes, crown_mounts, crown_collision_shapes
    source=ROOT/'assets/boss-proposals-v1/crown.blend'
    with bpy.data.libraries.load(str(source),link=False) as (available,loaded):
        loaded.objects=list(available.objects)
    approved=next(o for o in loaded.objects if o and o.name.startswith('Boss_Obsidian_Crown'))
    objects=[approved]+list(approved.children_recursive)
    for obj in objects:scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    mounts=sorted([o for o in approved.children if o.name.startswith('Turret_')],key=lambda o:o.name)
    crown_mounts=[{'id':i+1,'position':list(o.matrix_world.translation)} for i,o in enumerate(mounts)]
    crown_turret_meshes=[]
    crown_collision_shapes=[]
    for obj in list(approved.children_recursive):
        if obj.type!='MESH':continue
        matrix=obj.matrix_world.copy()
        turret_parent=obj.parent if obj.parent in mounts else None
        if turret_parent and '_recess' not in obj.name:
            if turret_parent==mounts[0]:
                obj.parent=None
                obj.matrix_world=matrix
                obj.location-=mounts[0].matrix_world.translation
                crown_turret_meshes.append(obj)
            else:bpy.data.objects.remove(obj,do_unlink=True)
            continue
        obj.parent=rig
        obj.matrix_world=matrix
        if obj.name.startswith(('Crown axial leviathan chassis','Crown diagonal armored outrigger','Crown swept blade tip')):
            crown_collision_shapes.append((obj.name,[matrix@v.co for v in obj.data.vertices]))
    for obj in mounts:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.objects.remove(approved,do_unlink=True)
    for obj in crown_turret_meshes:obj.hide_render=True

def export_crown_module(w,h):
    """Bake one pivot-centered sprite at exactly the hull's pixels/metre scale."""
    folder=OUT/'modules';folder.mkdir(exist_ok=True)
    source=SOURCE/'crown-turret.glb'
    saved_scale=camera_data.ortho_scale
    saved_resolution=(scene.render.resolution_x,scene.render.resolution_y)
    rig.rotation_euler=(0,0,math.pi)
    bpy.context.view_layer.update()
    def project(point):
        ndc=world_to_camera_view(scene,camera,rig.matrix_world@Vector(point))
        return [(ndc.x-.5)*w,(.5-ndc.y)*h]
    mount_data=[]
    for entry in crown_mounts:
        x,y=project(entry['position'])
        mount_data.append({'id':entry['id'],'x':round(x/w,6),'y':round(y/h,6),'nativeX':round(x,4),'nativeY':round(y,4)})
    hull_shapes=[]
    for name,vertices in crown_collision_shapes:
        projected=[project(p) for p in vertices]
        # Convex outlines follow each actual plate rather than filling its AABB
        # diagonal corners. Keel and each individual outrigger are convex.
        points=sorted(set((round(p[0],6),round(p[1],6)) for p in projected))
        cross=lambda a,b,c:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        lower=[];upper=[]
        for p in points:
            while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
            lower.append(p)
        for p in reversed(points):
            while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
            upper.append(p)
        hull_shapes.append({'name':name,'bounds':[round(min(p[0] for p in projected)/w,6),round(min(p[1] for p in projected)/h,6),
                                                round(max(p[0] for p in projected)/w,6),round(max(p[1] for p in projected)/h,6)],
                            'polygon':[[round(p[0]/w,6),round(p[1]/h,6)] for p in lower[:-1]+upper[:-1]]})
    pixels_per_unit=w/saved_scale
    module_rig=bpy.data.objects.new('Crown_turret_articulated',None);scene.collection.objects.link(module_rig)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in crown_turret_meshes:
        obj.parent=module_rig;obj.hide_render=False;obj.select_set(True)
    module_rig.select_set(True);bpy.context.view_layer.objects.active=module_rig
    bpy.ops.export_scene.gltf(filepath=str(source),use_selection=True,export_format='GLB',export_apply=True)
    for obj in rig.children:obj.hide_render=True
    module_rig.rotation_euler=(0,0,math.pi)
    camera_data.ortho_scale=48/pixels_per_unit
    scene.render.resolution_x=192;scene.render.resolution_y=192
    scene.render.filepath=str(folder/'crown-turret.png')
    bpy.context.view_layer.update()
    bpy.ops.render.render(write_still=True)
    # Barrel geometry ends at +1.055*.82, height .37*.82 relative to bearing.
    muzzle=world_to_camera_view(scene,camera,module_rig.matrix_world@Vector((0,1.055*.82,.37*.82)))
    contract={'name':'Obsidian Crown','source':'assets/boss-proposals-v1/crown.blend','hullSource':'assets/graphics-v2/models/nullArchitect.glb',
              'turretSource':'assets/graphics-v2/models/crown-turret.glb','turretFile':'modules/crown-turret.png','turretTextureKey':'crown-turret',
              'width':w,'height':h,'neutralFrame':7,'turretWidth':48,'turretHeight':48,'textureDensity':3,'renderDensity':4,'pivot':[.5,.5],
              'barrelForward':'down','barrelForwardRadians':0,'muzzleLengthPx':round((.5-muzzle.y)*48,4),
              'barrelHalfSpacingPx':round(.145*.82*pixels_per_unit,6),
              'mounts':mount_data,'conservativeHullBounds':hull_shapes,'note':'Mount coordinates are offsets from hull center, divided by native width/height. Lock hull to neutral frame7 for modular combat.'}
    (folder/'crown-turret.json').write_text(json.dumps(contract,indent=2)+'\n')
    for obj in crown_turret_meshes:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.objects.remove(module_rig,do_unlink=True)
    for obj in rig.children:obj.hide_render=False
    camera_data.ortho_scale=saved_scale
    scene.render.resolution_x,scene.render.resolution_y=saved_resolution
    print('CROWN_MODULE_CONTRACT',json.dumps(contract),flush=True)

OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
# Factory-startup is required: this only ever mutates the offline rendering process.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.world.color=(.16,.16,.16)
scene.view_settings.view_transform='AgX'
camera_data=bpy.data.cameras.new('CAM_Fleet_orthographic');camera=bpy.data.objects.new('CAM_Fleet_orthographic',camera_data)
scene.collection.objects.link(camera);scene.camera=camera
camera.location=(0,-7,20);camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'
for name,loc,energy,size,color in [
    ('LGT_Key',(-5,2,9),1800,5,(.83,.91,1)),
    ('LGT_Fill',(5,-1,5),950,5,(.32,.60,1)),
    ('LGT_Rim',(1,5,4),2100,3,(1,.65,.42)),
]:
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
    o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()

selected=['player','scout'] if '--pilot' in sys.argv else list(SPECS)
only=next((arg.split('=',1)[1] for arg in sys.argv if arg.startswith('--only=')),None)
if '--only' in sys.argv:only=sys.argv[sys.argv.index('--only')+1]
if only:selected=only.split(',')
unknown=set(selected)-set(SPECS)
if unknown:raise ValueError(f'Unknown ship ids: {sorted(unknown)}')
metadata={}
for kind in selected:
    w,h,family,color=SPECS[kind]
    friendly=kind in ('player','drone','droneMk2')
    armor=material(kind+'_ceramic',(.55,.64,.71) if friendly else (.025,.035,.055),.72 if friendly else .45,.32)
    steel=material(kind+'_titanium',(.24,.34,.43) if friendly else (.10,.13,.18),.82,.29)
    dark=material(kind+'_carbon',(.018,.029,.046),.45,.38)
    glow=material(kind+'_emitter',COLORS[color],.35,.25,3.8)
    glass=material(kind+'_canopy',(.015,.07,.13) if friendly else (.19,.025,.035),.85,.16)
    rig=bpy.data.objects.new('HERO_'+kind,None);scene.collection.objects.link(rig)
    build(kind,family)
    if family=='approvedCrown':
        old_source=SOURCE/(kind+'.glb');backup=SOURCE/'archive/nullArchitect-cathedral-v1.glb'
        if old_source.exists() and not backup.exists():
            backup.parent.mkdir(exist_ok=True);backup.write_bytes(old_source.read_bytes())
    bpy.ops.object.select_all(action='DESELECT')
    for o in rig.children:o.select_set(True)
    rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(SOURCE/(kind+'.glb')),use_selection=True,export_format='GLB')
    render_density=4 if family in ('approvedCrown','approvedEclipse') else 3
    texture_density=3 if family=='approvedCrown' else 2 if family=='approvedEclipse' else 1
    scene.cycles.samples=64 if render_density==4 else 24
    scene.render.resolution_x=w*render_density;scene.render.resolution_y=h*render_density;scene.render.resolution_percentage=100
    base=0 if friendly else math.pi
    # Blender's AUTO sensor fit uses the longer image axis for ortho_scale.
    # Fit the union of every bank so there is no crop or per-frame zoom/pivot drift.
    points=[]
    for angle in ANGLES:
        rig.rotation_euler=(0,math.radians(angle),base)
        bpy.context.view_layer.update()
        points.extend(camera.matrix_world.inverted() @ o.matrix_world @ Vector(p)
                      for o in rig.children if o.type=='MESH' for p in o.bound_box)
    extent_x=max(abs(p.x) for p in points);extent_y=max(abs(p.y) for p in points)
    camera_data.ortho_scale=(max(extent_x*2,extent_y*2*w/h) if w>=h else max(extent_y*2,extent_x*2*h/w))*1.12
    if family=='approvedEclipse':
        for wing in seraph_wings:
            for obj in wing['meshes']:obj.hide_render=True
    folder=OUT/kind;folder.mkdir(exist_ok=True)
    for i,angle in enumerate(ANGLES):
        rig.rotation_euler=(0,math.radians(angle),base)
        scene.render.filepath=str(folder/f'{i:02}.png')
        bpy.ops.render.render(write_still=True)
    metadata[kind]={'width':w,'height':h,'family':family,'angles':ANGLES,'neutralFrame':7,'source':f'assets/graphics-v2/models/{kind}.glb',
                    'textureDensity':texture_density,'renderDensity':render_density,'frameWidth':w*texture_density,'frameHeight':h*texture_density}
    if family=='approvedCrown':export_crown_module(w,h)
    if family=='approvedEclipse':export_seraph_modules(w,h)
    for o in list(rig.children):bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.objects.remove(rig,do_unlink=True)
    print('FLEET_COMPLETE',kind,flush=True)
manifest_path=OUT/('pilot.json' if '--pilot' in sys.argv else 'manifest.json')
# Selective bakes must retain the metadata of previously rendered spacecraft.
if only and manifest_path.exists():
    metadata={**json.loads(manifest_path.read_text()),**metadata}
manifest_path.write_text(json.dumps(metadata,indent=2))
