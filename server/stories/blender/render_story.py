"""Render a story's scenes to PNG frames, headless, with Blender as a Python module (bpy).

    python3 render_story.py spec.json            render every scene in the spec
    python3 render_story.py --probe eevee|cycles  render one tiny frame and exit 0 if the engine works here
    python3 render_story.py --kit                 print what the kit can build (checked against catalog.json)

The spec (written by server/stories/renderer.js) is:
  { width, height, fps, step, engine: 'eevee'|'cycles', samples, out_dir, look?: 'felt'|'comic',
    scenes: [{ id, set, time, props: [], characters: [{ kind, action, place, who?, look?, holds? }], camera, frames, seed, focus }] }
`look` is how the whole story is drawn: felt (felt and paper, the default) or comic (tools/blender/comic_look.py: ink
lines, muted cel colour, drawn faces). A character's `look` is something else: a person's hair, skin and clothes.
The sets, characters, actions and props are the felt kit in tools/blender (felt_sets, felt_people, felt_animals,
felt_actions, felt_props), placed by felt_stage.stage().
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

# The felt-and-paper kit is shared with the other Blender tools: tools/blender/feltkit.py (and styles.py) is the one
# copy. Looked up in STORY_KIT_DIR, then the repository's tools/blender, then next to this file (the Modal image puts
# the kit beside it).
_HERE = os.path.dirname(os.path.abspath(__file__))
for _d in (os.environ.get('STORY_KIT_DIR'), os.path.join(_HERE, '..', '..', '..', 'tools', 'blender'), _HERE):
    if _d and os.path.exists(os.path.join(_d, 'feltkit.py')):
        sys.path.insert(0, os.path.abspath(_d))
        break
import feltkit as K  # noqa: E402
import felt_sets  # noqa: E402
import felt_stage  # noqa: E402

SETS = felt_sets.SETS
PLACES = felt_stage.PLACES

TIMES = {
    'night': dict(top='#0b1238', bottom='#4166c4', world='#1b2a5c', world_k=0.55, stars=1.0, moon=True,
                  key=(0.75, 0.82, 1.0), key_e=2.4, fill=(0.55, 0.62, 1.0)),
    'dusk': dict(top='#232a66', bottom='#f0a08a', world='#5a4a7a', world_k=0.6, stars=0.4, moon=True,
                 key=(1.0, 0.75, 0.6), key_e=3.0, fill=(0.6, 0.55, 0.9)),
    # Daylight uses the Standard view: AgX/Filmic grey out the bright day colours (felt reads milky); night keeps AgX.
    'dawn': dict(top='#7da4e0', bottom='#ffd2a6', world='#b9b4d0', world_k=0.6, stars=0.0, moon=False,
                 key=(1.0, 0.85, 0.7), key_e=3.6, fill=(0.8, 0.8, 1.0), view='Standard', exposure=-0.1),
    'day': dict(top='#5fb0ea', bottom='#d6f0fb', world='#cfe6f5', world_k=0.7, stars=0.0, moon=False,
                key=(1.0, 0.97, 0.9), key_e=4.4, fill=(0.85, 0.9, 1.0), view='Standard', exposure=-0.1),
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
        if os.environ.get('STORY_CYCLES_DEVICE') == 'GPU':   # Modal's NVIDIA GPUs: OptiX, else CUDA
            try:
                prefs = bpy.context.preferences.addons['cycles'].preferences
                for kind in ('OPTIX', 'CUDA'):
                    try:
                        prefs.compute_device_type = kind
                        prefs.get_devices()
                        gpus = [d for d in prefs.devices if d.type == kind]
                        if gpus:
                            for d in prefs.devices:
                                d.use = d.type == kind
                            sc.cycles.device = 'GPU'
                            break
                    except Exception:
                        continue
            except Exception as e:
                print(json.dumps({'warn': f'cycles gpu: {e}'}), flush=True)
        # a path tracer needs more samples than EEVEE's anti-aliasing passes; the denoiser cleans up the rest
        sc.cycles.samples = max(16, int(spec.get('samples', 16))) if spec.get('width', 0) >= 640 else max(4, int(spec.get('samples', 4)))
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
    for vt in ((tod['view'],) if tod.get('view') else ('AgX', 'Filmic', 'Standard')):
        try:
            sc.view_settings.view_transform = vt
            break
        except Exception:
            continue
    try:
        sc.view_settings.look = 'None' if tod.get('view') else 'AgX - Medium High Contrast'
    except Exception:
        pass
    sc.view_settings.exposure = float(spec.get('exposure', tod.get('exposure', 0.35)))
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


# ---------------------------------------------------------------- camera
CAMERAS = ('drift', 'slow_push', 'pull_back', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'two_shot', 'over_shoulder')
# film framings that follow the cast (both looks): a two-shot (everyone from the waist up, a slow push in) and an
# over-the-shoulder shot (past the first character's shoulder at the one they talk to)
CAST_SHOTS = ('two_shot', 'over_shoulder')


def cast_now(frames, fps):
    """Where the characters are once they have arrived (60% into the scene): [(x, y, height)], in the script's order."""
    roots = [o for o in bpy.data.objects if o.type == 'EMPTY' and o.parent is None and 'height' in o.keys()]
    t = frames / fps * 0.6
    for fn in K.ANIMS:
        fn(t, int(t * fps))
    bpy.context.view_layer.update()
    out = [(o.matrix_world.translation.x, o.matrix_world.translation.y, o.matrix_world.translation.z, float(o['height'])) for o in roots]
    for fn in K.ANIMS:
        fn(0.0, 0)
    return out


