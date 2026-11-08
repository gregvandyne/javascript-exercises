"""The Story Builder's second look, "Comic": the same 3D kit (sets, people, animals, props, actions) drawn like a
graphic novel — confident ink lines of varying weight, flat muted colour in three soft cel steps, moody light, a
paper grain, hatching in the deepest shadows, and simple drawn faces (dot eyes, small brows, a mouth shape).

How it plugs in (render_story.py, when the spec says `look: "comic"`):
  feltkit.set_style('comic')   feltkit's felt()/paper()/glossy()/glow()/haze()/sky_material() ask `material()` here
                               for the felt colour they were given (the felt path is untouched);
  begin(time, set)             the palette for this time of day, indoors or out;
  finish(spec, scene, hints)   once the scene is built: the light rig, the ink lines (Freestyle), the faces, no depth
                               of field, the render settings.

Colour: every felt colour is muted in OKLab (less chroma, a compressed lightness range) and pulled a little towards
the time of day's tint; each material then shows that colour in three steps — lit, shade, deep — picked by how much
light reaches the surface (EEVEE: Shader to RGB of a white diffuse; Cycles has no Shader to RGB, so there the steps
come from a fixed light direction). The steps meet with a narrow soft edge (soft cel), the deepest step carries
diagonal hatching, and a fixed paper grain sits over everything in screen space.

Lines: Freestyle (CPU, the same in EEVEE and Cycles) in a warm ink, in three sets: a heavy outline round the
characters and lighter lines inside them (clothes, hair locks), and a thinner, lighter outline round the set with no
inner lines (floor and wall patterns, pitch markings, clouds: colour only), so the background never competes with the
cast. Thicker near the camera and thinner far away, thick-and-thin by direction like a brush pen, tapered at the ends,
with a little wobble. The sky, glows, light beams, weather and tiny bits of the set get no line.

Faces (people and animals, found by part name, so felt_people.py needs no change): a person's eye beans become ink
beans under a skin lid drawn as an ink line, glints go, the felt nose goes (a simple round head), brows are bold ink
(they still move with the mood) and mouths ink; an animal's bead eyes become small ink dots. The expressions the
actions switch (smile, open, sad, closed, squint) work as before. Every change goes through the object's material
slots and the object's scale: the kit's primitives of a kind share one mesh.
"""
import math

import bpy

import feltkit as K
import styles as S

INK = '#1f1a1d'
PAPER = '#efe6d2'

# The palette per time of day (and indoors at night: a warm lamp-lit room rather than blue moonlight).
#   tint: what every colour is pulled towards (k: how far); chroma: how much colour is kept; L: the lightness range
#   key: the key light (colour, strength, elevation and azimuth in degrees); amb: the ambient (world) strength;
#   lamps: how much of the set's own lamps is kept (pools of light); sky: (top, bottom) of the backdrop.
TIMES = {
    'night': dict(tint='#2a3550', k=0.26, chroma=0.45, L=(0.14, 0.80), key=('#b9c3df', 2.4, 38, -40), amb=0.11, lamps=0.55,
                  sky=('#141a2c', '#34405e'), grain=0.07, line_alpha=0.95),
    'night_in': dict(tint='#3b2d24', k=0.26, chroma=0.42, L=(0.10, 0.70), key=('#f4cf9a', 2.2, 42, -30), amb=0.07, lamps=0.4,
                     sky=('#141a2c', '#34405e'), grain=0.07, line_alpha=0.95),
    'dusk': dict(tint='#4b3a56', k=0.24, chroma=0.50, L=(0.12, 0.80), key=('#f0b48c', 2.5, 32, -50), amb=0.15, lamps=0.5,
                 sky=('#3a3456', '#c98c78'), grain=0.06, line_alpha=0.95),
    'dawn': dict(tint='#d8bba6', k=0.14, chroma=0.55, L=(0.16, 0.88), key=('#ffe2c4', 2.6, 24, 50), amb=0.16, lamps=0.3,
                 sky=('#8fa3c0', '#e8cdb2'), grain=0.06, line_alpha=0.95),
    'day': dict(tint='#e6dcc6', k=0.12, chroma=0.58, L=(0.15, 0.90), key=('#fff4e2', 2.9, 48, -38), amb=0.17, lamps=0.0,
                sky=('#8fb2cc', '#dfe6e2'), grain=0.06, line_alpha=0.95),
}

