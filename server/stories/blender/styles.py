"""Looks for the Blender kit: felt | cartoon | pixel (docs/story-builder.md, "Styles").

Every style builds the same scene from the same kit (feltkit.py). A style is only:
  - materials: feltkit's felt()/paper()/glossy()/glow()/haze()/sky_material() ask `material()` here when the style
    is not felt, with the felt colour they were given; the style's palette maps it to its own colour;
  - lighting: `finish()` runs once the scene is built and swaps the felt light rig for the style's;
  - post: `post()` runs on each rendered frame (pixel: palette + nearest-neighbour upscale).

felt is the Story Builder look and changes nothing here: every hook returns at once.

cartoon follows the site's "Oomba Ink" (docs/kit.md §2): flat fills from the kit palette, one hard cel shade in the
hue's `shade` step on the side away from a fixed light at the top-left, an Ink (#141414) outline of a constant
on-screen width (inverted hull, like the kit's 3D bridge), a contact shadow under characters, the kit's sky keys.
No lights and no shadow maps: the shade is a dot product with a fixed light direction, so it costs almost nothing
and works the same in EEVEE and Cycles.

pixel is cartoon's materials rendered at a quarter of the size with no anti-aliasing and a one-pixel Ink line, then
snapped to a fixed palette (ordered dither on gradients) and scaled back up with nearest neighbour.

Everything a style decides (palette, light, line, sky, render settings, post) is in its STYLES entry below.
"""
import math

import bpy

import feltkit as K

# ---------------------------------------------------------------- the Oomba Ink palette (docs/kit.md §2.1)
# steps: tint, light, base, shade. `deep` and `night` are derived below (shade L -0.12, -0.24 in OKLab): the kit's
# rule for shades ("never mix black"), used for the far, dark bands of a night scene.
INK = '#141414'
CREAM = '#FFFDF2'
RAMPS = {
    'mint': ['#DDF3E6', '#9BDDB7', '#66C792', '#1F9D63'],
    'spark': ['#FFF3C4', '#FFE27A', '#FFD23F', '#C99A00'],
    'coral': ['#FFE1DC', '#FF9C8F', '#FF6B5B', '#C8402F'],
    'sky': ['#DDEEFD', '#93CBF6', '#4FA8F0', '#2F6FC8'],
    'grape': ['#ECE2FB', '#C6A9F3', '#9B6BE8', '#6C44C0'],
    'peach': ['#FFEAD8', '#FFC89E', '#F5A26B', '#C9713A'],
    'cocoa': ['#EEDFD0', '#BF957A', '#8A5A3C', '#5C3A26'],
    'stone': ['#EEECE5', '#C6C2B5', '#8F8A7C', '#5E5A50'],
    'snow': ['#FFFFFF', '#F4F7FA', '#DDE6EE', '#B4C3D1'],
    'cream': ['#FFFDF2', '#FFFDF2', '#FFFDF2', None],  # shade derived
}
STEPS = ['tint', 'light', 'base', 'shade', 'deep', 'night']
# the kit's sky keys (oomba-kit.js: noon, morning, dusk, night), top and bottom
SKY_KEYS = {'day': ('#4FB4F7', '#BFE8FF'), 'dawn': ('#5AAEEC', '#FFE6B8'), 'dusk': ('#7A55C9', '#FF9C8F'),
            'night': ('#0E2A2E', '#163B3A')}


