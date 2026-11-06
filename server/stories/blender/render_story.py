"""Render a story's scenes to PNG frames, headless, with Blender as a Python module (bpy).

    python3 render_story.py spec.json            render every scene in the spec
    python3 render_story.py --probe eevee|cycles  render one tiny frame and exit 0 if the engine works here

The spec (written by server/stories/renderer.js) is:
  { width, height, fps, step, engine: 'eevee'|'cycles', samples, out_dir,
    scenes: [{ id, set, time, props: [], characters: [{ kind, action, place, color }], camera, frames, seed, focus }] }
`frames` is the scene length in output frames (fps). With step 2 every other frame is rendered ("on twos", like
stop-motion) and the assembler holds each one for two frames.

Progress goes to stdout as one JSON object per line: {"scene": i, "frame": n, "of": total, "sec": s}.
"""
import json
import math
import os
import random
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import feltkit as K  # noqa: E402

PLACES = {'far_left': -3.3, 'left': -1.8, 'center': 0.0, 'right': 1.8, 'far_right': 3.3}

TIMES = {
    'night': dict(top='#0b1238', bottom='#4166c4', world='#1b2a5c', world_k=0.55, stars=1.0, moon=True,
                  key=(0.75, 0.82, 1.0), key_e=2.4, fill=(0.55, 0.62, 1.0)),
    'dusk': dict(top='#232a66', bottom='#f0a08a', world='#5a4a7a', world_k=0.6, stars=0.4, moon=True,
                 key=(1.0, 0.75, 0.6), key_e=3.0, fill=(0.6, 0.55, 0.9)),
    'dawn': dict(top='#7da4e0', bottom='#ffd2a6', world='#b9b4d0', world_k=0.8, stars=0.0, moon=False,
                 key=(1.0, 0.85, 0.7), key_e=4.0, fill=(0.8, 0.8, 1.0)),
    'day': dict(top='#5fb0ea', bottom='#d6f0fb', world='#cfe6f5', world_k=1.0, stars=0.0, moon=False,
                key=(1.0, 0.97, 0.9), key_e=5.0, fill=(0.85, 0.9, 1.0)),
}


def hexlin(h):
    return K.hexcol(h)[:3]


def setup_render(spec, tod):
    sc = bpy.context.scene
    sc.render.resolution_x = int(spec['width'])
    sc.render.resolution_y = int(spec['height'])
    sc.render.resolution_percentage = 100
    sc.render.fps = int(spec.get('fps', 24))
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.compression = 15
    engine = spec.get('engine', 'eevee')
    if engine == 'cycles':
        sc.render.engine = 'CYCLES'
        sc.cycles.device = 'CPU'
        sc.cycles.samples = int(spec.get('samples', 16))
        sc.cycles.use_denoising = True
        sc.cycles.max_bounces = 4
        sc.cycles.diffuse_bounces = 2
        sc.cycles.glossy_bounces = 1
        sc.cycles.transparent_max_bounces = 8
        try:
            sc.cycles.denoiser = 'OPENIMAGEDENOISE'
        except Exception:
            pass
    else:
        sc.render.engine = 'BLENDER_EEVEE'
        sc.eevee.taa_render_samples = int(spec.get('samples', 8))
        sc.eevee.use_shadows = True
        sc.eevee.shadow_ray_count = 1
        sc.eevee.shadow_step_count = 4
        sc.eevee.shadow_resolution_scale = float(spec.get('shadow_scale', 0.5))
        try:
            sc.eevee.use_raytracing = False
        except Exception:
            pass
    for vt in ('AgX', 'Filmic', 'Standard'):
        try:
            sc.view_settings.view_transform = vt
            break
        except Exception:
            continue
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    sc.view_settings.exposure = float(spec.get('exposure', 0.35))
    # world: soft coloured ambient light
    w = bpy.data.worlds.new('world')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = K.hexcol(tod['world'])
    bg.inputs['Strength'].default_value = tod['world_k']
    compositor(sc, spec)