# the felt skies render_story.TIMES gives the backdrop (top, bottom): these get the comic time's own sky
TIME_SKIES = {('#0b1238', '#4166c4'), ('#232a66', '#f0a08a'), ('#7da4e0', '#ffd2a6'), ('#5fb0ea', '#d6f0fb')}

# The look's knobs (the line widths are at 720p and scale with the picture's height).
LOOK = {
    'line_px': 3.0,          # the ink line's base width
    'line_min': 0.7,         # brush-pen thick-and-thin: across this range of the base width by stroke direction
    'line_max': 1.4, 
    'line_near': 3.0,        # distance from the camera where lines are full width ...
    'line_far': 26.0,        # ... and where they are thinnest
    'line_far_k': 0.4,
    'wobble_px': 0.55,       # a hand's wobble along a stroke
    'overshoot_px': 1.5,     # strokes run on past their ends this much
    'taper': 0.6,            # a stroke's ends, as a share of its width
    'inner': 0.6,            # lines inside a shape, as a share of the outline's width
    'crease_deg': 125.0,     # edges sharper than this get a line (boxes, furniture; not the felt spheres)
    'steps': (0.16, 0.46),   # Shader to RGB light: below the first, deep; below the second, shade; above, lit
    'soft': 0.02,            # half-width of the soft edge between steps
    'hatch': 0.32,           # how dark the hatching in the deep step is (0 = none)
    'hatch_px': 5.0,         # hatch spacing at 720p
    'fill': 0.3,             # the camera-side fill light, as a share of the key
    'eye_scale': 0.8,        # an animal's bead eyes -> ink dots this much smaller
    'bean_scale': 0.86,      # a person's eye beans -> ink beans this much narrower
    'brow_z': 1.1,           # ink brows a little bolder than the felt ones
    'cast': 1.9,             # the characters' outline, as a share of line_px (the heaviest line)
    'set': 0.8,              # the set's outline, as a share of line_px ...
    'set_alpha': 0.75,       # ... and a little lighter
    'ground_L': 0.5,         # the ground's lit colour is at least this light (OKLab L)
}

# no ink on these (part names, as the kit names them)
NO_LINE = ('sky', 'backdrop', 'starfield', 'star_field', 'glint', 'cheek', 'thread', 'halo', 'beam', 'haze', 'fly',
           'tuft', 'pebble', 'steam', 'rain', 'snow', 'drop', 'confetti', 'spark', 'ripple', 'zzz', 'lh_window', 'tear',
           'contact', 'crater', 'stars', 'window_sky', 'bulb')
# on the characters only a few of those hold (hair tufts and locks, clothes threads get their line)
NO_LINE_CAST = ('glint', 'cheek', 'blush', 'halo', 'zzz', 'tear', 'spark', 'steam', 'contact', 'shadow')
# set parts drawn by colour only (no outline): floor and wall patterns
SET_NO_LINE = ('wallpaper', 'floor', 'tile', 'plank', 'stripe', 'pitch', 'rug', 'grout', 'cloud', 'crowd')

CUR = {'time': 'night', 'pal': TIMES['night'], 'engine': 'BLENDER_EEVEE', 'height': 720}
_MATS = {}


def use():
    _MATS.clear()
    return 'comic'


def begin(time_of_day, set_name=None, spec=None):
    """Pick the palette before the set is built (materials are made while it is built)."""
    try:
        import felt_sets_rooms
        indoor = set_name in felt_sets_rooms.ROOM_SETS
    except Exception:
        indoor = False
    t = time_of_day if time_of_day in TIMES else 'night'
    if t == 'night' and indoor:
        t = 'night_in'
    CUR['time'] = t
    CUR['pal'] = TIMES[t]
    CUR['engine'] = bpy.context.scene.render.engine
    CUR['height'] = int((spec or {}).get('height', 720))
    _MATS.clear()


