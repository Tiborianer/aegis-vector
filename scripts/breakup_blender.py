"""Shared cut geometry and animated volume materials for fleet destruction."""
import math

import bmesh
import bpy
from mathutils import Vector


def key(obj, attr, value, frame):
    setattr(obj, attr, value)
    obj.keyframe_insert(data_path=attr, frame=frame)


def cut_section(mesh, name, planes, cut):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    if planes:
        # glTF splits vertices at hard normals. Weld seams before closing the cuts.
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000015)
        for point, direction in planes:
            if not bm.faces:
                break
            result = bmesh.ops.bisect_plane(bm, geom=[*bm.verts, *bm.edges, *bm.faces],
                                             plane_co=point, plane_no=direction,
                                             clear_outer=True, dist=.000001)
            edges = [e for e in result['geom_cut'] if isinstance(e, bmesh.types.BMEdge) and e.is_boundary]
            if edges:
                for face in bmesh.ops.holes_fill(bm, edges=edges, sides=0)['faces']:
                    face.material_index = len(mesh.materials)
                    face.smooth = False
    part = None
    if bm.faces:
        part = bpy.data.meshes.new(name)
        for mat in mesh.materials:
            part.materials.append(mat)
        part.materials.append(cut)
        bm.to_mesh(part)
    bm.free()
    return part


# Cold electrical discharges and hot fuel use separate emission spectra.
PALETTES = {
    'fire': ((.055, .005, .001), (.84, .065, .003), (1, .34, .035), (1, .82, .43)),
    'ion': ((.004, .016, .055), (.016, .23, .84), (.14, .74, 1), (.81, .96, 1)),
    'arc': ((.022, .004, .06), (.42, .032, .84), (.91, .24, .81), (1, .86, .93)),
    'field': ((.012, .005, .055), (.16, .049, .88), (.45, .32, 1), (.83, .89, 1)),
}


def volume(name, seed, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    new, link = tree.nodes.new, tree.links.new
    tex = new('ShaderNodeTexCoord')
    dist = new('ShaderNodeVectorMath')
    dist.operation = 'DISTANCE'
    link(tex.outputs['Generated'], dist.inputs[0])
    dist.inputs[1].default_value = (.5, .5, .5)
    noise = new('ShaderNodeTexNoise')
    noise.noise_dimensions = '4D'
    noise.inputs['W'].default_value = seed
    noise.inputs['Scale'].default_value = 3.9
    noise.inputs['Detail'].default_value = 3.8
    noise.inputs['Roughness'].default_value = .64
    noise.inputs['Distortion'].default_value = .32
    link(tex.outputs['Generated'], noise.inputs['Vector'])

    def math_node(op, a, b):
        node = new('ShaderNodeMath')
        node.operation = op
        for socket, value in zip(node.inputs, (a, b)):
            if isinstance(value, (int, float)):
                socket.default_value = value
            else:
                link(value, socket)
        return node.outputs[0]

    # A turbulent boundary and branching hot pockets survive the final downsample.
    density = math_node('SUBTRACT', math_node('ADD', math_node('MULTIPLY', noise.outputs['Fac'], .63), .13), dist.outputs['Value'])
    density = math_node('MAXIMUM', density, 0)
    ramp = new('ShaderNodeValToRGB')
    stops = [(0, (.006, .003, .002)), *zip((.08, .16, .28, .43), PALETTES[color])]
    ramp.color_ramp.elements.remove(ramp.color_ramp.elements[-1])
    for i, (at, color) in enumerate(stops):
        stop = ramp.color_ramp.elements[0] if i == 0 else ramp.color_ramp.elements.new(at)
        stop.color = (*color, 1)
    link(density, ramp.inputs[0])
    shader = new('ShaderNodeVolumePrincipled')
    shader.inputs['Color'].default_value = (.038, .032, .029, 1)
    thickness = new('ShaderNodeValue')
    heat = new('ShaderNodeValue')
    link(math_node('MULTIPLY', density, thickness.outputs[0]), shader.inputs['Density'])
    link(math_node('MULTIPLY', math_node('MULTIPLY', density, density), heat.outputs[0]), shader.inputs['Emission Strength'])
    link(ramp.outputs[0], shader.inputs['Emission Color'])
    link(shader.outputs[0], new('ShaderNodeOutputMaterial').inputs['Volume'])
    return mat, heat.outputs[0], thickness.outputs[0], noise.inputs['W']


def add_burst(rng, name, at, start, life, radius, direction, anchor, color='fire'):
    mat, heat, thickness, swirl = volume(name, rng.uniform(0, 9), color)
    start_w = swirl.default_value
    for t, power, opacity in [(0, 36, 9), (.12, 560, 18), (.29, 330, 17), (.55, 81, 12), (.78, 7, 5), (1, 0, 0)]:
        for socket, value in ((heat, power), (thickness, opacity), (swirl, start_w + t * .44)):
            key(socket, 'default_value', value, start + life * t)
    for i in range(3):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2)
        cloud = bpy.context.object
        cloud.name = name + ' | lobe ' + str(i + 1)
        cloud.parent = anchor
        cloud.data.materials.append(mat)
        roll = rng.random() * math.tau
        scale = Vector((1.13, .76, .80)) * radius * (1 if i == 0 else rng.uniform(.48, .73))
        offset = Vector((math.cos(roll), math.sin(roll), .27)) * (0 if i == 0 else radius * .94)
        cloud.rotation_euler = (rng.random(), rng.random(), roll)
        key(cloud, 'scale', (.0001,) * 3, start - 1)
        key(cloud, 'scale', scale * .10, start)
        key(cloud, 'scale', scale * .81, start + life * .22)
        key(cloud, 'scale', scale * 1.38, start + life)
        key(cloud, 'location', at + offset * .16, start)
        key(cloud, 'location', at + direction + offset, start + life)
        key(cloud, 'hide_render', True, start - 1)
        key(cloud, 'hide_render', False, start)
        key(cloud, 'hide_render', True, start + life + 1)
    lamp = bpy.data.objects.new(name + ' | reflected light', bpy.data.lights.new(name, 'POINT'))
    bpy.context.scene.collection.objects.link(lamp)
    lamp.parent = anchor
    lamp.location = at + Vector((0, 0, .55))
    lamp.data.color = (1, .26, .05) if color == 'fire' else PALETTES[color][2]
    lamp.data.shadow_soft_size = radius * .52
    for t, value in [(0, 0), (.10, 190 * radius), (.27, 98 * radius), (.75, 5), (1, 0)]:
        key(lamp.data, 'energy', value, start - 1 + life * t)