def compositor(sc, spec):
    """Bloom on the glows (moon, lamp, windows, stars)."""
    if not spec.get('bloom', True):
        return
    try:
        ng = bpy.data.node_groups.new('comp', 'CompositorNodeTree')
        ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        rl = ng.nodes.new('CompositorNodeRLayers')
        gl = ng.nodes.new('CompositorNodeGlare')
        try:
            gl.inputs['Type'].default_value = 'Bloom'
        except Exception:
            pass
        for k, v in (('Threshold', 0.85), ('Strength', 0.55), ('Size', 0.6), ('Saturation', 1.0)):
            try:
                gl.inputs[k].default_value = v
            except Exception:
                pass
        out = ng.nodes.new('NodeGroupOutput')
        ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
        ng.links.new(gl.outputs['Image'], out.inputs[0])
        sc.compositing_node_group = ng
        sc.render.use_compositing = True
    except Exception as e:  # an older or newer Blender: no bloom rather than no video
        print(json.dumps({'warn': f'compositor: {e}'}), flush=True)


def lights(tod, rng):
    sc = bpy.context.scene
    key = bpy.data.lights.new('key', 'AREA')
    key.energy = 900 * tod['key_e'] / 3
    key.color = tod['key']
    key.size = 9
    ko = bpy.data.objects.new('key', key)
    K.link(ko)
    ko.location = (-7, -9, 11)
    ko.rotation_euler = (math.radians(50), 0, math.radians(-35))
    rim = bpy.data.lights.new('rim', 'AREA')
    rim.energy = 500
    rim.color = tod['fill']
    rim.size = 8
    ro = bpy.data.objects.new('rim', rim)
    K.link(ro)
    ro.location = (6, 6, 8)
    ro.rotation_euler = (math.radians(-40), math.radians(20), 0)
    fill = bpy.data.lights.new('fill', 'AREA')
    fill.energy = 380
    fill.color = tod['fill']
    fill.size = 12
    fo = bpy.data.objects.new('fill', fill)
    K.link(fo)
    fo.location = (4, -12, 3)
    fo.rotation_euler = (math.radians(85), 0, math.radians(20))


# ---------------------------------------------------------------- sets
def sky_layers(tod, rng, moon_at=(-6.5, 20, 7.2), clouds=True, many_stars=False, stars_hanging=True, props=()):
    K.backdrop(tod['top'], tod['bottom'])
    if tod['stars'] > 0:
        K.star_field(rng, count=int((420 if many_stars else 300) * tod['stars']))
    if tod['moon'] and ('moon' in props or True):
        K.moon(moon_at[0], moon_at[2], moon_at[1])
    if clouds:
        night = tod['stars'] > 0
        cols = ('#eef2fd', '#c6d3f3', '#9fb3e3') if night else ('#ffffff', '#e8f1fb', '#cfe0f4')
        K.cloud('cloudA', moon_at[0] + 1.0, 4.4, 18.5, 9.0, 1.9, rng, cols, drift=0.05)
        K.cloud('cloudB', 9.5, 6.8, 19.0, 7.5, 1.4, rng, cols, drift=-0.04)
        K.cloud('cloudC', -11.5, 2.6, 16.0, 7.0, 1.3, rng, cols, drift=0.03)
        K.cloud('cloudD', 3.0, 9.5, 20.5, 6.0, 1.1, rng, cols, drift=0.02)
    if stars_hanging and tod['stars'] > 0:
        spots = [(-8.5, 5.2, 12), (-4.6, 7.3, 9), (-1.2, 4.6, 14), (2.2, 6.4, 10), (5.0, 8.2, 13), (8.8, 5.9, 11), (-11, 7.6, 15), (11.5, 8.0, 15)]
        for i, (x, z, y) in enumerate(spots):
            K.hanging_star(f'hstar{i}', x + rng.uniform(-0.4, 0.4), z + rng.uniform(-0.4, 0.4), y, rng.uniform(0.32, 0.5), 22, rng)
            if rng.random() < 0.45:  # a pair on one thread, like the reference
                K.hanging_star(f'hstar{i}b', x + rng.uniform(-0.1, 0.1), z + 0.9, y + 0.05, rng.uniform(0.25, 0.32), 22, rng)


def set_lighthouse(tod, rng, props):
    sky_layers(tod, rng, moon_at=(-6.5, 20, 6.4), props=props)
    K.sea(14, 0.9, 70, rows=6)
    K.hills(17, 0.4, 70, 1.6, ['#2f4f8a', '#3a5c96'], 0.9, 'farhills', waves=2.5)
    K.rocks(4.6, 8.8, 0.2, 3.0, rng)
    K.lighthouse(4.6, 9.0, 0.35, h=3.1, beam=True)
    K.ground(-7.0, 0.0, 60, 10.0, '#c7a77a' if tod['stars'] == 0 else '#2f3b6a', rng, tufts=('#3f5f86', '#4a6b8f'), pebbles=('#5b6085', '#6b7095'))
    if 'boat' in props:
        K.boat(-6.0, 9.0, 0.35)