# ---------------------------------------------------------------- colour
def _mix_lab(a, b, k):
    return tuple(x + (y - x) * k for x, y in zip(a, b))


def mute(hex_col, lift=0.0):
    """A felt colour -> the comic palette's colour: less chroma, lightness squeezed into the time's range, a pull
    towards the tint. lift moves the lightness (in OKLab L) after that."""
    p = CUR['pal']
    L, a, b = S.hex_to_oklab(hex_col)
    lo, hi = p['L']
    L = lo + (hi - lo) * max(0.0, min(1.0, L))
    a, b = a * p['chroma'], b * p['chroma']
    L, a, b = _mix_lab((L, a, b), S.hex_to_oklab(p['tint']), p['k'])
    return S.oklab_to_hex(max(0.0, min(1.0, L + lift)), a, b)


def steps_of(hex_col, lift=0.0):
    """lit, shade, deep for a felt colour. The shade is darker and a little cooler; the deep step darker again."""
    lit = mute(hex_col, lift)
    L, a, b = S.hex_to_oklab(lit)
    cool = S.hex_to_oklab('#2b3150')
    sL, sa, sb = _mix_lab((L - 0.13, a, b), (L - 0.13, cool[1], cool[2]), 0.35)
    dL, da, db = _mix_lab((L - 0.25, a, b), (L - 0.25, cool[1], cool[2]), 0.55)
    return lit, S.oklab_to_hex(max(0.03, sL), sa * 0.9, sb * 0.9), S.oklab_to_hex(max(0.02, dL), da * 0.8, db * 0.8)


# ---------------------------------------------------------------- shader pieces
def _new(name, key):
    m = _MATS.get(key)
    if m is not None:
        try:
            if m.name in bpy.data.materials:
                return None, m
        except ReferenceError:
            pass
    mat = bpy.data.materials.new(name)
    _MATS[key] = mat
    return K._nodes(mat), mat


def _math(N, L, op, a, b=None, c=None, clamp=False):
    n = N.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            L.new(v, n.inputs[i])
    return n.outputs[0]


def _mixc(N, L, fac, c0, c1):
    m = N.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    if isinstance(fac, (int, float)):
        m.inputs['Factor'].default_value = fac
    else:
        L.new(fac, m.inputs['Factor'])
    for sock, c in ((m.inputs[6], c0), (m.inputs[7], c1)):
        if isinstance(c, tuple):
            sock.default_value = c
        else:
            L.new(c, sock)
    return m.outputs[2]


def _screen(N, L):
    """Screen position in 720p pixels (x, y): for the hatching and the grain, fixed to the picture like paper."""
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Window'], sep.inputs['Vector'])
    sc = bpy.context.scene
    aspect = sc.render.resolution_x / max(1, sc.render.resolution_y)
    x = _math(N, L, 'MULTIPLY', sep.outputs['X'], 720.0 * aspect)
    y = _math(N, L, 'MULTIPLY', sep.outputs['Y'], 720.0)
    return x, y


def _grain(N, L, col, amount):
    """Paper: a fine grain and a soft mottle, both fixed to the screen."""
    if amount <= 0:
        return col
    x, y = _screen(N, L)
    comb = N.new('ShaderNodeCombineXYZ')
    L.new(x, comb.inputs['X'])
    L.new(y, comb.inputs['Y'])
    fine = N.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 0.9
    fine.inputs['Detail'].default_value = 2.0
    L.new(comb.outputs['Vector'], fine.inputs['Vector'])
    soft = N.new('ShaderNodeTexNoise')
    soft.inputs['Scale'].default_value = 0.006
    soft.inputs['Detail'].default_value = 3.0
    L.new(comb.outputs['Vector'], soft.inputs['Vector'])
    g = _math(N, L, 'ADD', fine.outputs['Fac'], soft.outputs['Fac'])
    g = _math(N, L, 'MULTIPLY_ADD', g, amount, 1.0 - amount)   # around 1.0: (fine + soft) ~ 1
    m = N.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    m.blend_type = 'MULTIPLY'
    m.inputs['Factor'].default_value = 1.0
    L.new(col, m.inputs[6])
    comb2 = N.new('ShaderNodeCombineColor')
    for ch in ('Red', 'Green', 'Blue'):
        L.new(g, comb2.inputs[ch])
    L.new(comb2.outputs['Color'], m.inputs[7])
    return m.outputs[2]