def cast_shot(move, cast):
    """-> (start, end) camera keys {x, y, z, tx, ty, tz, lens}: the camera at x, y, z looking at tx, ty, tz."""
    from mathutils import Vector
    if not cast:
        return None
    hmax = max(c[3] for c in cast)
    zg = min(c[2] for c in cast)
    xs = [c[0] for c in cast]
    if move == 'over_shoulder' and len(cast) >= 2:
        a = cast[0]
        b = max(cast[1:], key=lambda c: abs(c[0] - a[0]))
        d = 1 if b[0] >= a[0] else -1
        # the camera just outside and in front of the near character's shoulder, turned towards the other one: the
        # near one large at the edge of the picture, the other's face a third in from the far side
        ha = Vector((a[0], a[1], a[2] + a[3] * 0.86))
        hb = Vector((b[0], b[1], b[2] + b[3] * 0.8))
        cam = Vector((a[0] - d * 0.7, a[1] - 1.75, a[2] + a[3] * 0.9))
        da, db = (ha - cam).normalized(), (hb - cam).normalized()
        look = (da * 0.4 + db * 0.6).normalized()
        theta = da.angle(db)
        lens = max(26.0, min(50.0, 18.0 / math.tan(theta * 0.62 + math.radians(2))))
        tgt = cam + look * (hb - cam).length
        end = cam + (tgt - cam) * 0.06
        return (dict(x=cam.x, y=cam.y, z=cam.z, tx=tgt.x, ty=tgt.y, tz=tgt.z, lens=lens),
                dict(x=end.x, y=end.y, z=end.z, tx=tgt.x, ty=tgt.y, tz=tgt.z, lens=lens))
    # two-shot (also one character alone): waist up (closer when they stand close), a touch below eye level, a slow
    # push in. The frame is the larger of what the heads-to-waists need and what the row of characters needs.
    cx = (min(xs) + max(xs)) / 2
    cy = sum(c[1] for c in cast) / len(cast)
    span = max(xs) - min(xs) + 1.8
    lens = 40.0
    tan_w = 18.0 / lens
    tan_h = 18.0 * 9 / 16 / lens
    bottom, top = zg + hmax * 0.36, zg + hmax * 1.2
    dist = max(span / 2 / tan_w, (top - bottom) / 2 / tan_h, 2.2)
    tz = (bottom + top) / 2 + 0.02
    cam = Vector((cx, cy - dist, zg + hmax * 0.8))
    tgt = Vector((cx, cy, tz))
    end = cam + (tgt - cam) * 0.08
    return (dict(x=cam.x, y=cam.y, z=cam.z, tx=cx, ty=cy, tz=tz, lens=lens),
            dict(x=end.x, y=end.y, z=end.z, tx=cx, ty=cy, tz=tz, lens=lens))


