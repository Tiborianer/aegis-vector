"""Three owner-review capital ships, authored as genuine reusable 3D geometry.

Run in an isolated Blender process, never the owner's open scene:
Blender --background --factory-startup --python scripts/render-boss-proposals.py
Optional: -- --only=harrow --replace [--export-only]
Units metres, +Y bow, +Z dorsal. Six independently named weapon assemblies.
No image-to-plane assets, paid services, or production asset replacements.
"""
import bpy
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/boss-proposals-v1'
REVIEW = ROOT / 'public/reviews/boss-proposals-v1'
NAMES = {'harrow': 'Harrow Ascendant', 'bastion': 'Bastion Nocturne', 'crown': 'Obsidian Crown'}
random.seed(807)
rig = None
parent = None

def material(name, color, metal=.75, rough=.37, glow=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = glow
    # Microfinish is optional render-only nuance. GLB retains authored PBR values.
    if not glow:
        tex = mat.node_tree.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 110
        tex.inputs['Detail'].default_value = 2
        bump = mat.node_tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .12
        bump.inputs['Distance'].default_value = .015
        mat.node_tree.links.new(tex.outputs['Fac'], bump.inputs['Height'])
        mat.node_tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat

def finish(obj, name, mat, bevel=.025):
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent or rig
    if bevel:
        modifier = obj.modifiers.new('Small machined bevels', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        obj.modifiers.new('Weighted armor normals', 'WEIGHTED_NORMAL')
    return obj

def mesh(name, verts, faces, mat, bevel=.025):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat, bevel)

def plate(name, points, z, thickness, mat, bevel=.025, taper=.94):
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    n = len(points)
    verts = [(x, y, z) for x, y in points]
    verts += [(cx+(x-cx)*taper, cy+(y-cy)*taper, z+thickness) for x, y in points]
    faces = [tuple(range(n-1,-1,-1)), tuple(range(n,n*2))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    return mesh(name, verts, faces, mat, bevel)

def box(name, pos, dims, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.scale = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)

def cylinder(name, pos, radius, depth, mat, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos)
    return finish(bpy.context.object, name, mat, .015)

def beam(name, a, b, radius, mat, vertices=12):
    a, b = Vector(a), Vector(b)
    obj = cylinder(name, (a+b)/2, radius, (b-a).length, mat, vertices)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj

def arc(name, cx, cy, rx, ry, width, start, end, z, thick, mat, steps=40):
    angles = [math.radians(start+(end-start)*i/steps) for i in range(steps+1)]
    n = len(angles)
    verts = []
    for height in (z,z+thick):
        for inset in (0,width):
            verts += [(cx+(rx-inset)*math.cos(a), cy+(ry-inset)*math.sin(a), height) for a in angles]
    faces = []
    for i in range(n-1):
        faces += [(i,i+1,n+i+1,n+i),(2*n+i,3*n+i,3*n+i+1,2*n+i+1),
                  (i,2*n+i,2*n+i+1,i+1),(n+i,n+i+1,3*n+i+1,3*n+i)]
    faces += [(0,n,3*n,2*n),(n-1,3*n-1,4*n-1,2*n-1)]
    return mesh(name, verts, faces, mat, .018)

def loft(name, stations, mat):
    # Cross-sections: y, half-width, bottom, shoulder, dorsal. Hull is continuous.
    verts = []
    for y,w,b,s,t in stations:
        verts += [(-w*.76,y,b),(w*.76,y,b),(w,y,s),(w*.62,y,t),(-w*.62,y,t),(-w,y,s)]
    faces = [tuple(range(5,-1,-1))]
    for i in range(len(stations)-1):
        for j in range(6):
            faces.append((i*6+j,i*6+(j+1)%6,(i+1)*6+(j+1)%6,(i+1)*6+j))
    faces.append(tuple(range((len(stations)-1)*6,len(stations)*6)))
    return mesh(name, verts, faces, mat, .045)

def vents(x,y,z,width=.6, length=.8, count=13):
    box('Hull recessed service bay', (x,y,z), (width,length,.045), carbon, .01)
    for i in range(count):
        box('Parallel radiator louvre', (x,y-length*.42+i*length*.84/(count-1),z+.025), (width*.87,.021,.032), edge, .005)

def reactor(x,y,z,r=.85):
    cylinder('Hull reactor armored socket', (x,y,z), r*1.18,.28,carbon)
    arc('Hull reactor outer titanium rim',x,y,r*1.13,r*1.13,.10,0,360,z+.14,.12,edge)
    arc('Hull reactor crimson induction ring',x,y,r*.95,r*.95,.11,0,360,z+.19,.04,red)
    cylinder('Hull reactor recessed iris', (x,y,z+.15), r*.73,.1,steel)
    cylinder('Hull reactor luminous heart', (x,y,z+.22), r*.15,.08,hot)
    for i in range(12):
        a=i*math.tau/12
        beam('Radial reactor containment vane',(x+math.cos(a)*r*.24,y+math.sin(a)*r*.24,z+.28),
             (x+math.cos(a)*r*.78,y+math.sin(a)*r*.78,z+.27),.036,carbon)
    for i in range(8):
        a=i*math.tau/8
        cylinder('Reactor rim fastening bolt',(x+math.cos(a)*r*1.06,y+math.sin(a)*r*1.06,z+.3),.027,.025,edge,8)

def engine(x,y,z,scale=1):
    # Longitudinal exhaust with concentric mechanical shrouds.
    o=cylinder('Aft drive armored shroud',(x,y,z),.36*scale,.7*scale,steel)
    o.rotation_euler[0]=math.pi/2
    o=cylinder('Aft drive black exhaust well',(x,y-.37*scale,z),.28*scale,.05,carbon)
    o.rotation_euler[0]=math.pi/2
    o=cylinder('Aft drive crimson exhaust',(x,y-.405*scale,z),.19*scale,.035,red)
    o.rotation_euler[0]=math.pi/2
    for i in range(6):
        a=i*math.tau/6
        beam('Engine heat exchanger',(x+math.cos(a)*.33*scale,y-.25*scale,z+math.sin(a)*.33*scale),
             (x+math.cos(a)*.33*scale,y+.3*scale,z+math.sin(a)*.33*scale),.035,edge)

def turret(number,x,y,z,scale=1):
    global parent
    parent=bpy.data.objects.new(f'Turret_{number:02d}_assembly',None)
    bpy.context.collection.objects.link(parent)
    parent.parent=rig
    cylinder(f'Turret_{number:02d}_recess',(x,y,z),.48*scale,.16,carbon)
    cylinder(f'Turret_{number:02d}_bearing',(x,y,z+.13),.39*scale,.17,edge)
    points=[(x-.34*scale,y-.28*scale),(x+.34*scale,y-.28*scale),(x+.40*scale,y+.15*scale),
            (x+.21*scale,y+.38*scale),(x-.21*scale,y+.38*scale),(x-.40*scale,y+.15*scale)]
    plate(f'Turret_{number:02d}_armor',points,z+.2,.30*scale,armor,.035)
    for s in (-1,1):
        beam(f'Turret_{number:02d}_barrel',(x+s*.145*scale,y+.13*scale,z+.37*scale),
             (x+s*.145*scale,y+1.05*scale,z+.37*scale),.072*scale,edge)
        beam(f'Turret_{number:02d}_barrel_sleeve',(x+s*.145*scale,y+.25*scale,z+.37*scale),
             (x+s*.145*scale,y+.53*scale,z+.37*scale),.105*scale,carbon)
        muzzle=cylinder(f'Turret_{number:02d}_dark_bore',(x+s*.145*scale,y+1.055*scale,z+.37*scale),.048*scale,.012,carbon,16)
        muzzle.rotation_euler.x=math.pi/2
        box(f'Turret_{number:02d}_red_status',(x+s*.22*scale,y-.14*scale,z+.53*scale),(.035,.10,.015),red,.003)
    box(f'Turret_{number:02d}_targeting_optic',(x,y+.1*scale,z+.55*scale),(.07,.09,.03),red,.007)
    # Place the articulation pivot at the bearing, retaining the authored pose.
    pivot=Vector((x,y,z))
    for child in parent.children:child.location-=pivot
    parent.location=pivot
    parent=None

def command_spire(x,y,z,scale=1):
    for i in range(3):
        width=(.83-i*.17)*scale
        points=[(x-width,y-.50*scale),(x+width,y-.50*scale),(x+width*.75,y+.45*scale),
                (x+.22*scale,y+.8*scale),(x-.22*scale,y+.8*scale),(x-width*.75,y+.45*scale)]
        plate('Layered command citadel',points,z+i*.22*scale,.24*scale,armor if i%2==0 else edge)
        box('Citadel red observation slot',(x,y+.48*scale,z+(i+.9)*.22*scale),(.5*scale,.03,.04),red,.006)
    beam('Command dorsal antenna',(x,y-.25*scale,z+.6*scale),(x,y-.25*scale,z+1.15*scale),.022,edge)

def detail_armor_surfaces():
    """Cut real inset panel geometry into broad source surfaces, not an image.

    Offset grids, subtle finish variation and occasional narrow service recesses
    break up large flat slabs without changing the silhouette or weapon counts.
    All small panels for one parent are batched into one mesh for GLB efficiency.
    """
    random.seed(813)
    originals=[o for o in rig.children_recursive if o.type=='MESH' and
               any(word in o.name for word in ('hull','keel','blade','armor','chassis','outrigger','citadel','fin','sponson'))]
    def clip(poly,axis,bound,keep_greater):
        result=[]
        for i,current in enumerate(poly):
            prev=poly[i-1]
            inside=(current[axis]>=bound) if keep_greater else (current[axis]<=bound)
            old=(prev[axis]>=bound) if keep_greater else (prev[axis]<=bound)
            if inside!=old:
                t=(bound-prev[axis])/(current[axis]-prev[axis])
                result.append((prev[0]+(current[0]-prev[0])*t,prev[1]+(current[1]-prev[1])*t))
            if inside:result.append(current)
        return result
    for obj in originals:
        object_center=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
        verts=[];faces=[];indices=[]
        for face in obj.data.polygons:
            if face.area<.42:continue
            coords=[obj.data.vertices[i].co for i in face.vertices]
            normal=face.normal.copy()
            if normal.dot(face.center-object_center)<0:normal=-normal
            if normal.z<-.45:continue
            origin=coords[0]
            u=Vector((1,0,0)) if abs(normal.x)<.95 else Vector((0,1,0))
            u=(u-normal*u.dot(normal)).normalized()
            v=normal.cross(u).normalized()
            poly=[(p.dot(u),p.dot(v)) for p in coords]
            normal_distance=origin.dot(normal)
            surface=lambda x,y,h:tuple(u*x+v*y+normal*(normal_distance+h))
            minx,maxx=min(p[0] for p in poly),max(p[0] for p in poly)
            miny,maxy=min(p[1] for p in poly),max(p[1] for p in poly)
            row=0;y=miny-.01
            while y<maxy:
                row_h=.16+random.random()*.17
                x=minx-.13*(row%2)-.01
                while x<maxx:
                    width=.19+random.random()*.27
                    clipped=poly
                    for axis,bound,gt in [(0,x,True),(0,x+width,False),(1,y,True),(1,y+row_h,False)]:
                        clipped=clip(clipped,axis,bound,gt)
                        if len(clipped)<3:break
                    if len(clipped)>=3:
                        area=abs(sum(p[0]*clipped[(i+1)%len(clipped)][1]-p[1]*clipped[(i+1)%len(clipped)][0] for i,p in enumerate(clipped)))*.5
                        if area>.008:
                            cx=sum(p[0] for p in clipped)/len(clipped);cy=sum(p[1] for p in clipped)/len(clipped)
                            p=[(cx+(px-cx)*.97,cy+(py-cy)*.96) for px,py in clipped]
                            count=len(p);offset=len(verts)
                            height=.006+random.random()*.009
                            verts.extend(surface(px,py,.002) for px,py in p)
                            verts.extend(surface(px,py,height) for px,py in p)
                            faces.append(tuple(range(offset+count,offset+count*2)))
                            material_index=random.choices([0,1,2,3],[34,5,1,0])[0]
                            indices.append(material_index)
                            for i in range(count):
                                faces.append((offset+i,offset+(i+1)%count,offset+(i+1)%count+count,offset+i+count));indices.append(material_index)
                    x+=width
                y+=row_h;row+=1
        if faces:
            skin=mesh('Inset plating / '+obj.name,verts,faces,armor,.003)
            for mat in (steel,edge,carbon):skin.data.materials.append(mat)
            for face,index in zip(skin.data.polygons,indices):face.material_index=index
            skin.parent=obj.parent
            skin.matrix_world=obj.matrix_world.copy()

def harrow():
    loft('Harrow continuous dreadnought keel',[(5.2,.08,-.08,.1,.15),(2.7,.7,-.25,.2,.53),(.3,1.12,-.45,.4,.74),(-2.2,1.2,-.38,.3,.62),(-3.3,.7,-.2,.16,.35)],steel)
    for s in (-1,1):
        # Curved aft ribs sweep forward into sharpened horns, with actual gaps.
        start,end=(10,171) if s==1 else (189,350)
        # Side crescents use mirrored explicit samples to keep nose at +Y.
        points=[]
        for i in range(29):
            t=i/28
            points.append((s*(1.05+4.8*math.sin(t*math.pi*.80)), -3.1+6.9*t))
        outer=points
        inner=[(x-s*(.32+.68*math.sin(i/28*math.pi)),y-.12) for i,(x,y) in enumerate(points)]
        inner[-1]=(outer[-1][0]-s*.04,outer[-1][1]-.05)
        plate('Harrow curved shoulder keel',outer+inner[::-1],-.30,.48,steel,.04)
        for i in range(14):
            a,b=2*i,min(2*i+2,28)
            p=[outer[a],outer[b],inner[b],inner[a]]
            cx=sum(v[0] for v in p)/4;cy=sum(v[1] for v in p)/4
            p=[(cx+(x-cx)*.96,cy+(y-cy)*.94) for x,y in p]
            plate('Harrow segmented shoulder plate',p,.19,.20 if i<9 else .13,armor if i%3 else edge,.018)
            if i<12:
                beam('Harrow recessed scarlet conduit',(inner[a][0]+s*.045,inner[a][1],.19),(inner[b][0]+s*.045,inner[b][1],.19),.025,red)
        plate('Harrow forward pressure blade',[(s*.5,1.0),(s*2.2,2.4),(s*2.9,4.6),(s*1.3,3.0)],-.05,.25,armor)
        for i in range(6):
            y=-2.65+i*.63
            x=s*(.52+(.15 if i<3 else 0))
            plate('Harrow tapered dorsal armor',[(x-s*.34,y-.25),(x+s*.34,y-.25),(x+s*.24,y+.30),(x-s*.24,y+.39)],.67 if i<4 else .54,.10,armor)
        for i,(x,y) in enumerate([(2.0,-1.45),(3.58,-.05),(4.25,1.70)]):
            beam('Harrow inner wing support',(s*.8,y*.52,0),(s*x,y,0),.17,carbon)
            plate('Harrow layered wing sponson',[(s*.82,y*.52-.28),(s*x,y-.52),(s*(x+.28),y+.35),(s*1.02,y*.52+.45)],-.13,.23,steel,.035)
            plate('Harrow gun sponson',[(s*(x-.48),y-.52),(s*(x+.47),y-.47),(s*(x+.4),y+.55),(s*(x-.25),y+.65)],.10,.22,steel)
            turret(i+1 if s<0 else i+4,s*x,y,.35,.82)
        vents(s*.60,-1.18,.80,.40,.80)
        engine(s*.66,-3.05,-.1,.9)
        engine(s*1.35,-2.75,-.12,.72)
    reactor(0,.4,.74,.74)
    command_spire(0,-2.0,.76,.58)
    plate('Harrow central spinal lance',[(-.13,.8),(-.08,5.2),(.08,5.2),(.13,.8)],.7,.12,edge)

def bastion():
    loft('Bastion monolithic citadel keel',[(-4.0,1.5,-.36,.22,.55),(-2.7,2.35,-.60,.48,.9),(-.3,2.45,-.53,.42,.7),(1.2,1.8,-.30,.32,.48)],steel)
    for s in (-1,1):
        pts=[(s*.90,-2.9),(s*3.25,-3.25),(s*4.55,-1.75),(s*4.4,2.75),(s*2.75,4.9),(s*.95,4.35)]
        plate('Bastion forked primary hull',pts,-.25,.72,steel,.07)
        # Segmented aligned sloping armor slabs deliberately leave recessed seams.
        for i in range(9):
            y=-2.75+i*.78
            inner=1.04 if i>3 else .90
            outer=4.22 if i<7 else 4.05-(i-7)*.64
            p=[(s*inner,y),(s*outer,y+.12),(s*(outer-.09),y+.70),(s*inner,y+.66)]
            plate('Bastion separated fork armor',p,.49,.20 if i%3 else .28,armor if i%4 else edge,.024)
            for j in range(2):
                box('Bastion flank recessed window',(s*outer,y+.24+j*.25,.08),(.03,.14,.07),red,.006)
        beam('Bastion inner trench reinforcement',(s*.99,-1.8,.48),(s*.99,4.25,.48),.08,carbon)
        beam('Bastion inner energy rail',(s*1.01,-1.75,.56),(s*1.01,4.05,.56),.026,red)
        for i,y in enumerate([-1.7,.38,2.42]):
            turret(i+1 if s<0 else i+4,s*2.95,y,.82,.95)
            vents(s*1.72,y-.1,.79,.74,1.0)
        for i in range(5):
            y=-1.3+i*.78
            flank=4.55-(y+1.75)/4.5*.15
            box('Bastion flank launch bay black recess',(s*(flank+.005),y,.10),(.045,.50,.34),carbon,.015)
            box('Bastion launch bay threshold',(s*(flank+.03),y,-.02),(.04,.48,.035),red,.006)
            for j in (-1,1):
                box('Bastion hangar service rib',(s*(flank+.035),y+j*.19,.16),(.06,.045,.37),edge,.008)
        for x in (1.25,2.05,2.8): engine(s*x,-3.4,.08,.95)
    reactor(0,-.65,.95,1.0)
    command_spire(0,-2.45,1.0,1.0)
    for s in (-1,1):
        plate('Bastion command bridge buttress',[(s*.75,-3.6),(s*1.52,-2.2),(s*1.2,-1.85),(s*.49,-2.5)],.9,.28,armor)
    # Open, mechanically credible center trench rather than a blank square.
    for i in range(7):
        y=.3+i*.47
        beam('Bastion exposed center spine',( -.83,y,-.16),(.83,y,-.16),.06,edge)
        box('Bastion recessed center capacitor',(0,y,-.07),(.55,.22,.15),carbon,.018)

def crown():
    loft('Crown axial leviathan chassis',[(5.9,.12,-.12,.1,.28),(3.9,.60,-.35,.30,.65),(1.4,1.12,-.48,.46,.89),(-1.4,1.18,-.48,.46,.89),(-4.4,.68,-.23,.23,.42),(-5.0,.48,-.14,.15,.30)],steel)
    for s in (-1,1):
        for row,(y,span) in enumerate([(2.55,3.45),(.18,4.7),(-2.20,3.90)]):
            pts=[(s*.68,y-.40),(s*1.4,y+.25),(s*span,y+1.35),(s*(span+.45),y+.84),(s*(span-.20),y-.2),(s*1.15,y-.92)]
            plate('Crown diagonal armored outrigger',pts,-.04,.42,steel,.035)
            # Three staggered armor segments per rib, a long slim negative-space shape.
            for i in range(4):
                t=i/4
                x=.94+(span-.94)*t
                yy=y-.06+t*.84
                width=(span-.94)/4*.9
                p=[(s*x,yy-.32),(s*(x+width),yy-.18),(s*(x+width+.08),yy+.37),(s*(x+.1),yy+.28)]
                plate('Crown overlapping articulated rib armor',p,.40,.13,armor if i%2 else edge,.019)
                beam('Crown exposed rib conduit',(s*x,yy-.32,.35),(s*(x+width),yy-.18,.35),.025,red)
            turret(row+1 if s<0 else row+4,s*(span-.43),y+.43,.60,.82)
            plate('Crown swept blade tip',[(s*(span-.3),y+.5),(s*(span+.52),y+2.0),(s*(span+.62),y+.51),(s*(span+.2),y-.22)],.21,.18,armor)
            beam('Crown lower tendon',(s*.68,y-.7,-.12),(s*(span-.35),y+.05,-.12),.07,carbon)
        for i in range(10):
            y=-3.95+i*.89
            w=.3 if abs(y)>3 else .55
            p=[(s*.13,y-.32),(s*(w+.18),y-.34),(s*(w+.12),y+.32),(s*.13,y+.41)]
            plate('Crown split spinal armor',p,.8 if abs(y)<3 else .55,.12,armor,.02)
        vents(s*.64,-2.1,.92,.42,1.05)
        engine(s*.48,-4.8,-.02,.92)
        engine(s*1.23,-3.1,-.04,.76)
    reactor(0,.55,1.04,.83)
    command_spire(0,-1.14,1.04,.65)
    # Aft vertical sickle; gives hero view genuine depth but won't obscure turrets.
    verts=[(-.10,-3.7,.5),(-.1,-3.9,2.1),(-.1,-2.6,1.6),(-.1,-2.0,.67),
           (.1,-3.7,.5),(.1,-3.9,2.1),(.1,-2.6,1.6),(.1,-2.0,.67)]
    mesh('Crown dorsal sickle command fin',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],armor,.035)
    beam('Crown fin scarlet seam',(0,-3.80,1.85),(0,-2.72,1.44),.028,red)

def all_children(obj):
    return [child for child in obj.children_recursive]

def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=-.65
    scene.world=bpy.data.worlds.new('Cool studio environment')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.14,.17,.21,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
    for name,pos,energy,size,color in [
        ('Key softbox',(-8,6,12),2400,8,(.86,.92,1)),
        ('Pale grazing fill',(7,-2,6),1700,7,(.50,.68,1)),
        ('Warm metal rim',(0,-8,7),2500,5,(1,.48,.32)),
        ('Front reveal',(-2,10,4),1100,5,(.70,.80,1)),
    ]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.size=size;data.color=color
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=pos
        obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Review camera');data.type='ORTHO'
    obj=bpy.data.objects.new('Review camera',data);scene.collection.objects.link(obj);scene.camera=obj
    return scene

def render(scene,kind,view,dimensions=None):
    camera=scene.camera
    width,height=dimensions or ((1440,1080) if view=='hero' else (1280,1280))
    camera.location=(10,15,13) if view=='hero' else (0,0,22)
    camera.rotation_euler=(Vector((0,.3,.3))-camera.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.view_layer.update()
    points=[camera.matrix_world.inverted()@obj.matrix_world@Vector(p)
            for obj in all_children(rig) if obj.type=='MESH' for p in obj.bound_box]
    ex=max(abs(p.x) for p in points);ey=max(abs(p.y) for p in points)
    camera.data.ortho_scale=max(ex*2,ey*2*width/height)*1.16
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.filepath=str(REVIEW/f'{kind}-{view}.png')
    bpy.ops.render.render(write_still=True)

def main():
    """Keep the established build callable, and helpers safe to reuse by new art."""
    global armor, steel, edge, carbon, red, hot, rig
    SOURCE.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
    selected=next((arg.split('=',1)[1].split(',') for arg in sys.argv if arg.startswith('--only=')),list(NAMES))
    if set(selected)-set(NAMES):raise ValueError('Unknown proposal')
    for kind in selected:
        if (SOURCE/f'{kind}.blend').exists() and '--replace' not in sys.argv:
            raise FileExistsError('Existing proposal retained; use --replace only to revise this generated proposal')
        scene=setup_scene()
        armor=material('Weathered graphite armor',(.055,.062,.073),.88,.32)
        steel=material('Dark titanium pressure hull',(.028,.035,.045),.76,.39)
        edge=material('Exposed machined titanium',(.11,.13,.16),.85,.30)
        carbon=material('Recessed ceramic black',(.009,.014,.021),.35,.49)
        red=material('Crimson reactor conduits',(.5,.006,.003),.3,.24,1.8)
        hot=material('White hot reactor apertures',(.8,.045,.012),.2,.24,2.5)
        rig=bpy.data.objects.new('Boss_'+NAMES[kind].replace(' ','_'),None);scene.collection.objects.link(rig)
        {'harrow':harrow,'bastion':bastion,'crown':crown}[kind]()
        bpy.context.view_layer.update()
        detail_armor_surfaces()
        bpy.ops.object.select_all(action='DESELECT')
        meshes=[o for o in all_children(rig) if o.type=='MESH']
        for obj in meshes:
            bpy.context.view_layer.objects.active=obj
            obj.select_set(True)
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            obj.select_set(False)
        for obj in all_children(rig)+[rig]:obj.select_set(True)
        bpy.context.view_layer.objects.active=rig
        bpy.ops.export_scene.gltf(filepath=str(SOURCE/f'{kind}.glb'),export_format='GLB',use_selection=True,export_apply=True)
        (REVIEW/f'{kind}.glb').write_bytes((SOURCE/f'{kind}.glb').read_bytes())
        if '--export-only' not in sys.argv:
            render(scene,kind,'hero')
            render(scene,kind,'top')
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f'{kind}.blend'))
        deps=bpy.context.evaluated_depsgraph_get()
        triangles=sum(sum(len(p.vertices)-2 for p in obj.evaluated_get(deps).data.polygons) for obj in meshes)
        stats={'id':kind,'name':NAMES[kind],'meshObjects':len(meshes),'triangles':triangles,'turretAssemblies':6,
               'materials':6,'glbBytes':(SOURCE/f'{kind}.glb').stat().st_size,'basis':'Actual Blender geometry; +Y bow / +Z up',
               'status':'proposal-awaiting-owner-selection','productionReplaced':False}
        (REVIEW/f'{kind}.json').write_text(json.dumps(stats,indent=2)+'\n')
        print('PROPOSAL_COMPLETE',json.dumps(stats),flush=True)


if __name__ == '__main__':
    main()