def _hatch(N, L, deep_w, amount):
    """Diagonal ink hatching where deep_w (0..1) says the surface is in the deepest shadow."""
    x, y = _screen(N, L)
    d = _math(N, L, 'ADD', x, y)
    d = _math(N, L, 'DIVIDE', d, LOOK['hatch_px'] * math.sqrt(2))
    fr = _math(N, L, 'FRACT', d)
    # a soft line: 1 in the middle of each hatch line, 0 between
    tri = _math(N, L, 'ABSOLUTE', _math(N, L, 'SUBTRACT', fr, 0.5))
    line = _math(N, L, 'MULTIPLY', _math(N, L, 'SUBTRACT', 0.22, tri), 9.0, clamp=True)
    return _math(N, L, 'MULTIPLY', _math(N, L, 'MULTIPLY', line, deep_w), amount)


def _light_value(N, L):
    """How lit the surface is, 0..~1: EEVEE asks the lights (shadows included); Cycles uses a fixed light."""
    if CUR['engine'] == 'BLENDER_EEVEE':
        d = N.new('ShaderNodeBsdfDiffuse')
        d.inputs['Color'].default_value = (1, 1, 1, 1)
        s2r = N.new('ShaderNodeShaderToRGB')
        L.new(d.outputs['BSDF'], s2r.inputs['Shader'])
        bw = N.new('ShaderNodeRGBToBW')
        L.new(s2r.outputs['Color'], bw.inputs['Color'])
        return bw.outputs['Val']
    geo = N.new('ShaderNodeNewGeometry')
    dot = N.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    _, _, el, az = CUR['pal']['key']
    e, a = math.radians(el), math.radians(az)
    dot.inputs[1].default_value = (math.sin(a) * math.cos(e) * -1, -math.cos(a) * math.cos(e), math.sin(e))
    L.new(geo.outputs['Normal'], dot.inputs[0])
    return _math(N, L, 'MULTIPLY_ADD', dot.outputs['Value'], 0.45, 0.3)


def _step(N, L, v, at):
    lo, hi = at - LOOK['soft'], at + LOOK['soft']
    mr = N.new('ShaderNodeMapRange')
    mr.interpolation_type = 'SMOOTHSTEP'
    L.new(v, mr.inputs['Value'])
    mr.inputs['From Min'].default_value = lo
    mr.inputs['From Max'].default_value = hi
    return mr.outputs['Result']


def toon(hex_col, lift=0.0, hatch=True, grain=True):
    lit, shade, deep = steps_of(hex_col, lift)
    got, mat = _new(f'comic_{hex_col}', ('toon', hex_col, lift, hatch))
    if got is None:
        return mat
    nt, N, L = got
    out = N.new('ShaderNodeOutputMaterial')
    v = _light_value(N, L)
    s1 = _step(N, L, v, LOOK['steps'][0])
    s2 = _step(N, L, v, LOOK['steps'][1])
    col = _mixc(N, L, s1, K.hexcol(deep), K.hexcol(shade))
    col = _mixc(N, L, s2, col, K.hexcol(lit))
    if hatch and LOOK['hatch'] > 0:
        deep_w = _math(N, L, 'SUBTRACT', 1.0, s1)
        h = _hatch(N, L, deep_w, LOOK['hatch'])
        col = _mixc(N, L, h, col, K.hexcol(INK))
    if grain:
        col = _grain(N, L, col, CUR['pal']['grain'])
    em = N.new('ShaderNodeEmission')
    L.new(col, em.inputs['Color'])
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    mat['comic'] = 'toon'
    mat['felt'] = hex_col
    return mat


