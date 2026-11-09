"""Three editable Seraph guardian proposals; never replaces gameplay assets.

Blender --background --factory-startup --python scripts/render-seraph-proposals.py
Optional: -- --only=eclipse,talon,halo [--replace] [--export-only]
Uses the same local geometry/material workflow as the approved Obsidian Crown.
"""
import bpy
import importlib.util
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/seraph-proposals-v1'
REVIEW = ROOT / 'public/reviews/seraph-proposals-v1'
NAMES = {'eclipse': 'Eclipse Seraph', 'talon': 'Vesper Talon', 'halo': 'Reliquary Sentinel'}
spec = importlib.util.spec_from_file_location('ship_geometry', ROOT / 'scripts/render-boss-proposals.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def bearing(side, x=1.08, y=-.35, z=.45):
    """Fixed hull socket plus rotating wing-root assembly; coordinates in metres."""
    x *= side
    p.cylinder('Fixed hull wing bearing socket', (x,y,z), .52,.24,p.carbon)
    p.arc('Fixed bearing titanium surround',x,y,.48,.48,.09,0,360,z+.12,.07,p.edge)
    joint = bpy.data.objects.new('Wing_L_hinge' if side < 0 else 'Wing_R_hinge',None)
    bpy.context.collection.objects.link(joint)
    joint.parent = p.rig
    joint['role'] = 'articulated wing pivot at physical bearing centre'
    joint['preview_sweep_limit_degrees'] = 12
    p.parent = joint
    p.cylinder('Wing rotary bearing', (x,y,z+.14),.35,.16,p.steel)
    p.arc('Wing bearing amber witness marks',x,y,.31,.31,.035,0,340,z+.23,.035,p.red,24)
    for i in range(8):
        a = i*math.tau/8
        p.cylinder('Wing bearing captive bolt',(x+math.cos(a)*.40,y+math.sin(a)*.40,z+.21),.037,.035,p.edge,8)
    return joint,Vector((x,y,z))


def end_wing(joint,pivot):
    for child in joint.children:
        child.location -= pivot
    joint.location = pivot
    p.parent = None


def piston(name,a,b):
    a,b = Vector(a),Vector(b)
    p.beam(name+' cylinder',a,a+(b-a)*.61,.13,p.carbon)
    p.beam(name+' polished rod',a+(b-a)*.48,b,.072,p.edge)
    p.cylinder(name+' end bearing',b,.12,.12,p.steel,16)


def emitter(x,y,z,scale=1):
    """Recessed forward energy aperture, visibly a gun rather than a turret dot."""
    points=[(x-.37*scale,y-.60*scale),(x+.37*scale,y-.60*scale),
            (x+.43*scale,y+.25*scale),(x+.24*scale,y+.64*scale),
            (x-.24*scale,y+.64*scale),(x-.43*scale,y+.25*scale)]
    p.plate('Wing lance pressure casing',points,z,.28*scale,p.steel,.035)
    p.box('Wing lance recessed channel',(x,y+.12*scale,z+.31*scale),(.22*scale,.92*scale,.04),p.carbon,.015)
    for s in (-1,1):
        p.beam('Wing lance focusing rail',(x+s*.16*scale,y-.18*scale,z+.35*scale),
               (x+s*.16*scale,y+.84*scale,z+.35*scale),.06*scale,p.edge)
        p.beam('Wing lance amber induction seam',(x+s*.10*scale,y-.12*scale,z+.37*scale),
               (x+s*.10*scale,y+.54*scale,z+.37*scale),.019,p.red)
    p.box('Wing lance white amber muzzle',(x,y+.65*scale,z+.34*scale),(.17*scale,.05,.09),p.hot,.008)
    for i in range(4):
        p.box('Wing lance heat sink',(x,y-.48*scale+i*.10,z+.3),(.36*scale,.035,.07),p.edge,.004)


def spine(front=3.2,rear=-2.3,width=1):
    p.loft('Seraph continuous armored pressure hull',[
        (front,.08,-.08,.09,.18),(front*.65,.57*width,-.28,.24,.48),
        (.35,1.02*width,-.45,.43,.78),(-.7,1.1*width,-.43,.4,.74),
        (rear+.4,.65*width,-.28,.23,.50),(rear,.4*width,-.1,.1,.27)],p.steel)
    for side in (-1,1):
        for i in range(5):
            y=-1.85+i*.66
            w=(.5 if i<3 else .38)*width
            p.plate('Seraph split spinal armor',[(side*.12,y-.27),(side*(w+.26),y-.22),
                    (side*(w+.20),y+.23),(side*.12,y+.34)],.78 if i in (1,2,3) else .57,.13,p.armor,.02)
        p.engine(side*.45,rear+.10,-.10,.85)
        p.vents(side*.54,-1.1,.93,.36,.70,9)
    p.reactor(0,.38,.83,.51)
    p.command_spire(0,-.95,.90,.49)
    p.plate('Seraph central spear armor',[(-.22,1.24),(0,front+.13),(.22,1.24)],.46,.17,p.edge)
    p.beam('Seraph axial amber sensor slit',(0,1.35,.65),(0,front-.25,.27),.022,p.red)


def curve(points,t):
    return tuple((1-t)**3*points[0][j]+3*(1-t)**2*t*points[1][j]+3*(1-t)*t*t*points[2][j]+t**3*points[3][j] for j in range(2))


def eclipse():
    spine()
    for s in (-1,1):
        joint,pivot=bearing(s,1.06,-.65,.45)
        # Swept curved pressure hull with substantial depth, not a thin hoop.
        outer=[curve([(1.25,-1.9),(7.8,-3.3),(6.2,1.9),(3.6,3.25)],i/36) for i in range(37)]
        inner=[]
        for i,(x,y) in enumerate(outer):
            t=i/36
            width=.22+1.0*math.sin(t*math.pi)**.8
            inner.append((x-width,y+.02-.18*t))
        inner[-1]=(outer[-1][0]-.045,outer[-1][1]-.05)
        mirror=lambda pts:[(s*x,y) for x,y in pts]
        p.plate('Eclipse continuous curved wing hull',mirror(outer+inner[::-1]),-.13,.57,p.steel,.045)
        for i in range(12):
            a,b=i*3,(i+1)*3
            q=[outer[a],outer[b],inner[b],inner[a]]
            cx=sum(x for x,y in q)/4;cy=sum(y for x,y in q)/4
            q=[(s*(cx+(x-cx)*.96),cy+(y-cy)*.94) for x,y in q]
            p.plate('Eclipse separate crescent armor tile',q,.44,.19 if i<9 else .10,p.armor,.022)
            if i<10:
                p.beam('Eclipse recessed amber inner conduit',(s*(inner[a][0]+.05),inner[a][1],.41),
                       (s*(inner[b][0]+.05),inner[b][1],.41),.026,p.red)
        p.plate('Eclipse tapered torque shoulder',mirror([(1.03,-.95),(3.75,-1.8),(4.2,-1.1),(2.3,-.35),(1.05,-.25)]),.05,.35,p.armor,.035)
        piston('Eclipse main sweep actuator',(s*1.05,-.44,.68),(s*3.3,-1.15,.44))
        piston('Eclipse secondary sweep actuator',(s*1.22,-1.38,.30),(s*3.8,-1.68,.30))
        p.plate('Eclipse forward gun sponson',mirror([(3.7,-.04),(4.7,.15),(4.83,1.25),(4.3,1.70),(3.87,1.10)]),.26,.27,p.steel)
        emitter(s*4.28,.58,.56,.95)
        p.vents(s*3.36,-1.35,.49,.64,.80)
        p.engine(s*3.9,-1.90,.01,1.0)
        end_wing(joint,pivot)


def talon():
    spine(front=3.7,rear=-2.5,width=.91)
    for s in (-1,1):
        joint,pivot=bearing(s,.99,-.34,.48)
        mirror=lambda pts:[(s*x,y) for x,y in pts]
        p.plate('Talon swept load-bearing wing hull',mirror([(.85,-.52),(1.35,.95),(2.7,.56),(5.9,-2.4),
                    (5.7,-3.15),(3.1,-2.4),(1.33,-1.0)]),-.16,.5,p.steel,.05)
        # Broad overlapping aft-swept vanes: connected armored hunter wings.
        for i in range(4):
            x=1.5+i*.95;y=.62-i*.67
            q=[(x,y),(x+.72,y-.31),(x+1.28,y-2.17),(x+.66,y-1.88),(x-.10,y-.65)]
            p.plate('Talon swept layered feather armor',mirror(q),.34+i*.018,.23,p.armor,.03)
            p.beam('Talon titanium feather leading edge',(s*x,y,.58+i*.018),(s*(x+1.18),y-2.02,.49+i*.018),.032,p.edge)
            p.beam('Talon amber feather root channel',(s*(x+.1),y-.17,.59),(s*(x+.56),y-.45,.59),.025,p.red)
        # Twin forked forward shoulders give this option a predatory planform.
        p.plate('Talon forward fork shoulder armor',mirror([(1.24,.1),(1.74,2.9),(2.35,2.05),(2.82,.42),(2.39,-.56)]),.08,.43,p.steel,.035)
        p.plate('Talon forward fork bevel armor',mirror([(1.48,.40),(1.75,2.73),(2.12,1.87),(2.43,.44)]),.51,.15,p.armor)
        p.beam('Talon forward amber sensor rail',(s*1.72,.50,.68),(s*1.84,2.29,.61),.025,p.red)
        emitter(s*2.65,.11,.44,1.08)
        piston('Talon visible wing sweep cylinder',(s*.98,-.50,.73),(s*2.63,-1.36,.50))
        p.vents(s*3.45,-1.28,.64,.45,.75)
        p.engine(s*2.45,-1.87,-.03,.95)
        p.engine(s*3.38,-2.33,-.03,.66)
        end_wing(joint,pivot)


def halo():
    spine(front=2.9,rear=-2.5,width=1.1)
    # Two thick, independent crescent shield generators, openly split fore/aft.
    for s in (-1,1):
        joint,pivot=bearing(s,1.17,-.12,.47)
        start,end=(104,256) if s<0 else (-76,76)
        p.arc('Halo primary curved armored wing hull',0,-.1,5.6,2.85,1.0,start,end,-.25,.62,p.steel,48)
        p.arc('Halo recessed amber perimeter conductor',0,-.1,4.63,1.87,.045,start+3,end-3,.27,.055,p.red,48)
        for i in range(10):
            a=start+i*(end-start)/10+1.8;b=start+(i+1)*(end-start)/10-1.8
            p.arc('Halo segmented pressure armor belt',0,-.1,5.53,2.78,.81,a,b,.37,.24,p.armor,5)
            theta=math.radians((a+b)*.5)
            x,y=5.16*math.cos(theta),-.1+2.40*math.sin(theta)
            p.cylinder('Halo radial armor fastening',(x,y,.64),.055,.04,p.edge,8)
        # Fore and aft torque arms form real structural connections, with gaps.
        for y in (-.91,.63):
            p.plate('Halo armored structural bridge',[(s*1.05,y-.18),(s*4.65,y-.53),
                (s*4.72,y+.16),(s*1.05,y+.24)],-.02,.28,p.steel)
            piston('Halo paired hydraulic actuator',(s*1.2,y,.43),(s*3.67,y-.12,.37))
        emitter(s*4.91,.32,.64,1.0)
        p.vents(s*4.91,-.86,.65,.56,.77)
        p.engine(s*4.38,-1.68,-.06,.86)
        # The open ring tips are tapered mechanical horns, not cropped pipe ends.
        for front in (-1,1):
            yy=front*2.55-.1
            q=[(s*1.30,yy),(s*2.14,yy+front*.20),(s*2.78,yy-front*.20),
               (s*1.45,yy-front*.35),(s*.92,yy+front*.42)]
            p.plate('Halo tapered free-ended armor horn',q,.02,.39,p.armor,.035)
        end_wing(joint,pivot)
    for s in (-1,1):
        p.plate('Halo central reactor containment armor',[(s*.2,-.1),(s*.83,-.33),(s*.87,.82),(s*.25,1.09)],.83,.12,p.armor)


def main():
    SOURCE.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
    selected=next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--only=')),list(NAMES))
    if set(selected)-set(NAMES):raise ValueError('Unknown Seraph proposal')
    for kind in selected:
        if (SOURCE/f'{kind}.blend').exists() and '--replace' not in sys.argv:
            raise FileExistsError('Proposal retained; --replace is required for revisions')
        scene=p.setup_scene();p.parent=None
        p.armor=p.material('Seraph layered graphite armor',(.072,.079,.087),.86,.34)
        p.steel=p.material('Seraph titanium pressure hull',(.032,.039,.049),.78,.38)
        p.edge=p.material('Seraph machined silver edges',(.17,.19,.22),.88,.28)
        p.carbon=p.material('Seraph recessed black ceramic',(.008,.012,.018),.30,.48)
        p.red=p.material('Seraph ancient amber conductors',(.80,.25,.022),.35,.28,1.5)
        p.hot=p.material('Seraph white amber lance apertures',(.95,.64,.24),.20,.27,2.0)
        p.rig=bpy.data.objects.new('Seraph_'+NAMES[kind].replace(' ','_'),None)
        scene.collection.objects.link(p.rig)
        {'eclipse':eclipse,'talon':talon,'halo':halo}[kind]()
        bpy.context.view_layer.update()
        p.detail_armor_surfaces()
        meshes=[o for o in p.all_children(p.rig) if o.type=='MESH']
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            bpy.context.view_layer.objects.active=obj;obj.select_set(True)
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            obj.select_set(False)
        for obj in p.all_children(p.rig)+[p.rig]:obj.select_set(True)
        bpy.context.view_layer.objects.active=p.rig
        bpy.ops.export_scene.gltf(filepath=str(SOURCE/f'{kind}.glb'),export_format='GLB',use_selection=True,export_apply=True)
        (REVIEW/f'{kind}.glb').write_bytes((SOURCE/f'{kind}.glb').read_bytes())
        p.REVIEW=REVIEW
        if '--export-only' not in sys.argv:
            p.render(scene,kind,'hero');p.render(scene,kind,'top')
            p.render(scene,kind,'game',(640,328))
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f'{kind}.blend'))
        deps=bpy.context.evaluated_depsgraph_get()
        triangles=sum(sum(len(face.vertices)-2 for face in obj.evaluated_get(deps).data.polygons) for obj in meshes)
        stats={'id':kind,'name':NAMES[kind],'meshObjects':len(meshes),'triangles':triangles,'wingAssemblies':2,
            'materials':6,'glbBytes':(SOURCE/f'{kind}.glb').stat().st_size,
            'basis':'Actual Blender geometry; +Y bow / +Z up; static inspection pose',
            'status':'proposal-awaiting-owner-selection','productionReplaced':False}
        (REVIEW/f'{kind}.json').write_text(json.dumps(stats,indent=2)+'\n')
        print('SERAPH_PROPOSAL_COMPLETE',json.dumps(stats),flush=True)


if __name__=='__main__':main()
