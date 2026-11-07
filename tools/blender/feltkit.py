"""Copied from server/stories/blender/feltkit.py on branch feature/style-sheet (commit cb48ff6, the style sheet the owner
signed off), unchanged below this note, so other tools (tools/blender/pixel_racers.py, the Sum Racer pixel art) share one
palette, one cel shade and one pixel post with the Story Builder. When that branch merges, keep one copy (this one or
server/stories/blender/) and import it from the other place.

Felt-and-paper kit for the Story Builder (docs/story-builder.md).

Everything here is procedural: no image textures, no downloaded assets. Materials are node trees (felt = sheen +
fibre bump + colour mottling; paper = soft tooth bump + a cut edge), set pieces are flat cut-outs stacked in layers
(clouds, hills, waves) or simple solids (lighthouse, houses, trees), and the characters are built from spheres,
cones and discs with felt on them.

Every builder returns the root object and registers per-frame animation with `anim(fn)`: fn(t, f) is called with
the time in seconds and the frame number and sets transforms directly. render_story.py bakes these into keyframes.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

# ---------------------------------------------------------------- animation registry
ANIMS = []


def anim(fn):
    ANIMS.append(fn)
    return fn


def reset():
    ANIMS.clear()
    _MATS.clear()


# ---------------------------------------------------------------- style switch (styles.py: felt | cartoon | pixel)
STYLE = 'felt'
_restyle = None  # styles.material while the style isn't felt


def set_style(name='felt'):
    """Pick the look before building a scene. felt (the default) is this file's own materials, unchanged."""
    global STYLE, _restyle
    import styles
    STYLE = styles.use(name)
    styles._MATS.clear()
    _restyle = None if STYLE == 'felt' else styles.material
    return STYLE


def hexcol(h, a=1.0):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    # sRGB -> linear, so colours match the hex values people pick
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), a)


# ---------------------------------------------------------------- materials
_MATS = {}


def _nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return nt, nt.nodes, nt.links