def flat(hex_col, strength=1.0, kind='flat', grain=True, raw=False):
    """One colour, lit by nothing (lamps, the moon, eyes, ink parts)."""
    col_hex = hex_col if raw else mute(hex_col)
    got, mat = _new(f'comic_flat_{col_hex}', ('flat', col_hex, strength, kind, grain))
    if got is None:
        return mat
    nt, N, L = got
    out = N.new('ShaderNodeOutputMaterial')
    rgb = N.new('ShaderNodeRGB')
    rgb.outputs[0].default_value = K.hexcol(col_hex)
    col = rgb.outputs[0]
    if grain:
        col = _grain(N, L, col, CUR['pal']['grain'] * 0.6)
    em = N.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = strength
    L.new(col, em.inputs['Color'])
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    mat['comic'] = kind
    return mat


def ink():
    return flat(INK, kind='ink', grain=False, raw=True)


def sky(top, bottom):
    """The backdrop: the time of day's own sky (a muted gradient) with the paper grain."""
    # the time of day's own sky for the usual backdrop (render_story.TIMES); a set's own sky (under the sea, space)
    # in its own colours, muted
    t, b = CUR['pal']['sky'] if (str(top).lower(), str(bottom).lower()) in TIME_SKIES or not top else (mute(top, -0.04), mute(bottom, -0.02))
    got, mat = _new('comic_sky', ('sky', t, b))
    if got is None:
        return mat
    nt, N, L = got
    out = N.new('ShaderNodeOutputMaterial')
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Generated'], sep.inputs['Vector'])
    r = N.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].color = K.hexcol(b)
    r.color_ramp.elements[0].position = 0.15
    r.color_ramp.elements[1].color = K.hexcol(t)
    r.color_ramp.elements[1].position = 0.8
    L.new(sep.outputs['Z'], r.inputs['Fac'])
    col = _grain(N, L, r.outputs['Color'], CUR['pal']['grain'] * 1.2)
    em = N.new('ShaderNodeEmission')
    L.new(col, em.inputs['Color'])
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    mat['comic'] = 'sky'
    return mat


def material(kind, color, emit=0.0, emit_color=None, strength=1.0, axis='radial', power=2.0, name=None, top=None, bottom=None):
    """What feltkit asks for while the look is comic."""
    if kind == 'sky':
        return sky(top, bottom)
    if kind == 'haze':
        # the felt haze (an additive soft light), in the comic's colour and a little dimmer
        restyle, K._restyle = K._restyle, None
        try:
            m = K.haze(mute(color, 0.08), strength * 0.55, axis, power, name or 'haze')
        finally:
            K._restyle = restyle
        m['comic'] = 'haze'
        return m
    if kind == 'glow':
        return flat(color, 1.6 if strength >= 2.5 else 1.15, kind='glow', grain=False, raw=False) if not _is_white(color) else flat('#f4ecd8', 1.4, kind='glow', grain=False, raw=True)
    if emit >= 0.8:  # lit things (the moon, glowing stars, lamp shades)
        return flat(emit_color or color, 1.35 if emit >= 1.5 else 1.1, kind='glow')
    if emit > 0:  # softly glowing paper (thought clouds, steam, snow letters): flat and light
        return flat(color, 1.0, kind='flat')
    if kind == 'glossy':
        return toon(color, hatch=False)
    return toon(color)


def _is_white(h):
    return S.hex_to_oklab(h)[0] > 0.95