# ---------------------------------------------------------------- colour maths (sRGB hex <-> OKLab)
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gam(c):
    c = max(0.0, min(1.0, c))
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def hex_to_oklab(h):
    h = h.lstrip('#')
    r, g, b = (_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def oklab_to_hex(L, a, b):
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    rgb = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    return '#' + ''.join(f'{round(_gam(c) * 255):02X}' for c in rgb)


def darker(h, dl):
    L, a, b = hex_to_oklab(h)
    return oklab_to_hex(max(0.0, L - dl), a, b)


def ramp(hue):
    r = list(RAMPS[hue])
    if r[3] is None:
        r[3] = darker(r[2], 0.12)
    return r + [darker(r[3], 0.12), darker(r[3], 0.24)]


def token(t):
    """'sky.shade' -> hex; '#hex' -> itself; 'ink' / 'cream'."""
    if t.startswith('#'):
        return t.upper()
    if t == 'ink':
        return INK
    hue, _, step = t.partition('.')
    return ramp(hue)[STEPS.index(step or 'base')]


def shade_of(t):
    """The cel shade for a palette token: the next step down its ramp (base -> shade, shade -> deep)."""
    if t.startswith('#') or t == 'ink':
        return darker(token(t), 0.12) if t != 'ink' else INK
    hue, _, step = t.partition('.')
    i = STEPS.index(step or 'base')
    return ramp(hue)[min(len(STEPS) - 1, max(3, i + 1))]


def nearest_token(h):
    """For a felt colour the palette map doesn't name: the closest palette colour in OKLab."""
    L0, a0, b0 = hex_to_oklab(h)
    best, bd = 'stone.base', 9
    for hue in RAMPS:
        for i, c in enumerate(ramp(hue)):
            L, a, b = hex_to_oklab(c)
            d = (L - L0) ** 2 + 2 * ((a - a0) ** 2 + (b - b0) ** 2)
            if d < bd:
                best, bd = f'{hue}.{STEPS[i]}', d
    return best


# ---------------------------------------------------------------- the styles
# felt colour (as the kit and render_story.py write it) -> palette token. Anything not listed goes to the nearest
# palette colour, so every set and character works; the lighthouse + fox scene is listed in full.
CARTOON_MAP = {
    # skies (render_story.TIMES top/bottom) -> the kit's sky keys
    '#0b1238': SKY_KEYS['night'][0], '#4166c4': SKY_KEYS['night'][1],
    '#232a66': SKY_KEYS['dusk'][0], '#f0a08a': SKY_KEYS['dusk'][1],
    '#7da4e0': SKY_KEYS['dawn'][0], '#ffd2a6': SKY_KEYS['dawn'][1],
    '#5fb0ea': SKY_KEYS['day'][0], '#d6f0fb': SKY_KEYS['day'][1],
    # lights in the sky
    '#fff6d8': 'cream.base', '#fff1c2': 'spark.tint', '#ffe7a3': 'spark.tint', '#f1dc9e': 'spark.light',
    '#f1d995': 'spark.light', '#ffe9b0': 'spark.tint', '#ffd75e': 'spark.base', '#ffcf4d': 'spark.base',
    '#f5ead0': 'cream.base', '#ffa726': 'spark.tint',
    # clouds (night, day)
    '#eef2fd': 'snow.light', '#c6d3f3': 'snow.base', '#9fb3e3': 'snow.shade',
    '#ffffff': 'snow.tint', '#e8f1fb': 'snow.light', '#cfe0f4': 'snow.base',
    # sea and far hills: the sky hue, deep at night
    '#2b4fa8': 'sky.deep', '#3a63c4': 'sky.shade', '#2a4a9a': 'sky.deep', '#4c78d6': 'sky.shade', '#1f3d88': 'sky.night',
    '#2f4f8a': 'sky.night', '#3a5c96': 'sky.deep',
    # shore
    '#2f3b6a': 'cocoa.light', '#c7a77a': 'cocoa.light', '#3f5f86': 'mint.shade', '#4a6b8f': 'mint.deep',
    '#5b6085': 'stone.base', '#6b7095': 'stone.light', '#6b6f8a': 'stone.base', '#585c78': 'stone.shade',
    '#7b7f99': 'stone.light',
    # lighthouse
    '#d9453b': 'coral.base', '#c93a32': 'coral.base', '#f6efe2': 'cream.base', '#5a3a2b': 'cocoa.base',
    '#3b3f58': 'sky.deep', '#ffc76b': 'spark.light', '#ffd27a': 'spark.light', '#ffcf70': 'spark.light',
    '#ffc25e': 'spark.light',
    # boat
    '#e2a24a': 'cocoa.light', '#6b4532': 'cocoa.base', '#fbf3e3': 'cream.base',
    # characters: the kit's fox is peach with a cream belly (oomba-kit.js species defaults)
    '#e07a32': 'peach.base', '#fbf1e4': 'cream.base', '#3b2a2a': 'cocoa.shade', '#15131c': 'ink', '#1d1416': 'ink',
    '#f29aa6': 'coral.light', '#e46c86': 'coral.base', '#f4a7b5': 'coral.light', '#b7b2c4': 'stone.light',
    '#ece6f2': 'cream.base', '#8a6a4f': 'cocoa.base', '#e9d5b3': 'peach.tint', '#c9a77d': 'cocoa.light',
    '#6e523c': 'cocoa.shade', '#e8a33d': 'spark.shade', '#f7ecd2': 'cream.base', '#efe7dc': 'cream.base',
    '#7a5236': 'cocoa.base',
}

STYLES = {
    'felt': {
        'about': 'felt and paper: sheen, fibres, mottling; soft warm light, depth of field, bloom (feltkit.py)',
    },
    'cartoon': {
        'about': 'Oomba Ink: flat kit colours, one hard cel shade, Ink outline, contact shadows',
        'map': CARTOON_MAP,
        'light': (-0.55, -0.45, 0.70),   # towards the light: top-left, a little in front (Ink: light at top-start)
        'shade_at': 0.12,                # dot(normal, light) below this is in shade
        'rim': 0.22,                     # Cream rim on the lit edge (the kit's 3D bridge: Cream, 0.22)
        'line_px': 4.0,                  # Ink line at 720p (kit 3D: clamp(0.0055 h, 2.2, 5) px)
        'line_min_px': 1.4,
        'line_frac': 0.05,               # ...but at most 5% of the object's height on screen
        'glow': 1.35,                    # emission strength of lamps, moon, windows (bloom above 1.0)
        'beam': 0.42,
        'contact': 0.30,                 # contact shadow: Ink at 30% at night, 18% by day
        'samples': 8,
        'bloom': (1.0, 0.45),            # threshold, strength
        'scale': 1,
    },
    'pixel': {
        'about': 'pixel art: cartoon colours at 1/4 size, no anti-aliasing, 1 px Ink line, fixed palette, x4 nearest',
        'map': CARTOON_MAP,
        'light': (-0.55, -0.45, 0.70),
        'shade_at': 0.12,
        'rim': 0.0,
        'line_px': 1.0,
        'line_min_px': 0.0,
        'line_frac': 0.08,
        'glow': 1.0,
        'beam': 0.5,
        'contact': 0.30,
        'samples': 1,
        'bloom': None,
        'scale': 4,                      # render at 1/4 (1280x720 -> 320x180), upscale x4 nearest neighbour
        'dither': 0.045,                 # ordered (Bayer 4x4) dither spread, sRGB units
        # the fixed palette (32): Ink, the kit colours the map uses, and the night sky between its two keys
        'palette': [
            INK, '#FFFDF2', '#E0DDD2', '#FFFFFF', '#F4F7FA', '#DDE6EE', '#B4C3D1',
            '#C6C2B5', '#8F8A7C', '#5E5A50', '#BF957A', '#8A5A3C', '#5C3A26',
            '#FFC89E', '#F5A26B', '#C9713A', '#FF9C8F', '#FF6B5B', '#C8402F',
            '#FFF3C4', '#FFE27A', '#FFD23F', '#C99A00',
            '#4FA8F0', '#2F6FC8', '#1F54A8', '#12397A', '#1F9D63', '#0F7A48',
            '#0E2A2E', '#12323A', '#163B3A',
        ],
    },
}
NAMES = tuple(STYLES)
DEFAULT = 'felt'

# the current style's settings (feltkit.set_style picks it)
CUR = {'name': DEFAULT}


def check(name):
    name = (name or DEFAULT).lower()
    if name not in STYLES:
        raise ValueError(f'unknown style {name!r}; one of {NAMES}')
    return name


def use(name):
    name = check(name)
    CUR.clear()
    CUR.update(STYLES[name])
    CUR['name'] = name
    return name


def palette_token(felt_hex):
    m = CUR.get('map') or {}
    return m.get(felt_hex.lower()) or nearest_token(felt_hex)


# ---------------------------------------------------------------- materials (cartoon / pixel)
_MATS = {}


def _new(name, key):
    if key in _MATS and _MATS[key].name in bpy.data.materials:
        return None, _MATS[key]
    mat = bpy.data.materials.new(name)
    _MATS[key] = mat
    nt, N, L = K._nodes(mat)
    return (nt, N, L), mat


def toon(tok, ink=True):
    """Flat fill, one hard shade away from the fixed light, a Cream rim on the lit edge. Emission only, so the
    colour on screen is the palette colour exactly (Standard view transform) and no light is needed."""
    base, shade = token(tok), shade_of(tok)
    got, mat = _new(f'toon_{tok}', ('toon', tok, CUR['name']))
    if got is None:
        return mat
    nt, N, L = got
    out = N.new('ShaderNodeOutputMaterial')
    geo = N.new('ShaderNodeNewGeometry')
    dot = N.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    lx, ly, lz = CUR['light']
    n = math.sqrt(lx * lx + ly * ly + lz * lz)
    dot.inputs[1].default_value = (lx / n, ly / n, lz / n)
    L.new(geo.outputs['Normal'], dot.inputs[0])
    lit = N.new('ShaderNodeMath')
    lit.operation = 'GREATER_THAN'
    lit.inputs[1].default_value = CUR['shade_at']
    L.new(dot.outputs['Value'], lit.inputs[0])
    mix = N.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs[6].default_value = K.hexcol(shade)
    mix.inputs[7].default_value = K.hexcol(base)
    L.new(lit.outputs['Value'], mix.inputs['Factor'])
    col = mix.outputs[2]
    if CUR.get('rim'):
        # a thin Cream rim where the lit side turns away from the camera
        lw = N.new('ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.25
        edge = N.new('ShaderNodeMath')
        edge.operation = 'GREATER_THAN'
        edge.inputs[1].default_value = 0.62
        L.new(lw.outputs['Facing'], edge.inputs[0])
        both = N.new('ShaderNodeMath')
        both.operation = 'MULTIPLY'
        L.new(edge.outputs['Value'], both.inputs[0])
        L.new(lit.outputs['Value'], both.inputs[1])
        k = N.new('ShaderNodeMath')
        k.operation = 'MULTIPLY'
        k.inputs[1].default_value = CUR['rim']
        L.new(both.outputs['Value'], k.inputs[0])
        rim = N.new('ShaderNodeMix')
        rim.data_type = 'RGBA'
        L.new(k.outputs['Value'], rim.inputs['Factor'])
        L.new(col, rim.inputs[6])
        rim.inputs[7].default_value = K.hexcol(CREAM)
        col = rim.outputs[2]
    em = N.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    L.new(col, em.inputs['Color'])
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    mat['ink'] = ink
    return mat


def flat(tok, strength=1.0, ink=True):
    """One colour, no shade (eyes, noses, lamps; strength > 1 blooms)."""
    got, mat = _new(f'flat_{tok}', ('flat', tok, strength, CUR['name']))
    if got is None:
        return mat
    nt, N, L = got
    out = N.new('ShaderNodeOutputMaterial')
    em = N.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = K.hexcol(token(tok))
    em.inputs['Strength'].default_value = strength
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    mat['ink'] = ink
    return mat


def bands(tok, strength, axis, power, name):
    """feltkit.haze in three hard steps: a cartoon light beam / halo (rings, not a smooth fade)."""
    mat = bpy.data.materials.new(name)
    nt, N, L = K._nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    tc = N.new('ShaderNodeTexCoord')
    if axis == 'radial':
        grad = N.new('ShaderNodeTexGradient')
        grad.gradient_type = 'SPHERICAL'
        L.new(tc.outputs['Object'], grad.inputs['Vector'])
        fac = grad.outputs['Fac']
    else:
        sep = N.new('ShaderNodeSeparateXYZ')
        L.new(tc.outputs['Generated'], sep.inputs['Vector'])
        lw = N.new('ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.5
        inv = N.new('ShaderNodeMath')
        inv.operation = 'SUBTRACT'
        inv.inputs[0].default_value = 1.0
        L.new(lw.outputs['Facing'], inv.inputs[1])
        m = N.new('ShaderNodeMath')
        m.operation = 'MULTIPLY'
        L.new(sep.outputs['Z'], m.inputs[0])
        L.new(inv.outputs['Value'], m.inputs[1])
        fac = m.outputs['Value']
    pw = N.new('ShaderNodeMath')
    pw.operation = 'POWER'
    pw.inputs[1].default_value = max(0.6, power * 0.5)
    L.new(fac, pw.inputs[0])
    r = N.new('ShaderNodeValToRGB')
    r.color_ramp.interpolation = 'CONSTANT'
    els = r.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0, 0, 0, 1)
    els[1].position, els[1].color = 0.18, (0.7, 0.7, 0.7, 1)
    e = els.new(0.5)
    e.color = (1, 1, 1, 1)
    L.new(pw.outputs['Value'], r.inputs['Fac'])
    k = N.new('ShaderNodeMath')
    k.operation = 'MULTIPLY'
    k.inputs[1].default_value = min(1.0, strength)
    L.new(r.outputs['Color'], k.inputs[0])
    a_out = k.outputs['Value']
    if CUR.get('scale', 1) > 1:
        # pixel: no half-see-through colours (they'd snap to grey); a 2x2 Bayer screen door instead, in real
        # pixels (finish() sets the pixel size), the way pixel art draws a light beam
        tc2 = N.new('ShaderNodeTexCoord')
        sp = N.new('ShaderNodeSeparateXYZ')
        L.new(tc2.outputs['Window'], sp.inputs['Vector'])
        bits = []
        for axis_out, nm in ((sp.outputs['X'], 'px_x'), (sp.outputs['Y'], 'px_y')):
            mul = N.new('ShaderNodeMath')
            mul.operation = 'MULTIPLY'
            mul.name = nm
            mul.inputs[1].default_value = 320.0 if nm == 'px_x' else 180.0
            L.new(axis_out, mul.inputs[0])
            fl = N.new('ShaderNodeMath')
            fl.operation = 'FLOOR'
            L.new(mul.outputs['Value'], fl.inputs[0])
            md = N.new('ShaderNodeMath')
            md.operation = 'FLOORED_MODULO'
            md.inputs[1].default_value = 2.0
            L.new(fl.outputs['Value'], md.inputs[0])
            bits.append(md.outputs['Value'])
        dif = N.new('ShaderNodeMath')
        dif.operation = 'SUBTRACT'
        L.new(bits[0], dif.inputs[0])
        L.new(bits[1], dif.inputs[1])
        ab = N.new('ShaderNodeMath')
        ab.operation = 'ABSOLUTE'
        L.new(dif.outputs['Value'], ab.inputs[0])
        idx = N.new('ShaderNodeMath')  # 2*|x-y| + y  ->  [[0, 2], [3, 1]]
        idx.operation = 'MULTIPLY_ADD'
        L.new(ab.outputs['Value'], idx.inputs[0])
        idx.inputs[1].default_value = 2.0
        L.new(bits[1], idx.inputs[2])
        th = N.new('ShaderNodeMath')
        th.operation = 'MULTIPLY_ADD'
        L.new(idx.outputs['Value'], th.inputs[0])
        th.inputs[1].default_value = 0.25
        th.inputs[2].default_value = 0.125
        gt = N.new('ShaderNodeMath')
        gt.operation = 'GREATER_THAN'
        L.new(a_out, gt.inputs[0])
        L.new(th.outputs['Value'], gt.inputs[1])
        a_out = gt.outputs['Value']
    # a flat, see-through light (paint over the sky, not light added to it: no green tint on a teal night)
    em = N.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = K.hexcol(token(tok))
    tr = N.new('ShaderNodeBsdfTransparent')
    mix = N.new('ShaderNodeMixShader')
    L.new(a_out, mix.inputs[0])
    L.new(tr.outputs['BSDF'], mix.inputs[1])
    L.new(em.outputs['Emission'], mix.inputs[2])
    L.new(mix.outputs['Shader'], out.inputs['Surface'])
    K._blended(mat)
    mat['ink'] = False
    return mat


def sky(top, bottom):
    """The backdrop: the kit's sky gradient, plain (no paper tooth)."""
    mat = bpy.data.materials.new('sky')
    nt, N, L = K._nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Generated'], sep.inputs['Vector'])
    r = N.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].color = K.hexcol(token(palette_token(bottom)))
    r.color_ramp.elements[0].position = 0.18
    r.color_ramp.elements[1].color = K.hexcol(token(palette_token(top)))
    r.color_ramp.elements[1].position = 0.85
    L.new(sep.outputs['Z'], r.inputs['Fac'])
    em = N.new('ShaderNodeEmission')
    L.new(r.outputs['Color'], em.inputs['Color'])
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    mat['ink'] = False
    return mat


def material(kind, color, emit=0.0, emit_color=None, strength=1.0, axis='radial', power=2.0, name=None, top=None, bottom=None):
    """What feltkit asks for when the style isn't felt."""
    if kind == 'sky':
        return sky(top, bottom)
    if kind == 'haze':
        return bands(palette_token(color), strength * CUR['beam'], axis, power, name or 'haze')
    if kind == 'glow':
        return flat(palette_token(color), CUR['glow'] if strength >= 2.5 else 1.0)
    tok = palette_token(emit_color or color) if emit >= 0.8 else palette_token(color)
    if emit >= 0.8:  # lit things (moon, glowing stars): flat and bright
        return flat(tok, CUR['glow'] if emit >= 1.5 else 1.0)
    if kind == 'glossy':
        return flat(tok)
    return toon(tok)


# ---------------------------------------------------------------- lighting, line, render settings
NO_LINE = ('sky', 'starfield', 'glint', 'eye', 'cheek', 'crater', 'thread', 'moon_halo', 'lh_beam', 'nose', 'fly',
           'contact', 'lh_window', 'tuft', 'pebble')


def _ink_mat():
    got, mat = _new('ink_line', ('ink', CUR['name']))
    if got is None:
        return mat
    nt, N, L = got
    out = N.new('ShaderNodeOutputMaterial')
    em = N.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = K.hexcol(INK)
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    mat.use_backface_culling = True
    return mat


def _contact_mat(alpha):
    mat = bpy.data.materials.new('contact')
    nt, N, L = K._nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    em = N.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = K.hexcol(INK)
    tr = N.new('ShaderNodeBsdfTransparent')
    mix = N.new('ShaderNodeMixShader')
    mix.inputs[0].default_value = alpha
    L.new(tr.outputs['BSDF'], mix.inputs[1])
    L.new(em.outputs['Emission'], mix.inputs[2])
    L.new(mix.outputs['Shader'], out.inputs['Surface'])
    K._blended(mat)
    return mat


def add_lines(cam, width, height):
    """Ink outline: an inverted hull (Solidify, flipped, back faces culled) on every inked object, as thick as
    line_px pixels at that object's distance (so the line has the same weight near and far), thinner on small
    things (line_frac of their height on screen)."""
    ink = _ink_mat()
    cd = cam.data
    ortho = cd.type == 'ORTHO'
    focal_px = width * cd.lens / cd.sensor_width
    cpos = cam.matrix_world.translation
    for ob in list(bpy.data.objects):
        if ob.type != 'MESH' or not ob.data.materials or any(s in ob.name for s in NO_LINE):
            continue
        for m in [m for m in ob.modifiers if m.name.startswith('ink')]:
            ob.modifiers.remove(m)
        mat = ob.data.materials[0]
        if not mat or not mat.get('ink'):
            continue
        mw = ob.matrix_world
        dist = max(0.5, (mw.translation - cpos).length)
        if ortho:  # same pixels-per-unit everywhere: pretend every object is at the distance that gives it
            focal_px, dist = width / cd.ortho_scale, 1.0
        sc = mw.to_scale()
        dims = [abs(d) for d in ob.dimensions] if ob.dimensions.length else [1, 1, 1]
        size_px = max(dims[2], min(dims[0], 6)) / dist * focal_px
        px = min(CUR['line_px'], CUR['line_frac'] * size_px)
        if px < max(0.5, CUR['line_min_px']):
            continue
        world = px * dist / focal_px
        mean = (abs(sc.x * sc.y * sc.z)) ** (1 / 3) or 1.0
        if ink.name not in [m.name for m in ob.data.materials if m]:
            ob.data.materials.append(ink)
        m = ob.modifiers.new('ink', 'SOLIDIFY')
        m.thickness = -world / mean
        m.offset = -1.0
        m.use_flip_normals = True
        m.use_rim = False
        m.use_even_offset = False
        m.material_offset = [x.name if x else '' for x in ob.data.materials].index(ink.name)
        m.use_quality_normals = True


def contact_shadows(alpha):
    mat = _contact_mat(alpha)
    for ob in list(bpy.data.objects):
        name = ob.name.rstrip('0123456789')
        if ob.parent is None and name in K.CHARACTERS and ob.type == 'EMPTY':
            d = K.prim('cyl', f'contact_{ob.name}', (0, -0.02, 0.012), (0.42, 0.3, 0.004), mat=mat, parent=ob, segs=32)
            d.visible_shadow = False


def finish(spec, sc_spec=None):
    """Once the scene is built: the style's light, line, camera and render settings. felt: nothing."""
    if CUR['name'] == 'felt':
        return
    sc = bpy.context.scene
    # light: none. The shade is in the materials; emission shows each colour as it is.
    for ob in [o for o in bpy.data.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(ob, do_unlink=True)
    if sc.world:
        bg = sc.world.node_tree.nodes.get('Background')
        bg.inputs['Strength'].default_value = 0.0
    sc.view_settings.view_transform = 'Standard'
    try:
        sc.view_settings.look = 'None'
    except Exception:
        pass
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    if sc.render.engine == 'BLENDER_EEVEE':
        sc.eevee.taa_render_samples = int(CUR['samples'])
        sc.eevee.use_shadows = False
    else:
        sc.cycles.samples = max(4, int(CUR['samples']))
        sc.cycles.use_denoising = False
    k = int(CUR.get('scale') or 1)
    if k > 1:
        sc.render.resolution_x = max(16, int(spec['width']) // k)
        sc.render.resolution_y = max(9, int(spec['height']) // k)
        sc.render.filter_size = 0.0
        for mat in bpy.data.materials:  # the screen-door dither counts real pixels
            if mat.node_tree:
                for nd in mat.node_tree.nodes:
                    if nd.name in ('px_x', 'px_y'):
                        nd.inputs[1].default_value = sc.render.resolution_x if nd.name == 'px_x' else sc.render.resolution_y
    # post: bloom on the lamps only (cartoon), nothing for pixel
    if CUR.get('bloom'):
        ng = sc.compositing_node_group
        gl = next((n for n in ng.nodes if n.bl_idname == 'CompositorNodeGlare'), None) if ng else None
        if gl:
            gl.inputs['Threshold'].default_value = CUR['bloom'][0]
            gl.inputs['Strength'].default_value = CUR['bloom'][1]
    else:
        sc.render.use_compositing = False
        sc.compositing_node_group = None
    cam = sc.camera
    if cam:
        cam.data.dof.use_dof = False
    for fn in K.ANIMS:  # pose everything at the start, so the line weights fit what the camera sees
        fn(0.0, 0)
    bpy.context.view_layer.update()
    tod = (sc_spec or {}).get('time', 'night')
    contact_shadows(CUR['contact'] if tod in ('night', 'dusk') else CUR['contact'] * 0.6)
    if cam:
        add_lines(cam, sc.render.resolution_x, sc.render.resolution_y)


# ---------------------------------------------------------------- post (pixel): palette + nearest upscale
BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def _srgb_arr(hexes):
    import numpy as np
    return np.array([[int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)] for h in hexes], dtype=np.float32)


def quantize(rgb, palette, dither=0.0):
    """rgb: HxWx3 float sRGB 0..1 -> nearest palette colour (OKLab-ish distance), with an ordered dither."""
    import numpy as np
    h, w, _ = rgb.shape
    if dither:
        b = (np.array(BAYER4, dtype=np.float32) + 0.5) / 16 - 0.5
        tile = np.tile(b, (h // 4 + 1, w // 4 + 1))[:h, :w]
        rgb = rgb + tile[..., None] * dither
    pal = _srgb_arr(palette)

    def lab(x):
        x = np.clip(x, 0, 1)
        lin = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
        M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566],
                       [0.0883024619, 0.2817188376, 0.6299787005]], dtype=np.float32)
        M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099],
                       [0.0259040371, 0.7827717662, -0.8086757660]], dtype=np.float32)
        return np.cbrt(lin @ M1.T) @ M2.T
    a = lab(rgb.reshape(-1, 3))
    p = lab(pal)
    d = ((a[:, None, :] - p[None, :, :]) ** 2 * np.array([1.0, 2.0, 2.0], dtype=np.float32)).sum(-1)
    return pal[d.argmin(1)].reshape(h, w, 3)


def read_png(path):
    import numpy as np
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1].copy()  # top row first


def write_png(path, rgba):
    import numpy as np
    h, w = rgba.shape[:2]
    if rgba.shape[2] == 3:
        rgba = np.concatenate([rgba, np.ones((h, w, 1), dtype=np.float32)], 2)
    img = bpy.data.images.new('post', w, h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1], dtype=np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def pixelate(rgba, palette, dither, scale):
    import numpy as np
    out = rgba.copy()
    out[..., :3] = quantize(rgba[..., :3], palette, dither)
    if rgba.shape[2] == 4:
        out[..., 3] = (rgba[..., 3] > 0.5).astype(np.float32)
    return np.repeat(np.repeat(out, scale, 0), scale, 1)


def post(spec, path, keep_small=None):
    """After each frame. pixel: snap to the palette, scale up x4 nearest neighbour to the spec's size."""
    if CUR['name'] != 'pixel':
        return
    import numpy as np
    small = pixelate(read_png(path), CUR['palette'], CUR['dither'], 1)
    if keep_small:
        write_png(keep_small, small)
    k = int(CUR['scale'])
    write_png(path, np.repeat(np.repeat(small, k, 0), k, 1))