def set_village(tod, rng, props):
    sky_layers(tod, rng, moon_at=(6.5, 20, 7.0), props=props)
    K.hills(16, 0.0, 80, 3.2, ['#2c4f80', '#35608c', '#3f6f96'] if tod['stars'] else ['#7fb27a', '#93c48a', '#a8d39b'], 0.3, 'farhills')
    lit = tod['stars'] > 0
    cols = [('#f3d9b1', '#b9473f'), ('#d8e4f0', '#3f6db9'), ('#f6e3a1', '#7a4f9a'), ('#f0c9b4', '#4f8a5b'), ('#e9d6f0', '#c25a6a')]
    for i, x in enumerate([-7.5, -4.2, -1.0, 2.6, 6.2]):
        w, r = cols[i % len(cols)]
        K.house(f'house{i}', x, 7.5 + (i % 2) * 1.6, 0.1, 1.5 + rng.uniform(-0.2, 0.3), 1.3 + rng.uniform(-0.2, 0.4), w, r, lit)
    for i in range(7):
        K.tree(f'tree{i}', rng.uniform(-12, 12), rng.uniform(9.5, 12), 0.3, rng.uniform(1.4, 2.4), rng.choice(['pine', 'round']), rng.choice(['#2f6b4f', '#3f7f5a', '#4d8c63']), rng)
    K.ground(-7.0, 0.0, 60, 14.0, '#2c4a44' if lit else '#7db86c', rng)
    K.lantern(-1.6, 0.6, 0.0) if 'lantern' in props else None


def set_forest(tod, rng, props):
    sky_layers(tod, rng, moon_at=(-5.5, 20, 7.6), clouds=True, props=props)
    night = tod['stars'] > 0
    K.hills(17, 0.0, 80, 3.6, ['#2a4a70', '#30577c'] if night else ['#6aa673', '#7fb886'], 1.2, 'farhills')
    greens = ['#1f5a46', '#2b6b52', '#2f7a58', '#3c8a62'] if night else ['#3f8a55', '#4e9b60', '#5aa86a', '#2f7a4a']
    for layer, (y, n, hmin, hmax) in enumerate([(13, 14, 2.6, 3.6), (9.5, 11, 2.2, 3.2), (6.5, 7, 1.8, 2.8), (3.5, 4, 1.6, 2.4)]):
        for i in range(n):
            x = -14 + 28 * (i + rng.uniform(0.1, 0.9)) / n
            if layer == 3 and abs(x) < 3.2:
                continue
            K.tree(f'ft{layer}_{i}', x, y + rng.uniform(-0.6, 0.6), 0.1, rng.uniform(hmin, hmax), rng.choice(['pine', 'pine', 'round']), greens[(layer + i) % len(greens)], rng)
    K.ground(-7.0, 0.0, 60, 12.0, '#26402f' if night else '#6fa862', rng, tufts=('#2f6b4f', '#3c7a55'))
    if night or 'fireflies' in props:
        fireflies(rng)


def fireflies(rng, n=18):
    for i in range(n):
        ob = K.prim('sphere', f'fly{i}', (rng.uniform(-8, 8), rng.uniform(1, 8), rng.uniform(0.6, 3.5)), (0.05, 0.05, 0.05), mat=K.glow('#ffe58a', 8.0), segs=8)
        x0, z0, ph = ob.location.x, ob.location.z, rng.uniform(0, 6.28)
        K.anim(lambda t, f, o=ob, x0=x0, z0=z0, ph=ph: (setattr(o.location, 'x', x0 + math.sin(t * 0.5 + ph) * 0.6),
                                                       setattr(o.location, 'z', z0 + math.sin(t * 0.8 + ph * 2) * 0.3)))