# ---------------------------------------------------------------- lights
def lights(hints=None):
    """The felt rig goes; one key light (a sun, crisp shadows) and a low ambient in its place. The set's own lamps
    (room lamps, floodlights, street lamps) stay, dimmer, as pools of light; only the key casts shadows."""
    p = CUR['pal']
    for ob in [o for o in bpy.data.objects if o.type == 'LIGHT']:
        if ob.name.split('.')[0] in ('key', 'rim', 'fill') or ob.data.type == 'AREA' or p['lamps'] <= 0:
            bpy.data.objects.remove(ob, do_unlink=True)
        else:
            ob.data.energy *= p['lamps']
            ob.data.use_shadow = False
    # a soft fill from the camera's side (no shadow), so faces turned to the camera aren't lost in the shade
    fill = bpy.data.lights.new('fill', 'SUN')
    fill.energy = p['key'][1] * LOOK['fill']
    fill.color = (1.0, 1.0, 1.0)
    fill.use_shadow = False
    fo = bpy.data.objects.new('fill', fill)
    K.link(fo)
    fo.rotation_euler = (math.radians(80), 0, 0)
    col, strength, el, az = p['key']
    sun = bpy.data.lights.new('key', 'SUN')
    sun.energy = strength
    sun.color = K.hexcol(col)[:3]
    sun.angle = math.radians(1.5)
    sun.use_shadow = True
    so = bpy.data.objects.new('key', sun)
    K.link(so)
    # a light from the front-left and above (azimuth from the camera's view direction, +Y into the picture)
    so.rotation_euler = (math.radians(90 - el), 0, math.radians(az))
    sc = bpy.context.scene
    if sc.world and sc.world.node_tree:
        bg = sc.world.node_tree.nodes.get('Background')
        bg.inputs['Color'].default_value = (1, 1, 1, 1)
        bg.inputs['Strength'].default_value = p['amb']


# ---------------------------------------------------------------- materials on objects
def set_mat(ob, mat):
    """Give one object a material through its object-level slots. The kit's primitives of a kind share one mesh
    (felt_people.prim), so a mesh's own materials are never edited here: that would change every shape sharing it."""
    if ob.type != 'MESH':
        return
    if len(ob.material_slots) == 0:
        if ob.data.users > 1:
            ob.data = ob.data.copy()
        ob.data.materials.append(None)
    for slot in ob.material_slots:
        slot.link = 'OBJECT'
        slot.material = mat


def mats_of(ob):
    return [s.material for s in getattr(ob, 'material_slots', ()) if s.material is not None]


def _cast_roots():
    """People and animals: the top-level empties the stage gives a height."""
    return [o for o in bpy.data.objects if o.type == 'EMPTY' and o.parent is None and 'height' in o.keys()]


def _desc(ob):
    for c in ob.children:
        yield c
        yield from _desc(c)


# ---------------------------------------------------------------- ink lines (Freestyle)
def _no_line(ob, cast=False):
    n = ob.name.lower()
    if any(s in n for s in (NO_LINE_CAST if cast else NO_LINE)):
        return True
    for m in mats_of(ob):
        if m.get('comic') in ('sky', 'haze', 'glow', 'ink'):
            return True
    if ob.get('ink_keep'):
        return False
    d = ob.dimensions
    if ob.type == 'MESH' and max(d.x, d.y, d.z) * max(ob.matrix_world.to_scale()) < (0.02 if cast else 0.045):
        return True
    return False


def _flat_decal(ob):
    """Painted-on bits of a set (pitch lines, rugs, tiles, planks, wall boards): thin slabs that would only add busy
    lines behind the characters; their colour says enough."""
    if any(s in ob.name.lower() for s in SET_NO_LINE):
        return True
    from mathutils import Vector
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    dz = max(p.z for p in pts) - min(p.z for p in pts)
    return dz < 0.03 and max(p.z for p in pts) < 0.08   # flat on the ground