def felt(color, name=None, sheen=0.9, fuzz=1.0, emit=0.0, emit_color=None, scale=1.0):
    """Wool felt: matte, a soft sheen at grazing angles, mottled colour and a fine fibre bump."""
    if _restyle:
        return _restyle('felt', color, emit=emit, emit_color=emit_color)
    key = ('felt', color, sheen, fuzz, emit, emit_color, scale)
    if key in _MATS:
        return _MATS[key]
    mat = bpy.data.materials.new(name or f'felt_{color}')
    nt, N, L = _nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    bsdf = N.new('ShaderNodeBsdfPrincipled')
    tc = N.new('ShaderNodeTexCoord')
    mapping = N.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (scale, scale, scale)
    L.new(tc.outputs['Object'], mapping.inputs['Vector'])
    # colour mottling: big soft noise
    mott = N.new('ShaderNodeTexNoise')
    mott.inputs['Scale'].default_value = 3.0
    mott.inputs['Detail'].default_value = 4.0
    L.new(mapping.outputs['Vector'], mott.inputs['Vector'])
    base = hexcol(color)
    dark = tuple(c * 0.78 for c in base[:3]) + (1,)
    light = tuple(min(1, c * 1.12 + 0.01) for c in base[:3]) + (1,)
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = dark
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = light
    L.new(mott.outputs['Fac'], ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.95
    bsdf.inputs['Sheen Weight'].default_value = sheen
    bsdf.inputs['Sheen Roughness'].default_value = 0.35
    bsdf.inputs['Sheen Tint'].default_value = (1, 1, 1, 1)
    bsdf.inputs['Specular IOR Level'].default_value = 0.2
    # fibres: fine stretched noise plus voronoi speckle into a bump
    fib = N.new('ShaderNodeTexNoise')
    fib.inputs['Scale'].default_value = 90.0
    fib.inputs['Detail'].default_value = 10.0
    fib.inputs['Roughness'].default_value = 0.75
    L.new(mapping.outputs['Vector'], fib.inputs['Vector'])
    vor = N.new('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = 140.0
    L.new(mapping.outputs['Vector'], vor.inputs['Vector'])
    mix = N.new('ShaderNodeMath')
    mix.operation = 'ADD'
    L.new(fib.outputs['Fac'], mix.inputs[0])
    L.new(vor.outputs['Distance'], mix.inputs[1])
    bump = N.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35 * fuzz
    bump.inputs['Distance'].default_value = 0.02
    L.new(mix.outputs['Value'], bump.inputs['Height'])
    L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    if emit:
        bsdf.inputs['Emission Color'].default_value = hexcol(emit_color or color)
        bsdf.inputs['Emission Strength'].default_value = emit
    L.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    _MATS[key] = mat
    return mat


def paper(color, name=None, emit=0.0, tooth=1.0):
    """Card / paper: flat colour, a soft tooth bump, faint fibres."""
    if _restyle:
        return _restyle('paper', color, emit=emit)
    key = ('paper', color, emit, tooth)
    if key in _MATS:
        return _MATS[key]
    mat = bpy.data.materials.new(name or f'paper_{color}')
    nt, N, L = _nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    bsdf = N.new('ShaderNodeBsdfPrincipled')
    tc = N.new('ShaderNodeTexCoord')
    noise = N.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 18.0
    noise.inputs['Detail'].default_value = 12.0
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    base = hexcol(color)
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = tuple(c * 0.9 for c in base[:3]) + (1,)
    ramp.color_ramp.elements[1].color = tuple(min(1, c * 1.06) for c in base[:3]) + (1,)
    L.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    bsdf.inputs['Sheen Weight'].default_value = 0.25
    bsdf.inputs['Specular IOR Level'].default_value = 0.25
    bump = N.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.12 * tooth
    L.new(noise.outputs['Fac'], bump.inputs['Height'])
    L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    if emit:
        bsdf.inputs['Emission Color'].default_value = base
        bsdf.inputs['Emission Strength'].default_value = emit
    L.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    _MATS[key] = mat
    return mat


def glossy(color, rough=0.15):
    if _restyle:
        return _restyle('glossy', color)
    key = ('glossy', color, rough)
    if key in _MATS:
        return _MATS[key]
    mat = bpy.data.materials.new(f'bead_{color}')
    nt, N, L = _nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    bsdf = N.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = hexcol(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Coat Weight'].default_value = 0.6
    L.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    _MATS[key] = mat
    return mat


def glow(color, strength=4.0, name=None):
    if _restyle:
        return _restyle('glow', color, strength=strength)
    key = ('glow', color, strength)
    if key in _MATS:
        return _MATS[key]
    mat = bpy.data.materials.new(name or f'glow_{color}')
    nt, N, L = _nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    em = N.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hexcol(color)
    em.inputs['Strength'].default_value = strength
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    _MATS[key] = mat
    return mat


def _blended(mat):
    for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
        try:
            setattr(mat, attr, val)
        except Exception:
            pass
    try:
        mat.use_transparent_shadow = True
    except Exception:
        pass


def haze(color, strength=1.0, axis='radial', power=2.0, name='haze'):
    """Additive soft light (moon halo, lighthouse beam): emission whose strength fades out (radially from the
    object's origin, or along -Z for a beam), added on top of a fully transparent surface. Casts no shadow."""
    if _restyle:
        return _restyle('haze', color, strength=strength, axis=axis, power=power, name=name)
    mat = bpy.data.materials.new(name)
    nt, N, L = _nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Generated'], sep.inputs['Vector'])
    fade = N.new('ShaderNodeMath')
    if axis == 'radial':
        grad = N.new('ShaderNodeTexGradient')
        grad.gradient_type = 'SPHERICAL'
        L.new(tc.outputs['Object'], grad.inputs['Vector'])
        fade.operation = 'POWER'
        L.new(grad.outputs['Fac'], fade.inputs[0])
        fade.inputs[1].default_value = power
    else:
        # beam: generated Z runs 0 (wide end) .. 1 (tip at the lamp): bright near the lamp, fading away
        fade.operation = 'POWER'
        L.new(sep.outputs['Z'], fade.inputs[0])
        fade.inputs[1].default_value = power
    if axis != 'radial':
        # soft edges: fade where the cone's surface turns away from the camera
        lw = N.new('ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.5
        edge = N.new('ShaderNodeMath')
        edge.operation = 'SUBTRACT'
        edge.inputs[0].default_value = 1.0
        L.new(lw.outputs['Facing'], edge.inputs[1])
        edge2 = N.new('ShaderNodeMath')
        edge2.operation = 'POWER'
        L.new(edge.outputs['Value'], edge2.inputs[0])
        edge2.inputs[1].default_value = 1.5
        both = N.new('ShaderNodeMath')
        both.operation = 'MULTIPLY'
        L.new(fade.outputs['Value'], both.inputs[0])
        L.new(edge2.outputs['Value'], both.inputs[1])
        fade = both
    scale = N.new('ShaderNodeMath')
    scale.operation = 'MULTIPLY'
    L.new(fade.outputs['Value'], scale.inputs[0])
    scale.inputs[1].default_value = strength
    em = N.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hexcol(color)
    L.new(scale.outputs['Value'], em.inputs['Strength'])
    tr = N.new('ShaderNodeBsdfTransparent')
    add = N.new('ShaderNodeAddShader')
    L.new(tr.outputs['BSDF'], add.inputs[0])
    L.new(em.outputs['Emission'], add.inputs[1])
    L.new(add.outputs['Shader'], out.inputs['Surface'])
    _blended(mat)
    return mat


def sky_material(top, bottom, star_density=0.0):
    """The painted backdrop: a vertical gradient on paper, with a mottled paper tooth."""
    if _restyle:
        return _restyle('sky', None, top=top, bottom=bottom)
    mat = bpy.data.materials.new('sky')
    nt, N, L = _nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Generated'], sep.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = hexcol(bottom)
    ramp.color_ramp.elements[0].position = 0.18
    ramp.color_ramp.elements[1].color = hexcol(top)
    ramp.color_ramp.elements[1].position = 0.85
    L.new(sep.outputs['Z'], ramp.inputs['Fac'])
    noise = N.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 6.0
    noise.inputs['Detail'].default_value = 8.0
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    mixc = N.new('ShaderNodeMix')
    mixc.data_type = 'RGBA'
    mixc.blend_type = 'MULTIPLY'
    mixc.inputs['Factor'].default_value = 0.18
    L.new(ramp.outputs['Color'], mixc.inputs[6])
    L.new(noise.outputs['Color'], mixc.inputs[7])
    em = N.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    L.new(mixc.outputs[2], em.inputs['Color'])
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat


# ---------------------------------------------------------------- mesh helpers
def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, verts, faces, mat=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def outline_obj(name, pts, depth, mat, bevel=0.0, y=0.0):
    """A flat cut-out in the XZ plane (pts: [(x, z)]), given thickness along Y. bevel softens the edge (felt)."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, 0, z)) for x, z in pts]
    face = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, depth, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    ob.location.y = y
    ob.data.materials.append(mat)
    if bevel:
        m = ob.modifiers.new('bevel', 'BEVEL')
        m.width = bevel
        m.segments = 2
        m.limit_method = 'ANGLE'
    return ob


def prim(kind, name, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), mat=None, parent=None, segs=24, smooth_it=True, **kw):
    ops = bpy.ops.mesh
    if kind == 'sphere':
        ops.primitive_uv_sphere_add(segments=segs, ring_count=max(8, segs // 2), radius=1)
    elif kind == 'cyl':
        ops.primitive_cylinder_add(vertices=segs, radius=1, depth=2)
    elif kind == 'cone':
        ops.primitive_cone_add(vertices=segs, radius1=kw.get('r1', 1), radius2=kw.get('r2', 0), depth=2)
    elif kind == 'cube':
        ops.primitive_cube_add(size=2)
    elif kind == 'torus':
        ops.primitive_torus_add(major_radius=1, minor_radius=kw.get('minor', 0.25), major_segments=segs, minor_segments=12)
    ob = bpy.context.active_object
    ob.name = name
    ob.location = loc
    ob.scale = scale
    ob.rotation_euler = rot
    if mat:
        ob.data.materials.append(mat)
    if smooth_it and kind in ('sphere', 'torus', 'cone', 'cyl'):
        smooth(ob)
        if kind in ('cone', 'cyl'):
            # keep the caps flat-looking: auto smooth by angle where available
            try:
                bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
            except Exception:
                pass
    if parent:
        ob.parent = parent
    return ob


def empty(name, loc=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    link(ob)
    ob.location = loc
    if parent:
        ob.parent = parent
    return ob


# ---------------------------------------------------------------- shapes
def star_pts(r_out=1.0, r_in=0.45, n=5, rot=math.pi / 2):
    pts = []
    for i in range(n * 2):
        r = r_out if i % 2 == 0 else r_in
        a = rot + i * math.pi / n
        pts.append((math.cos(a) * r, math.sin(a) * r))
    return pts


def cloud_pts(width, height, bumps, rng):
    """A cut-paper cloud: flat bottom, a row of round bumps on top (largest in the middle)."""
    pts = [(-width / 2, 0)]
    edges = [-width / 2 + width * (i + (rng.uniform(-0.18, 0.18) if 0 < i < bumps else 0)) / bumps for i in range(bumps + 1)]
    for i in range(bumps):
        a, b = edges[i], edges[i + 1]
        cx = (a + b) / 2
        r = (b - a) / 2
        mid = 1 - abs(cx) / (width / 2)
        h = height * (0.45 + 0.55 * mid) * rng.uniform(0.85, 1.1)
        base = height * 0.25 * (1 - mid)
        for k in range(1, 12):
            t = math.pi - k * math.pi / 12
            pts.append((cx + math.cos(t) * r, base + math.sin(t) * h * 0.9 + h * 0.1))
    pts.append((width / 2, 0))
    return pts


def hill_pts(width, height, phase, waves=1.5, bottom=-3.0, steps=60):
    pts = [(-width / 2, bottom)]
    for i in range(steps + 1):
        x = -width / 2 + width * i / steps
        z = height * (0.55 + 0.45 * math.sin(phase + waves * math.pi * i / steps)) * (0.85 + 0.15 * math.sin(phase * 3 + i / steps * 9))
        pts.append((x, z))
    pts.append((width / 2, bottom))
    return pts


def wave_pts(width, amp, length, phase, bottom=-1.5, steps=120):
    pts = [(-width / 2, bottom)]
    for i in range(steps + 1):
        x = -width / 2 + width * i / steps
        pts.append((x, amp * math.sin(phase + x * 2 * math.pi / length)))
    pts.append((width / 2, bottom))
    return pts


# ---------------------------------------------------------------- set pieces
def backdrop(top, bottom, y=24, w=90, h=42):
    ob = mesh_obj('sky', [(-w / 2, 0, -6), (w / 2, 0, -6), (w / 2, 0, h - 6), (-w / 2, 0, h - 6)], [(0, 1, 2, 3)], sky_material(top, bottom))
    ob.location.y = y
    return ob


def star_field(rng, count=260, y=23.5, w=80, zmin=3, zmax=34, color='#fff6d8', strength=3.0):
    """Little painted dots of light on the backdrop (one mesh, many tiny discs)."""
    verts, faces = [], []
    for _ in range(count):
        x = rng.uniform(-w / 2, w / 2)
        z = rng.uniform(zmin, zmax)
        r = rng.choice([0.03, 0.04, 0.05, 0.06, 0.09])
        base = len(verts)
        n = 6
        verts.append((x, 0, z))
        for k in range(n):
            a = k * 2 * math.pi / n
            verts.append((x + math.cos(a) * r, 0, z + math.sin(a) * r))
        for k in range(n):
            faces.append((base, base + 1 + k, base + 1 + (k + 1) % n))
    ob = mesh_obj('starfield', verts, faces, glow(color, strength))
    ob.location.y = y
    return ob


def cloud(name, x, z, y, width, height, rng, colors=('#e9eefc', '#c9d6f5', '#a9bbe8'), drift=0.0, glow_k=0.35):
    """Layered cardboard cloud: a pale front layer and darker, slightly bigger layers stacked behind it."""
    root = empty(name, (x, y, z))
    pts = cloud_pts(width, height, rng.randint(4, 6), rng)
    for i, col in enumerate(colors):
        s = 1 + i * 0.06
        lay = outline_obj(f'{name}_{i}', [(px * s, pz * s + i * 0.12) for px, pz in pts], 0.08, paper(col, emit=glow_k * (1 - i * 0.3)), bevel=0.02)
        lay.location = (rng.uniform(-0.15, 0.15) * i, 0.12 * i, -0.05 * i)
        lay.parent = root
    if drift:
        x0 = x
        anim(lambda t, f, r=root: setattr(r.location, 'x', x0 + drift * t))
    return root


def moon(x, z, y, r=1.8, halo=True):
    root = empty('moon', (x, y, z))
    disc = prim('cyl', 'moon_disc', (0, 0, 0), (r, r, 0.12), (math.pi / 2, 0, 0), felt('#fff1c2', emit=1.6, emit_color='#ffe7a3', sheen=0.4), root, segs=64)
    # a few felt craters
    for cx, cz, cr in ((-0.5, 0.4, 0.32), (0.45, -0.35, 0.22), (0.2, 0.75, 0.16)):
        prim('cyl', 'crater', (cx * r, -0.13, cz * r), (cr * r, cr * r, 0.03), (math.pi / 2, 0, 0), felt('#f1dc9e', emit=1.0, emit_color='#f1d995'), root, segs=24)
    if halo:
        h = prim('sphere', 'moon_halo', (0, 0.4, 0), (r * 3.2, 0.05, r * 3.2), mat=haze('#ffe9b0', 0.9, power=2.2, name='moon_haze'), parent=root, segs=48)
        h.visible_shadow = False
    lamp = bpy.data.lights.new('moonglow', 'POINT')
    lamp.energy = 900
    lamp.color = (1.0, 0.92, 0.75)
    lamp.shadow_soft_size = 2.5
    lo = bpy.data.objects.new('moonglow', lamp)
    link(lo)
    lo.parent = root
    lo.location = (0, -2.5, 0)
    return root


def hanging_star(name, x, z, y, size, string_top, rng, color='#ffd75e', sway=1.0):
    """A felt star on a thread, hanging from above the frame, swaying and turning a little."""
    pivot = empty(name, (x, y, string_top))
    length = string_top - z
    thread = prim('cyl', f'{name}_thread', (0, 0, -length / 2), (0.02, 0.02, length / 2), mat=paper('#f5ead0', emit=1.4), parent=pivot, segs=6, smooth_it=False)
    star = outline_obj(f'{name}_star', star_pts(size, size * 0.48), 0.12 * size, felt(color, emit=0.9, emit_color='#ffcf4d', sheen=0.6), bevel=0.05 * size)
    star.parent = pivot
    star.location = (0, -0.06 * size, -length - 0.0)
    ph = rng.uniform(0, 6.28)
    sp = rng.uniform(0.5, 0.8)
    amp = math.radians(rng.uniform(1.5, 3.0)) * sway

    def go(t, f, p=pivot, s=star):
        p.rotation_euler.y = math.sin(t * sp + ph) * amp
        p.rotation_euler.x = math.sin(t * sp * 0.7 + ph * 1.3) * amp * 0.5
        s.rotation_euler.z = math.sin(t * 0.6 + ph) * 0.35
    anim(go)
    return pivot


def hills(y, z, width, height, colors, phase, name='hills', felt_it=True, waves=1.5, lift=0.22):
    root = empty(name, (0, y, z))
    for i, col in enumerate(colors):
        # distant layers glow faintly in their own colour, so they read as soft scenery rather than black cut-outs
        mat = felt(col, fuzz=0.7, emit=lift, emit_color=col) if felt_it else paper(col, emit=lift)
        h = outline_obj(f'{name}_{i}', hill_pts(width, height * (1 - i * 0.18), phase + i * 1.7, waves), 0.25, mat, bevel=0.06)
        h.parent = root
        h.location = (0, -i * 0.9, -i * 0.35)
    return root


def sea(y0, z, width, rows=4, colors=('#2b4fa8', '#3a63c4', '#2a4a9a', '#4c78d6', '#1f3d88'), amp=0.18, bob=1.0):
    root = empty('sea', (0, y0, z))
    for i in range(rows):
        col = colors[i % len(colors)]
        strip = outline_obj(f'wave_{i}', wave_pts(width, amp * (1 + i * 0.2), 3.2 + i * 0.6, i * 1.3, bottom=-2.5), 0.2, felt(col, fuzz=0.6, sheen=0.7), bevel=0.05)
        strip.parent = root
        strip.location = (0, -i * 1.6, -i * 0.22)
        ph = i * 1.1
        x0 = strip.location.x
        z0 = strip.location.z

        def go(t, f, s=strip, ph=ph, x0=x0, z0=z0):
            s.location.x = x0 + math.sin(t * 0.6 + ph) * 0.35 * bob
            s.location.z = z0 + math.sin(t * 1.1 + ph) * 0.05 * bob
        anim(go)
    return root


def lighthouse(x, y, z=0.0, h=5.2, beam=True, beam_speed=0.35):
    """Striped felt lighthouse: tapered tower, red bands, a gallery, a warm lamp room and a red cap."""
    root = empty('lighthouse', (x, y, z))
    r0, r1 = 0.95, 0.62
    bands = 6
    for i in range(bands):
        z0 = h * i / bands
        z1 = h * (i + 1) / bands
        ra = r0 + (r1 - r0) * i / bands
        rb = r0 + (r1 - r0) * (i + 1) / bands
        col = '#d9453b' if i % 2 == 0 else '#f6efe2'
        seg = prim('cone', f'lh_band{i}', (0, 0, (z0 + z1) / 2), (1, 1, (z1 - z0) / 2), mat=felt(col, fuzz=0.9), parent=root, segs=40, r1=ra, r2=rb)
    # little window and door
    prim('cube', 'lh_door', (0, -r0 + 0.02, 0.45), (0.22, 0.06, 0.4), mat=felt('#5a3a2b'), parent=root)
    prim('sphere', 'lh_window', (0, -(r0 + r1) / 2 + 0.02, h * 0.55), (0.14, 0.05, 0.2), mat=glow('#ffc76b', 3.0), parent=root, segs=16)
    # gallery
    prim('cyl', 'lh_gallery', (0, 0, h + 0.06), (r1 + 0.32, r1 + 0.32, 0.08), mat=felt('#3b3f58'), parent=root, segs=40)
    prim('torus', 'lh_rail', (0, 0, h + 0.38), (r1 + 0.3, r1 + 0.3, 0.6), mat=felt('#f6efe2'), parent=root, segs=40, minor=0.05)
    # lamp room
    prim('cyl', 'lh_lamproom', (0, 0, h + 0.65), (r1 * 0.78, r1 * 0.78, 0.55), mat=glow('#ffd27a', 5.0, 'lamp'), parent=root, segs=32)
    # mullions
    for k in range(6):
        a = k * math.pi / 3
        prim('cyl', f'lh_mull{k}', (math.cos(a) * r1 * 0.8, math.sin(a) * r1 * 0.8, h + 0.65), (0.035, 0.035, 0.56), mat=felt('#3b3f58'), parent=root, segs=6)
    prim('cone', 'lh_roof', (0, 0, h + 1.55), (1, 1, 0.38), mat=felt('#c93a32'), parent=root, segs=40, r1=r1 * 1.05, r2=0.04)
    prim('sphere', 'lh_knob', (0, 0, h + 1.98), (0.1, 0.1, 0.1), mat=felt('#c93a32'), parent=root, segs=12)
    lamp = bpy.data.lights.new('lh_lamp', 'POINT')
    lamp.energy = 650
    lamp.color = (1.0, 0.78, 0.45)
    lamp.shadow_soft_size = 0.4
    lo = bpy.data.objects.new('lh_lamp', lamp)
    link(lo)
    lo.parent = root
    lo.location = (0, -0.9, h + 0.65)
    if beam:
        bp = empty('lh_beam_pivot', (0, 0, h + 0.65), root)
        length = 16
        b = prim('cone', 'lh_beam', (0, 0, 0), (1, 1, length / 2), mat=haze('#ffa726', 1.5, axis='beam', power=2.4, name='beam'), parent=bp, segs=48, r1=2.3, r2=0.28)
        # cone axis is Z; tip (radius2) on top. Put the tip at the lamp, pointing the wide end out along -X.
        b.rotation_euler = (0, math.pi / 2, 0)
        b.location = (-length / 2, 0, 0)
        b.visible_shadow = False

        def go(t, f, p=bp):
            # a slow sweep across the sea, not a full spin (a full turn points into the camera)
            p.rotation_euler.z = math.radians(-20) + math.sin(t * beam_speed) * math.radians(16)
            p.rotation_euler.y = math.radians(-4)
        anim(go)
    return root


def rocks(x, y, z, w, rng, color='#6b6f8a'):
    root = empty('rocks', (x, y, z))
    for i in range(5):
        s = rng.uniform(0.5, 1.0) * w / 3
        prim('sphere', f'rock{i}', (rng.uniform(-w / 2, w / 2), rng.uniform(-0.4, 0.4), 0), (s, s * 0.8, s * 0.55), mat=felt(rng.choice([color, '#585c78', '#7b7f99'])), parent=root, segs=16)
    return root


def house(name, x, y, z, w=1.4, h=1.2, wall='#f3d9b1', roof='#b9473f', lit=True):
    root = empty(name, (x, y, z))
    prim('cube', f'{name}_wall', (0, 0, h / 2), (w / 2, 0.55, h / 2), mat=felt(wall), parent=root)
    pts = [(-w / 2 - 0.15, h), (w / 2 + 0.15, h), (0, h + w * 0.55)]
    r = outline_obj(f'{name}_roof', pts, 1.3, felt(roof), bevel=0.04)
    r.parent = root
    r.location = (0, -0.65, 0)
    win = glow('#ffcf70', 3.5) if lit else felt('#2c3550')
    prim('cube', f'{name}_win', (-w * 0.22, -0.56, h * 0.6), (0.16, 0.02, 0.16), mat=win, parent=root)
    prim('cube', f'{name}_door', (w * 0.2, -0.56, h * 0.28), (0.16, 0.02, 0.28), mat=felt('#6b4532'), parent=root)
    prim('cube', f'{name}_chim', (w * 0.25, 0, h + w * 0.35), (0.1, 0.1, 0.25), mat=felt('#7a5a4c'), parent=root)
    return root


def tree(name, x, y, z, h=2.0, kind='pine', color='#3f7f5a', rng=None):
    root = empty(name, (x, y, z))
    prim('cyl', f'{name}_trunk', (0, 0, h * 0.18), (0.09 * h / 2, 0.09 * h / 2, h * 0.18), mat=felt('#7a5236'), parent=root, segs=10)
    if kind == 'pine':
        for i in range(3):
            prim('cone', f'{name}_l{i}', (0, 0, h * (0.45 + i * 0.2)), (1, 1, h * 0.2), mat=felt(color), parent=root, segs=20, r1=h * (0.32 - i * 0.07), r2=0.02)
    else:
        prim('sphere', f'{name}_crown', (0, 0, h * 0.62), (h * 0.3, h * 0.3, h * 0.32), mat=felt(color), parent=root, segs=20)
    ph = (rng.uniform(0, 6) if rng else 0)
    anim(lambda t, f, r=root, ph=ph: setattr(r.rotation_euler, 'y', math.sin(t * 0.7 + ph) * 0.025))
    return root


def boat(x, y, z, color='#e2a24a'):
    root = empty('boat', (x, y, z))
    pts = [(-0.9, 0.0), (0.9, 0.0), (1.2, 0.45), (-1.2, 0.45)]
    hull = outline_obj('boat_hull', pts, 0.6, felt(color), bevel=0.05)
    hull.parent = root
    hull.location = (0, -0.3, -0.2)
    prim('cyl', 'boat_mast', (0, 0, 0.9), (0.03, 0.03, 0.75), mat=felt('#6b4532'), parent=root, segs=8)
    sail = outline_obj('boat_sail', [(0.05, 0.4), (0.05, 1.6), (0.8, 0.45)], 0.04, paper('#fbf3e3'), bevel=0.01)
    sail.parent = root
    x0, z0 = x, z
    anim(lambda t, f, r=root: (setattr(r.location, 'z', z0 + math.sin(t * 1.2) * 0.06), setattr(r.rotation_euler, 'y', math.sin(t * 0.9) * 0.05)))
    return root


def lantern(x, y, z):
    root = empty('lantern', (x, y, z))
    prim('cyl', 'lan_body', (0, 0, 0.18), (0.13, 0.13, 0.16), mat=glow('#ffc25e', 4.0), parent=root, segs=16)
    prim('cone', 'lan_top', (0, 0, 0.42), (1, 1, 0.08), mat=felt('#3b3f58'), parent=root, segs=16, r1=0.18, r2=0.03)
    l = bpy.data.lights.new('lan', 'POINT')
    l.energy = 60
    l.color = (1, 0.75, 0.4)
    l.shadow_soft_size = 0.2
    lo = bpy.data.objects.new('lan', l)
    link(lo)
    lo.parent = root
    lo.location = (0, -0.3, 0.2)
    return root


def ground(y, z, width, depth, color, rng=None, tufts=('#3d6b5a', '#4f7d63'), pebbles=('#6b6f8a', '#7b7f99')):
    pts = hill_pts(width, 0.35, 0.4, waves=3, bottom=-2)
    g = outline_obj('ground', pts, depth, felt(color, fuzz=0.8, sheen=0.15), bevel=0.08)
    g.location = (0, y, z - 0.35)
    if rng is not None:
        # a few felt tufts and pebbles so the floor reads as a little world, not a table top
        for i in range(34):
            x, yy = rng.uniform(-7.5, 7.5), rng.uniform(-3.0, y + depth - 1.0)
            if abs(x) < 2.6 and yy < 1.5:
                continue
            if rng.random() < 0.6 and tufts:
                col = rng.choice(tufts)
                for k in range(3):
                    prim('cone', f'tuft{i}_{k}', (x + (k - 1) * 0.07, yy, 0.12), (1, 1, 0.14 + 0.05 * (k % 2)), (0, (k - 1) * 0.35, 0), mat=felt(col), segs=8, r1=0.05, r2=0.0)
            elif pebbles:
                r = rng.uniform(0.08, 0.2)
                prim('sphere', f'pebble{i}', (x, yy, 0.0), (r, r * 0.9, r * 0.5), mat=felt(rng.choice(pebbles), sheen=0.3), segs=12)
    return g


# ---------------------------------------------------------------- characters
def _eyes(parent, x, y, z, r, gap, blink_seed=0.0):
    eyes = []
    for sx in (-1, 1):
        e = prim('sphere', 'eye', (x + sx * gap, y, z), (r, r * 0.7, r * 1.1), mat=glossy('#15131c'), parent=parent, segs=16)
        prim('sphere', 'glint', (x + sx * gap + r * 0.35, y - r * 0.6, z + r * 0.4), (r * 0.28, r * 0.2, r * 0.28), mat=glow('#ffffff', 2.0), parent=parent, segs=8)
        eyes.append(e)

    def blink(t, f, eyes=eyes, sz=r * 1.1):
        cyc = (t + blink_seed) % 3.7
        k = 0.12 if cyc < 0.12 else 1.0
        for e in eyes:
            e.scale.z = sz * k
    anim(blink)
    return eyes


def _cheeks(parent, x, y, z, gap, r=0.07):
    for sx in (-1, 1):
        prim('sphere', 'cheek', (x + sx * gap, y, z), (r, r * 0.4, r * 0.75), mat=felt('#f29aa6', sheen=0.5), parent=parent, segs=12)


def mouse(name, color='#b7b2c4'):
    root = empty(name)
    body = empty(f'{name}_body', (0, 0, 0), root)
    fur = felt(color)
    pink = felt('#f4a7b5')
    prim('sphere', 'm_body', (0, 0, 0.42), (0.36, 0.32, 0.42), mat=fur, parent=body)
    prim('sphere', 'm_belly', (0, -0.2, 0.38), (0.24, 0.16, 0.3), mat=felt('#ece6f2'), parent=body)
    head = empty(f'{name}_head', (0, -0.02, 0.92), body)
    prim('sphere', 'm_head', (0, 0, 0), (0.34, 0.31, 0.3), mat=fur, parent=head)
    prim('sphere', 'm_snout', (0, -0.27, -0.06), (0.15, 0.14, 0.12), mat=fur, parent=head)
    prim('sphere', 'm_nose', (0, -0.41, -0.04), (0.055, 0.05, 0.05), mat=glossy('#e46c86', 0.3), parent=head, segs=12)
    for sx in (-1, 1):
        ear = empty('ear', (sx * 0.27, 0.02, 0.26), head)
        prim('cyl', 'm_ear', (0, 0, 0), (0.24, 0.24, 0.035), (math.pi / 2, 0, 0), mat=fur, parent=ear, segs=24)
        prim('cyl', 'm_ear_in', (0, -0.04, 0), (0.16, 0.16, 0.02), (math.pi / 2, 0, 0), mat=pink, parent=ear, segs=24)
        ear.rotation_euler.y = sx * -0.25
    _eyes(head, 0, -0.27, 0.07, 0.05, 0.12)
    _cheeks(head, 0, -0.26, -0.06, 0.2)
    for sx in (-1, 1):
        prim('sphere', 'm_foot', (sx * 0.16, -0.12, 0.05), (0.12, 0.17, 0.06), mat=pink, parent=body, segs=12)
        arm = empty('arm', (sx * 0.3, -0.08, 0.58), body)
        prim('sphere', 'm_arm', (0, 0, -0.12), (0.07, 0.07, 0.15), mat=fur, parent=arm, segs=12)
    # tail: a curl of small beads
    for i in range(9):
        a = i / 8
        prim('sphere', 'm_tail', (0.05 + 0.4 * math.sin(a * 2.2), 0.3 + 0.18 * a, 0.12 + 0.55 * a * a), (0.04, 0.04, 0.04), mat=pink, parent=body, segs=8)
    return root, body, head


def fox(name, color='#e07a32'):
    root = empty(name)
    body = empty(f'{name}_body', (0, 0, 0), root)
    fur = felt(color)
    white = felt('#fbf1e4')
    dark = felt('#3b2a2a')
    prim('sphere', 'f_body', (0, 0, 0.5), (0.36, 0.34, 0.5), mat=fur, parent=body)
    prim('sphere', 'f_chest', (0, -0.22, 0.52), (0.22, 0.14, 0.32), mat=white, parent=body)
    head = empty(f'{name}_head', (0, -0.03, 1.08), body)
    prim('sphere', 'f_head', (0, 0, 0), (0.38, 0.33, 0.3), mat=fur, parent=head)
    prim('sphere', 'f_cheekfur', (0, -0.18, -0.1), (0.3, 0.18, 0.16), mat=white, parent=head)
    prim('cone', 'f_snout', (0, -0.36, -0.06), (1, 1, 0.14), (math.pi / 2 + 0.15, 0, 0), mat=white, parent=head, segs=16, r1=0.14, r2=0.03)
    prim('sphere', 'f_nose', (0, -0.5, -0.04), (0.05, 0.045, 0.045), mat=glossy('#1d1416', 0.3), parent=head, segs=12)
    for sx in (-1, 1):
        ear = empty('ear', (sx * 0.22, 0.02, 0.28), head)
        prim('cone', 'f_ear', (0, 0, 0.12), (1, 0.45, 0.13), mat=fur, parent=ear, segs=12, r1=0.15, r2=0.0)
        prim('cone', 'f_ear_tip', (0, -0.005, 0.215), (1, 0.47, 0.04), mat=dark, parent=ear, segs=12, r1=0.05, r2=0.0)
        ear.rotation_euler.y = sx * -0.25
        prim('sphere', 'f_leg', (sx * 0.16, -0.08, 0.08), (0.1, 0.12, 0.1), mat=dark, parent=body, segs=12)
        arm = empty('arm', (sx * 0.32, -0.1, 0.68), body)
        prim('sphere', 'f_arm', (0, 0, -0.14), (0.08, 0.08, 0.17), mat=fur, parent=arm, segs=12)
    _eyes(head, 0, -0.26, 0.06, 0.05, 0.14, 1.3)
    _cheeks(head, 0, -0.27, -0.06, 0.22, 0.06)
    tail = empty('tail', (0.25, 0.25, 0.3), body)
    # a bushy tail curling up behind, in three overlapping puffs with a white tip
    prim('sphere', 'f_tail', (0.08, 0.05, 0.0), (0.2, 0.2, 0.24), mat=fur, parent=tail)
    prim('sphere', 'f_tail2', (0.22, 0.1, 0.24), (0.21, 0.21, 0.26), (0, -0.4, 0), mat=fur, parent=tail)
    prim('sphere', 'f_tailtip', (0.3, 0.12, 0.5), (0.15, 0.15, 0.17), (0, -0.4, 0), mat=white, parent=tail)
    anim(lambda t, f, tl=tail: setattr(tl.rotation_euler, 'y', math.sin(t * 2.0) * 0.15))
    return root, body, head


def owl(name, color='#8a6a4f'):
    root = empty(name)
    body = empty(f'{name}_body', (0, 0, 0), root)
    fur = felt(color)
    belly = felt('#e9d5b3')
    prim('sphere', 'o_body', (0, 0, 0.55), (0.42, 0.38, 0.55), mat=fur, parent=body)
    prim('sphere', 'o_belly', (0, -0.22, 0.45), (0.3, 0.2, 0.38), mat=belly, parent=body)
    # felt scallops on the belly
    for row in range(3):
        for k in range(3 - (row % 2)):
            xx = (k - (2 - (row % 2)) / 2) * 0.14
            prim('sphere', 'o_scallop', (xx, -0.4 + row * 0.01, 0.62 - row * 0.15), (0.05, 0.02, 0.035), mat=felt('#c9a77d'), parent=body, segs=10)
    head = empty(f'{name}_head', (0, -0.02, 1.08), body)
    prim('sphere', 'o_head', (0, 0, 0), (0.42, 0.36, 0.33), mat=fur, parent=head)
    for sx in (-1, 1):
        prim('cyl', 'o_eyedisc', (sx * 0.17, -0.3, 0.02), (0.15, 0.15, 0.03), (math.pi / 2, 0, 0), mat=felt('#f7ecd2'), parent=head, segs=24)
        prim('cone', 'o_tuft', (sx * 0.27, 0, 0.36), (1, 0.6, 0.11), (0, sx * -0.45, 0), mat=fur, parent=head, segs=10, r1=0.1, r2=0.0)
        wing = empty('wing', (sx * 0.4, 0.02, 0.75), body)
        prim('sphere', 'o_wing', (sx * 0.05, 0, -0.18), (0.12, 0.25, 0.36), mat=felt('#6e523c'), parent=wing, segs=16)
        prim('sphere', 'o_foot', (sx * 0.14, -0.2, 0.04), (0.09, 0.09, 0.05), mat=felt('#e8a33d'), parent=body, segs=10)
    _eyes(head, 0, -0.34, 0.02, 0.065, 0.17, 2.1)
    prim('cone', 'o_beak', (0, -0.36, -0.1), (1, 1, 0.08), (math.pi, 0, 0), mat=felt('#e8a33d'), parent=head, segs=12, r1=0.07, r2=0.0)
    return root, body, head


def bunny(name, color='#efe7dc'):
    root = empty(name)
    body = empty(f'{name}_body', (0, 0, 0), root)
    fur = felt(color)
    pink = felt('#f4a7b5')
    prim('sphere', 'b_body', (0, 0, 0.42), (0.36, 0.33, 0.42), mat=fur, parent=body)
    head = empty(f'{name}_head', (0, -0.02, 0.92), body)
    prim('sphere', 'b_head', (0, 0, 0), (0.33, 0.3, 0.29), mat=fur, parent=head)
    for sx in (-1, 1):
        ear = empty('ear', (sx * 0.13, 0.02, 0.22), head)
        prim('sphere', 'b_ear', (0, 0, 0.32), (0.09, 0.05, 0.34), mat=fur, parent=ear, segs=14)
        prim('sphere', 'b_ear_in', (0, -0.03, 0.32), (0.05, 0.03, 0.26), mat=pink, parent=ear, segs=12)
        ear.rotation_euler.y = sx * -0.18
        prim('sphere', 'b_foot', (sx * 0.17, -0.14, 0.05), (0.12, 0.2, 0.07), mat=fur, parent=body, segs=12)
        arm = empty('arm', (sx * 0.3, -0.08, 0.56), body)
        prim('sphere', 'b_arm', (0, 0, -0.12), (0.07, 0.07, 0.15), mat=fur, parent=arm, segs=12)
    prim('sphere', 'b_nose', (0, -0.29, -0.03), (0.045, 0.04, 0.035), mat=glossy('#e46c86', 0.3), parent=head, segs=10)
    prim('sphere', 'b_tail', (0, 0.33, 0.25), (0.13, 0.13, 0.13), mat=felt('#ffffff'), parent=body, segs=12)
    _eyes(head, 0, -0.25, 0.06, 0.05, 0.12, 0.7)
    _cheeks(head, 0, -0.24, -0.06, 0.19)
    return root, body, head


CHARACTERS = {'mouse': mouse, 'fox': fox, 'owl': owl, 'bunny': bunny}


def held_star(parent, size=0.22):
    s = outline_obj('held_star', star_pts(size, size * 0.48), 0.08, felt('#ffd75e', emit=2.5, emit_color='#ffcf4d', sheen=0.6), bevel=0.03)
    s.parent = parent
    l = bpy.data.lights.new('held', 'POINT')
    l.energy = 25
    l.color = (1, 0.85, 0.5)
    lo = bpy.data.objects.new('held', l)
    link(lo)
    lo.parent = s
    lo.location = (0, -0.3, 0)
    return s


def act(root, body, head, action, x0, x1, start, dur, phase=0.0, kind='mouse', z0=0.0):
    """Gentle motion. x0 -> x1 for walking actions; everything breathes and sways a little."""
    arms = [c for c in body.children if c.name.startswith('arm')]
    ears = [c for c in head.children if c.name.startswith('ear')]
    wings = [c for c in body.children if c.name.startswith('wing')]
    if action == 'hold_star':
        held_star(arms[0] if arms else (wings[0] if wings else body)).location = (0.0, -0.18, -0.32)

    def go(t, f):
        u = max(0.0, min(1.0, (t - start) / max(0.1, dur)))
        e = u * u * (3 - 2 * u)
        breath = math.sin(t * 2.2 + phase)
        body.scale.z = 1 + breath * 0.02
        body.scale.x = 1 - breath * 0.01
        head.rotation_euler.y = math.sin(t * 0.9 + phase) * 0.06
        head.rotation_euler.x = 0
        root.location.z = z0
        if action in ('walk', 'walk_in', 'walk_out', 'hold_star'):
            root.location.x = x0 + (x1 - x0) * e
            moving = 0 < u < 1
            hop = abs(math.sin(t * 7 + phase)) * 0.07 if moving else 0
            body.location.z = hop
            body.rotation_euler.y = math.sin(t * 7 + phase) * 0.06 if moving else 0
            root.rotation_euler.z = (0.35 if x1 > x0 else -0.35) * (1 if moving else 0.4)
        elif action == 'hop':
            root.location.x = x0
            body.location.z = max(0, math.sin(t * 4.2 + phase)) * 0.28
            body.scale.z = 1 + breath * 0.02 + (0.06 if body.location.z < 0.02 else -0.03)
        elif action == 'wave':
            root.location.x = x0
            if arms:
                arms[-1].rotation_euler.y = -2.4 + math.sin(t * 6) * 0.45
        elif action == 'look_up':
            root.location.x = x0
            head.rotation_euler.x = 0.35 + math.sin(t * 0.8) * 0.05
        elif action == 'sleep':
            root.location.x = x0
            body.scale.z = 1 + math.sin(t * 1.3) * 0.04
            head.rotation_euler.x = -0.15
            head.rotation_euler.y = 0.25
            for c in head.children:
                if c.name.startswith('eye'):
                    c.scale.z = c.scale.x * 0.12
                elif c.name.startswith('glint'):
                    c.scale = (0, 0, 0)
        elif action == 'fly':
            root.location.x = x0 + (x1 - x0) * e
            root.location.z = z0 + 1.2 + math.sin(t * 2.5 + phase) * 0.15
            for i, w in enumerate(wings):
                w.rotation_euler.y = (1 if i else -1) * (0.3 + math.sin(t * 9) * 0.6)
        else:  # idle
            root.location.x = x0
        if action != 'wave':
            for i, a in enumerate(arms):
                if action == 'hold_star' and i == 0:
                    a.rotation_euler.x = -0.9
                    continue
                a.rotation_euler.y = (1 if i else -1) * (0.15 + math.sin(t * 2.2 + phase) * 0.05)
        for i, ea in enumerate(ears):
            ea.rotation_euler.x = math.sin(t * 1.7 + i + phase) * 0.08
    anim(go)