def set_meadow(tod, rng, props):
    sky_layers(tod, rng, moon_at=(6.0, 20, 7.4), props=props)
    night = tod['stars'] > 0
    K.hills(15, 0.0, 80, 3.0, ['#4a5a92', '#55689c', '#6276a6'] if night else ['#8cc77f', '#9fd28f', '#b5dd9f'], 2.0, 'farhills', waves=2.2)
    K.tree('bigtree', 6.5, 5.0, 0.2, 3.6, 'round', '#3f7f5a' if night else '#5aa86a', rng)
    flower_cols = ['#f29aa6', '#fbe28a', '#ffffff', '#b8a4f0']
    for i in range(40):
        x, y = rng.uniform(-12, 12), rng.uniform(-0.8, 6)
        if abs(x) < 3.4 and y < 1.5:
            continue
        K.prim('cyl', f'flower{i}', (x, y, 0.06), (0.09, 0.09, 0.02), (math.pi / 2 - 0.3, 0, 0), mat=K.felt(rng.choice(flower_cols)), segs=10)
    K.ground(-7.0, 0.0, 60, 14.0, '#3f5577' if night else '#7db86c', rng)
    if night:
        fireflies(rng, 10)


def set_sky(tod, rng, props):
    sky_layers(tod, rng, moon_at=(5.5, 18, 6.5), many_stars=True, props=props)
    # a big cloud to stand on, in front
    night = tod['stars'] > 0
    cols = ('#e6ecfb', '#c3d0f1', '#9bb0e0') if night else ('#ffffff', '#eef4fb', '#d6e4f4')
    K.cloud('standcloud', 0.0, -1.0, -0.6, 14.0, 1.3, rng, cols)
    K.cloud('midcloud1', -8.0, 1.0, 8.0, 8.0, 1.6, rng, cols, drift=0.04)
    K.cloud('midcloud2', 9.0, 2.0, 10.0, 7.0, 1.4, rng, cols, drift=-0.04)


SETS = {'lighthouse': set_lighthouse, 'village': set_village, 'forest': set_forest, 'meadow': set_meadow, 'sky': set_sky}


# ---------------------------------------------------------------- camera
def camera(move, frames, fps, focus_obj, lens=45):
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    cam.dof.use_dof = True
    cam.dof.aperture_fstop = 0.9
    cam.dof.aperture_blades = 7
    co = bpy.data.objects.new('cam', cam)
    K.link(co)
    bpy.context.scene.camera = co
    base = dict(x=0.0, y=-10.5, z=1.9, rx=89.5, rz=0.0)
    a, b = dict(base), dict(base)
    if move == 'slow_push':
        b.update(y=-7.6, z=1.6)
    elif move == 'pull_back':
        a.update(y=-7.6, z=1.6)
    elif move == 'pan_left':
        a.update(x=1.8)
        b.update(x=-1.8)
    elif move == 'pan_right':
        a.update(x=-1.8)
        b.update(x=1.8)
    elif move == 'tilt_up':
        a.update(rx=87.0)
        b.update(rx=94.5, z=2.3)
    elif move == 'tilt_down':
        a.update(rx=94.5, z=2.3)
        b.update(rx=87.0)
    else:  # 'drift' / 'static': a slow float
        b.update(x=0.35, y=-10.0)
    dur = frames / fps

    def go(t, f):
        u = max(0.0, min(1.0, t / dur))
        e = u * u * (3 - 2 * u)
        v = {k: a[k] + (b[k] - a[k]) * e for k in a}
        co.location = (v['x'] + math.sin(t * 0.4) * 0.05, v['y'], v['z'] + math.sin(t * 0.55) * 0.04)
        co.rotation_euler = (math.radians(v['rx']), 0, math.radians(v['rz']))
        if focus_obj is not None:
            cam.dof.focus_distance = max(1.0, (focus_obj.matrix_world.translation - co.location).length)
        else:
            cam.dof.focus_distance = 12.0
    K.anim(go)
    return co