def _style(name, width, k, alpha):
    st = bpy.data.linestyles.new(name)
    st.color = K.hexcol(INK)[:3]
    st.alpha = alpha
    st.thickness = width * k
    st.thickness_position = 'CENTER'
    st.caps = 'BUTT'  # (round caps fail on some very short strokes and drop the whole line set)
    st.use_chaining = True
    st.chaining = 'PLAIN'
    st.use_same_object = True
    # brush-pen thick and thin: by the stroke's direction
    cal = st.thickness_modifiers.new('pen', 'CALLIGRAPHY')
    cal.orientation = math.radians(60)
    cal.thickness_min = width * k * LOOK['line_min']
    cal.thickness_max = width * k * LOOK['line_max']
    cal.blend = 'MINIMUM'
    cal.influence = 0.85
    # pressure: a stroke starts and ends a little thinner
    taper = st.thickness_modifiers.new('taper', 'ALONG_STROKE')
    taper.blend = 'MULTIPLY'
    taper.mapping = 'CURVE'
    cv = taper.curve
    pts = cv.curves[0].points
    pts[0].location = (0.0, LOOK['taper'])
    pts[-1].location = (1.0, LOOK['taper'])
    pts.new(0.1, 1.0)
    pts.new(0.9, 1.0)
    cv.update()
    # nearer is heavier
    dist = st.thickness_modifiers.new('depth', 'DISTANCE_FROM_CAMERA')
    dist.blend = 'MULTIPLY'
    dist.range_min = LOOK['line_near']
    dist.range_max = LOOK['line_far']
    dist.value_min = 1.0
    dist.value_max = LOOK['line_far_k']
    dist.mapping = 'LINEAR'
    # a stroke point every 4 px: the stroke shaders run in Python per point, so this is most of what the line
    # style costs (2 px looked no different and took ~1.5 s more a frame on the classroom)
    st.geometry_modifiers.new('sample', 'SAMPLING').sampling = 4.0
    w = st.geometry_modifiers.new('hand', 'PERLIN_NOISE_1D')
    w.frequency = 6.0
    w.amplitude = LOOK['wobble_px'] * k
    w.octaves = 2
    w.seed = 7
    if LOOK['overshoot_px']:  # strokes run a hair past their ends, as a hand draws them
        st.geometry_modifiers.new('over', 'BACKBONE_STRETCHER').backbone_length = LOOK['overshoot_px'] * k
    return st


def _lineset(fs, name, coll, outer):
    ls = fs.linesets.new(name)
    ls.select_by_visibility = True
    ls.visibility = 'VISIBLE'
    ls.select_by_edge_types = True
    for t in ('silhouette', 'border', 'crease', 'material_boundary', 'external_contour', 'contour', 'suggestive_contour',
              'ridge_valley', 'edge_mark'):
        setattr(ls, f'select_{t}', False)
    if outer:   # the outline of every shape: the heavy line
        ls.select_silhouette = True
        ls.select_border = True
        ls.select_external_contour = True
    else:       # inside a shape: folds, box edges, where one colour meets another
        ls.select_crease = True
        ls.select_material_boundary = True
    ls.select_by_collection = True
    ls.collection = coll
    ls.collection_negation = 'INCLUSIVE'
    return ls


def lines(spec):
    """Freestyle ink in three sets: a heavy, confident outline round the characters (people, animals) and lighter
    lines inside them (clothes, hair locks, where one colour meets another); a thinner, lighter outline round the
    set and its props, with no inner lines (tile grids, planks and pitch markings stay colour only), so the
    background never competes with the cast."""
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    k = max(0.25, int(spec.get('height', 720)) / 720.0)
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = 'ABSOLUTE'
    sc.render.line_thickness = 1.0
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.mode = 'EDITOR'
    fs.use_culling = True
    fs.crease_angle = math.radians(LOOK['crease_deg'])
    fs.use_smoothness = True
    cast_c = bpy.data.collections.new('ink_cast')
    set_c = bpy.data.collections.new('ink_set')
    for c in (cast_c, set_c):
        sc.collection.children.link(c)
        c.hide_render = False
    cast_obs = set()
    for r in _cast_roots():
        cast_obs.update(o.name for o in _desc(r) if o.type == 'MESH')
    for ob in list(bpy.data.objects):
        if ob.type != 'MESH' or ob.hide_render:
            continue
        if ob.name in cast_obs:
            if not _no_line(ob, cast=True):
                cast_c.objects.link(ob)
        elif not _no_line(ob) and not _flat_decal(ob):
            set_c.objects.link(ob)
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)
    a = CUR['pal']['line_alpha']
    px = LOOK['line_px']
    _lineset(fs, 'cast', cast_c, True).linestyle = _style('ink_cast', px * LOOK['cast'], k, a)
    _lineset(fs, 'cast_inner', cast_c, False).linestyle = _style('ink_cast_inner', px * LOOK['inner'], k, a * 0.9)
    _lineset(fs, 'set', set_c, True).linestyle = _style('ink_set', px * LOOK['set'], k, a * LOOK['set_alpha'])