def camera(move, frames, fps, focus_obj, lens=45, cast=None):
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    cam.dof.use_dof = True
    cam.dof.aperture_fstop = 0.9
    cam.dof.aperture_blades = 7
    co = bpy.data.objects.new('cam', cam)
    K.link(co)
    bpy.context.scene.camera = co
    # eye level with the felt animals, pitched down a touch: they stand above the caption band at the bottom
    base = dict(x=0.0, y=-10.5, z=1.45, rx=89.0, rz=0.0)
    a, b = dict(base), dict(base)
    if move == 'slow_push':
        b.update(y=-7.8, z=1.3)
    elif move == 'pull_back':
        a.update(y=-7.8, z=1.3)
    elif move == 'pan_left':
        a.update(x=1.8)
        b.update(x=-1.8)
    elif move == 'pan_right':
        a.update(x=-1.8)
        b.update(x=1.8)
    elif move == 'tilt_up':
        # a crane up and back while the camera tilts: the sky opens up and the characters' faces stay in the shot
        b.update(rx=92.5, z=2.2, y=-11.4)
    elif move == 'tilt_down':
        a.update(rx=92.5, z=2.2, y=-11.4)
    else:  # 'drift' / 'static': a slow float
        b.update(x=0.35, y=-10.0)
    dur = frames / fps
    shot = cast_shot(move, cast) if move in CAST_SHOTS else None
    if shot:
        from mathutils import Vector
        a, b = shot
        cam.lens = a['lens']

        def follow(t, f):
            u = max(0.0, min(1.0, t / dur))
            e = u * u * (3 - 2 * u)
            v = {k: a[k] + (b[k] - a[k]) * e for k in a}
            co.location = (v['x'] + math.sin(t * 0.4) * 0.03, v['y'], v['z'] + math.sin(t * 0.55) * 0.02)
            look = Vector((v['tx'], v['ty'], v['tz'])) - co.location
            co.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
            cam.dof.focus_distance = max(1.0, look.length)
        K.anim(follow)
        return co

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
LOOKS = ('felt', 'comic')


def look_of(spec):
    """The story's look: felt (felt and paper, the default) or comic (ink lines and muted cel colour, comic_look.py)."""
    return spec.get('look') if spec.get('look') in LOOKS else 'felt'


def build_scene(spec, sc_spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    K.reset()
    rng = random.Random(int(sc_spec.get('seed', 1)))
    tod = TIMES.get(sc_spec.get('time'), TIMES['night'])
    comic = look_of(spec) == 'comic'
    if comic or K.STYLE != 'felt':
        K.set_style(look_of(spec))
    # a soft fill on faces (and hands) at night and dusk, so expressions still read in the dark
    tod_name = sc_spec.get('time') if sc_spec.get('time') in TIMES else 'night'
    felt_stage.felt_people.FACE_FILL = {'night': 0.32, 'dusk': 0.16}.get(tod_name, 0.0)
    if comic:  # comic has its own camera-side fill light; a glowing skin would turn flat (unlit) there
        felt_stage.felt_people.FACE_FILL = 0.0
    setup_render(spec, tod)
    if comic:
        import comic_look
        comic_look.begin(sc_spec.get('time'), sc_spec.get('set'), spec)
    props = set(sc_spec.get('props') or [])
    hints = SETS.get(sc_spec.get('set'), felt_sets.set_lighthouse)(tod, rng, props) or {}
    hints.setdefault('night', tod['stars'] > 0.5)
    lights(tod, rng)
    fps = int(spec.get('fps', 24))
    frames = int(sc_spec['frames'])
    focus = felt_stage.stage(sc_spec, fps, frames, rng, hints)
    move = sc_spec.get('camera') or 'drift'
    camera(move, frames, fps, focus, cast=cast_now(frames, fps) if move in CAST_SHOTS else None)
    # Only the key light casts shadows: every shadowed light costs a shadow map per frame, and on a CPU renderer
    # that is most of the frame time. The glows (moon, lamp, windows) are fine without.
    for l in bpy.data.lights:
        if l.name != 'key' or spec.get('shadows') is False:
            l.use_shadow = False
    if comic:
        comic_look.finish(spec, sc_spec, hints)
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


def kit():
    """Everything this renderer can build, for the kit test (tests/unit/story-builder.test.js) to compare with
    catalog.json."""
    import felt_actions
    import felt_people
    import felt_props
    return {
        'sets': sorted(SETS), 'times': sorted(TIMES), 'places': sorted(PLACES), 'characters': sorted(felt_stage.CHARACTERS),
        'actions': sorted(felt_actions.ACTIONS), 'props': sorted(felt_props.PROPS), 'holds': sorted(list(felt_props.HOLD) + ['star']),
        'flyers': sorted(f for f in felt_actions.FLYERS if f in felt_stage.CHARACTERS), 'cameras': sorted(CAMERAS), 'looks': sorted(LOOKS),
        'look': {'hair_color': sorted(felt_people.HAIR_COLORS), 'skin': sorted(felt_people.SKIN), 'hair': sorted(felt_people.HAIR),
                 'shirt': sorted(felt_people.SHIRTS), 'outfit': sorted(felt_people.OUTFITS), 'age': sorted(felt_people.AGES)},
        'flying_outfits': sorted(felt_people.FLYING_OUTFITS), 'people': sorted(felt_people.PEOPLE),
    }


def main(argv):
    if argv[:1] == ['--kit']:
        print(json.dumps(kit()))
        return
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