# ---------------------------------------------------------------- one scene
def build_scene(spec, sc_spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    K.reset()
    rng = random.Random(int(sc_spec.get('seed', 1)))
    tod = TIMES.get(sc_spec.get('time'), TIMES['night'])
    setup_render(spec, tod)
    props = set(sc_spec.get('props') or [])
    SETS.get(sc_spec.get('set'), set_lighthouse)(tod, rng, props)
    lights(tod, rng)
    fps = int(spec.get('fps', 24))
    frames = int(sc_spec['frames'])
    dur = frames / fps
    focus = None
    chars = sc_spec.get('characters') or []
    for i, c in enumerate(chars[:3]):
        kind = c.get('kind') if c.get('kind') in K.CHARACTERS else 'mouse'
        maker = K.CHARACTERS[kind]
        root, body, head = maker(f'{kind}{i}', *( [c['color']] if c.get('color') else []))
        scale = {'mouse': 1.0, 'bunny': 1.05, 'fox': 1.15, 'owl': 1.0}[kind]
        root.scale = (scale, scale, scale)
        x1 = PLACES.get(c.get('place'), [-1.4, 1.4, 0.0][i % 3])
        action = c.get('action') or 'idle'
        x0 = x1
        if action in ('walk', 'walk_in', 'hold_star'):
            x0 = x1 - 3.5 if x1 <= 0 else x1 + 3.5
            if action == 'hold_star':
                x0 = x1 - 1.5 if x1 <= 0 else x1 + 1.5
        elif action == 'walk_out':
            x0, x1 = x1, x1 + (4.0 if x1 >= 0 else -4.0)
        elif action == 'fly':
            x0 = x1 + (2.5 if x1 <= 0 else -2.5)
        y = 0.25 + i * 0.35
        root.location = (x0, y, 0)
        # face the camera, turned a little towards the middle
        root.rotation_euler.z = 0.25 if x1 < 0 else -0.25 if x1 > 0 else 0
        start = 0.3 + i * 0.4
        walk_dur = min(dur * 0.55, 4.5)
        K.act(root, body, head, action, x0, x1, start, walk_dur, phase=i * 1.7, kind=kind, z0=0.0)
        if focus is None or c.get('kind') == sc_spec.get('focus'):
            focus = head
        if action in ('idle', 'wave', 'look_up', 'sleep', 'hop'):
            rz = root.rotation_euler.z
            K.anim(lambda t, f, r=root, rz=rz: setattr(r.rotation_euler, 'z', rz))
    camera(sc_spec.get('camera') or 'drift', frames, fps, focus)
    # Only the key light casts shadows: every shadowed light costs a shadow map per frame, and on a CPU renderer
    # that is most of the frame time. The glows (moon, lamp, windows) are fine without.
    for l in bpy.data.lights:
        if l.name != 'key' or spec.get('shadows') is False:
            l.use_shadow = False
    return frames


def render_scene(spec, idx, sc_spec):
    frames = build_scene(spec, sc_spec)
    fps = int(spec.get('fps', 24))
    step = max(1, int(spec.get('step', 2)))
    out = os.path.join(spec['out_dir'], sc_spec['id'])
    os.makedirs(out, exist_ok=True)
    sc = bpy.context.scene
    todo = list(range(0, frames, step))
    if spec.get('only_frames'):  # previews and tests: just these frames of each scene
        todo = [min(frames - 1, int(x)) for x in spec['only_frames']]
    t0 = time.time()
    for n, f in enumerate(todo):
        t = f / fps
        for fn in K.ANIMS:
            fn(t, f)
        bpy.context.view_layer.update()
        sc.render.filepath = os.path.join(out, f'f_{n:05d}.png')
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print(json.dumps({'scene': idx, 'frame': n + 1, 'of': len(todo), 'sec': round(time.time() - t1, 3)}), flush=True)
    return {'scene': idx, 'frames': len(todo), 'seconds': round(time.time() - t0, 2)}


def probe(engine):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    spec = {'width': 32, 'height': 18, 'engine': engine, 'samples': 1, 'bloom': False}
    setup_render(spec, TIMES['night'])
    K.prim('sphere', 'p', mat=K.felt('#ff8800'))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    K.link(cam)
    cam.location = (0, -5, 0)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.scene.camera = cam
    path = os.path.join(os.environ.get('TMPDIR', '/tmp'), f'story-probe-{os.getpid()}.png')
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    ok = os.path.exists(path)
    if ok:
        os.remove(path)
    print(json.dumps({'probe': engine, 'ok': ok}), flush=True)
    return ok


def main(argv):
    if len(argv) >= 2 and argv[0] == '--probe':
        sys.exit(0 if probe(argv[1]) else 1)
    with open(argv[0]) as fh:
        spec = json.load(fh)
    only = int(argv[1]) if len(argv) > 1 else None
    summary = []
    for i, s in enumerate(spec['scenes']):
        if only is not None and i != only:
            continue
        summary.append(render_scene(spec, i, s))
    print(json.dumps({'done': True, 'scenes': summary}), flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