# ---------------------------------------------------------------- faces
def faces():
    """Faces as clean ink, by part name.
    People (felt_people): the glossy eye beans become ink beans (they still blink: the `eye` empty above them is
    what blinks), the glints go, the skin lids stay (their edge is drawn as an ink line over the eye), the felt brows
    become bold ink brows (the actions still tilt them with the mood), the mouths ink; the felt nose goes.
    Animals (feltkit beads): the bead eyes become ink dots, glints and cheeks go, brows and mouths ink."""
    inkm = ink()
    for ob in list(bpy.data.objects):
        if ob.type != 'MESH':
            continue
        base = ob.name.split('.')[0]
        if base.startswith(('eye_glint', 'glint', 'cheek', 'blush')) or base == 'p_nose' or base == 'mouth_open_teeth':
            ob.hide_render = True
        elif base == 'eye_bean':
            set_mat(ob, inkm)
            ob.scale = tuple(v * f for v, f in zip(ob.scale, (LOOK['bean_scale'], 1.0, LOOK['bean_scale'])))
        elif base == 'eye_lid':
            ob['ink_keep'] = True    # small, but its edge is the lid line
        elif base.startswith('eye') and not base.startswith('eyebump'):
            # an animal's bead eye: a smaller dot, a touch taller, just as deep (it stays on the face's surface)
            set_mat(ob, inkm)
            ob.scale = tuple(v * f for v, f in zip(ob.scale, (LOOK['eye_scale'], 1.0, LOOK['eye_scale'] * 1.1)))
        elif base.startswith('brow'):
            set_mat(ob, inkm)
            ob.scale.z *= LOOK['brow_z']
        elif base.startswith(('mouth_smile', 'mouth_sad', 'mouth_open')) and not base.startswith('mouth_open_tongue'):
            set_mat(ob, inkm)
        elif base.startswith('mouth_open_tongue'):
            set_mat(ob, flat('#c46a72'))


# ---------------------------------------------------------------- the ground
def grounds():
    """The ground the cast stands on never sinks into the dark: at dusk and night outdoors the kit's grounds are deep
    greens and blues that the muted palette and the deep step would turn near black (and hatched) across the bottom
    of the picture. Each ground keeps its own colour, lifted to a readable lightness, and no hatching."""
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.name.split('.')[0] == 'ground':
            continue
        m = next(iter(mats_of(ob)), None)
        col = m.get('felt') if m is not None else None
        if not col:
            continue
        L = S.hex_to_oklab(mute(col))[0]
        lift = max(0.0, LOOK['ground_L'] - L)
        if lift > 0.01:
            set_mat(ob, toon(col, lift=lift, hatch=False))


# ---------------------------------------------------------------- the whole look
def finish(spec, sc_spec=None, hints=None):
    sc = bpy.context.scene
    lights(hints)
    sc.view_settings.view_transform = 'Standard'
    try:
        sc.view_settings.look = 'None'
    except Exception:
        pass
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    if sc.render.engine == 'BLENDER_EEVEE':
        sc.eevee.taa_render_samples = int(spec.get('samples', 4))
        sc.eevee.use_shadows = True
    else:
        sc.cycles.use_denoising = False
        sc.cycles.samples = max(8, int(spec.get('samples', 8)))
    cam = sc.camera
    if cam:
        cam.data.dof.use_dof = False
    # bloom only on the brightest lamps
    ng = sc.compositing_node_group
    gl = next((n for n in ng.nodes if n.bl_idname == 'CompositorNodeGlare'), None) if ng else None
    if gl:
        for k, v in (('Threshold', 1.15), ('Strength', 0.35)):
            try:
                gl.inputs[k].default_value = v
            except Exception:
                pass
    faces()
    grounds()
    lines(spec)
