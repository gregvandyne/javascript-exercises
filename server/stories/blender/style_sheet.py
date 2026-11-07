"""Style sheet: one scene (the lighthouse + fox) in every style, for sign-off (docs/story-builder.md, "Styles").

    python3 style_sheet.py --out DIR [--styles felt,cartoon,pixel] [--size 1280x720] [--loop] [--quick]

Writes to DIR:
  <style>.png          the same camera shot of the scene, 1280x720
  <style>_fox.png      a close-up on the fox, 1280x720
  pixel_320.png, pixel_fox_320.png   the pixel renders at their real size (before the x4 upscale)
  fox_sprite_strip.png (x6) and fox_sprite_strip_1x.png (64 px frames): idle + a 4-frame walk, the 2D direction
  fox_walk.gif         the sprite walk, looping
  sheet.png            the renders side by side, labelled, close-ups below, the sprite strip and the palette
  <style>_loop.mp4     with --loop: a 3 s turntable round the fox (ffmpeg)
  timings.json         seconds per render
--quick renders at a quarter of the size with fewer samples (for tests).
"""
import argparse
import json
import math
import os
import subprocess
import sys
import time

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import feltkit as K  # noqa: E402
import render_story as R  # noqa: E402
import styles as S  # noqa: E402

SCENE = {'id': 'sheet', 'set': 'lighthouse', 'time': 'night', 'props': ['boat'], 'camera': 'drift', 'frames': 72,
         'seed': 10, 'characters': [{'kind': 'fox', 'action': 'idle', 'place': 'left'}]}
T = 1.5           # the moment of the shot (seconds into the scene)
LABELS = {'felt': 'Felt & paper', 'cartoon': 'Cartoon (Oomba Ink)', 'pixel': 'Pixel art'}
NOTES = {
    'felt': 'felt + paper shaders, soft warm lights, depth of field, bloom',
    'cartoon': 'kit palette, one hard cel shade, Ink outline, contact shadow',
    'pixel': '320x180, no AA, 1 px Ink line, 32-colour palette, x4 nearest',
}


def spec_for(style, w, h, quick):
    return {'width': w, 'height': h, 'fps': 24, 'engine': 'eevee', 'style': style,
            'samples': (4 if quick else 16) if style == 'felt' else 8}


def pose(t):
    for fn in K.ANIMS:
        fn(t, int(t * 24))
    bpy.context.view_layer.update()


def fox_root():
    return next(o for o in bpy.data.objects if o.name == 'fox0')


def look_at(cam, target):
    d = Vector(target) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def closeup(cam):
    """A portrait of the fox: longer lens, eye level, the lighthouse behind its shoulder."""
    fox = fox_root()
    p = fox.matrix_world.translation
    cam.data.lens = 50
    cam.location = (p.x + 1.3, p.y - 6.0, 1.35)
    look_at(cam, (p.x + 0.75, p.y, 1.0))
    cam.data.dof.focus_distance = (Vector((p.x, p.y, 1.1)) - cam.location).length
    cam.data.dof.aperture_fstop = 1.6
    if K.STYLE == 'felt':  # a soft warm fill from beside the camera, for the portrait (the other styles have no lights)
        lamp = bpy.data.lights.new('portrait', 'AREA')
        lamp.energy, lamp.size, lamp.color, lamp.use_shadow = 160, 3.0, (1.0, 0.88, 0.75), False
        lo = bpy.data.objects.new('portrait', lamp)
        K.link(lo)
        lo.location = (p.x - 1.2, p.y - 3.2, 2.2)
        look_at(lo, (p.x, p.y, 0.9))


def tidy_frame(cam):
    """Set dressing for a still: a hanging star cut by the frame edge is taken down for this shot (its thread
    running out of the top of the frame is fine; half a star is not)."""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    for piv in [o for o in bpy.data.objects if o.name.startswith('hstar') and o.parent is None]:
        kids = list(piv.children_recursive)
        stars = [k for k in kids if k.name.endswith('_star')]
        cut = False
        for st in stars:
            for c in st.bound_box:
                v = world_to_camera_view(sc, cam, st.matrix_world @ Vector(c))
                if v.z > 0 and not (0.0 <= v.x <= 1.0 and 0.0 <= v.y <= 1.0):
                    cut = True
        for k in [piv] + kids:
            k.hide_render = cut


def render(path, spec, small=None):
    bpy.context.scene.render.filepath = path
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    S.post(spec, path, keep_small=small)
    return round(time.time() - t0, 2)


def shoot(style, out, w, h, quick):
    spec = spec_for(style, w, h, quick)
    times = {}
    t0 = time.time()
    R.build_scene(spec, SCENE)
    times['build'] = round(time.time() - t0, 2)
    pose(T)
    tidy_frame(bpy.context.scene.camera)
    times['wide'] = render(os.path.join(out, f'{style}.png'), spec, os.path.join(out, 'pixel_320.png') if style == 'pixel' else None)
    sc = bpy.context.scene
    cam = sc.camera
    pose(T)
    closeup(cam)
    bpy.context.view_layer.update()
    if style != 'felt':
        S.add_lines(cam, sc.render.resolution_x, sc.render.resolution_y)  # line weights for the new distance
    tidy_frame(cam)
    times['closeup'] = render(os.path.join(out, f'{style}_fox.png'), spec, os.path.join(out, 'pixel_fox_320.png') if style == 'pixel' else None)
    return times


def turntable(style, out, w, h, quick, seconds=3.0, fps=24):
    """A 3 s orbit round the fox (half size, every frame), as an MP4."""
    spec = spec_for(style, w // 2, h // 2, quick)
    spec['samples'] = 4 if style == 'felt' else spec['samples']
    R.build_scene(spec, SCENE)
    sc = bpy.context.scene
    cam = sc.camera
    frames_dir = os.path.join(out, f'_{style}_loop')
    os.makedirs(frames_dir, exist_ok=True)
    n = int(seconds * fps)
    t0 = time.time()
    for f in range(n):
        t = T + f / fps
        pose(t)
        fox = fox_root()
        p = fox.matrix_world.translation
        a = math.radians(-35) + math.radians(70) * (0.5 - 0.5 * math.cos(math.pi * 2 * f / n))
        cam.data.lens = 50
        cam.location = (p.x + math.sin(a) * 6.4, p.y - math.cos(a) * 6.4, 1.55)
        look_at(cam, (p.x, p.y, 1.0))
        cam.data.dof.focus_distance = 6.4
        bpy.context.view_layer.update()
        if style != 'felt' and f == 0:
            S.add_lines(cam, sc.render.resolution_x, sc.render.resolution_y)
        render(os.path.join(frames_dir, f'f_{f:04d}.png'), spec)
    secs = round(time.time() - t0, 1)
    mp4 = os.path.join(out, f'{style}_loop.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(frames_dir, 'f_%04d.png'),
                    '-vf', 'scale=1280:720:flags=neighbor' if style == 'pixel' else 'scale=1280:720', '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p', '-crf', '18', mp4], check=True)
    return secs


# ---------------------------------------------------------------- the 2D direction: a pixel sprite of the fox
SPRITE = 64        # frame size in pixels
WALK = 4


def sprite_strip(out, quick):
    """idle + a 4-frame walk, three-quarter view facing right, 64 px frames, the pixel palette, 1 px Ink outline."""
    import numpy as np
    bpy.ops.wm.read_factory_settings(use_empty=True)
    K.reset()
    K.set_style('pixel')
    spec = {'width': SPRITE, 'height': SPRITE, 'engine': 'eevee', 'samples': 1, 'bloom': False, 'style': 'pixel'}
    R.setup_render(spec, R.TIMES['day'])
    root, body, head = K.fox('fox0')
    K.act(root, body, head, 'idle', 0, 0, 0, 1)
    root.rotation_euler.z = math.radians(34)   # face right, three-quarters to the camera
    # pixel sprites exaggerate the face: at 64 px the kit's bead eyes would be one pixel
    for o in head.children:
        if o.name.startswith(('eye', 'glint')):
            o.scale *= 1.15
            o.location.z += 0.02
    head.scale = (1.2, 1.2, 1.2)  # and a bigger head (chibi, kit: 2-2.3 heads tall)
    for o in body.children:
        if o.name.startswith('f_leg'):
            o.scale *= 1.25
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    K.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.25
    cam.location = (0.0, -10, 0.95 + 10 * math.tan(math.radians(12)))
    cam.rotation_euler = (math.radians(90 - 12), 0, 0)
    sc = bpy.context.scene
    sc.camera = cam
    S.finish(spec, {'time': 'day'})
    for o in [o for o in bpy.data.objects if o.name.startswith('contact_')]:
        bpy.data.objects.remove(o, do_unlink=True)  # the game draws its own shadow under a sprite
    sc.render.resolution_x = sc.render.resolution_y = SPRITE
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'
    for o in bpy.data.objects:  # no inner lines at 64 px (they turn into stray dots): the outline is drawn after
        for m in [m for m in o.modifiers if m.name.startswith('ink')]:
            o.modifiers.remove(m)
    legs = sorted([c for c in body.children if c.name.startswith('f_leg')], key=lambda o: o.location.x)
    arms = sorted([c for c in body.children if c.name.startswith('arm')], key=lambda o: o.location.x)
    tail = next(c for c in body.children if c.name.startswith('tail'))
    # the tail swings out behind (to the left) so the silhouette says "fox" from this side
    tail.location = (-0.12, 0.42, 0.3)
    tail.rotation_euler.z = math.radians(150)
    leg0 = [l.location.copy() for l in legs]
    frames = []
    tmp = os.path.join(out, '_sprite.png')
    for i in range(1 + WALK):
        pose(0.4)
        if i == 0:   # idle: standing, tail up
            tail.rotation_euler.y = 0.1
        else:        # walk: legs swing forward/back (fox's front is -Y), body bobs on the passing frames
            ph = (i - 1) / WALK * 2 * math.pi
            for k, l in enumerate(legs):
                s = math.sin(ph + k * math.pi)
                l.location = leg0[k] + Vector((0, -0.2 * s, 0.07 * max(0.0, -math.cos(ph + k * math.pi))))
            for k, a in enumerate(arms):
                a.rotation_euler.x = 0.5 * math.sin(ph + (1 - k) * math.pi)
            body.location.z = 0.07 * abs(math.sin(ph))
            body.rotation_euler.y = 0.0
            body.rotation_euler.x = -0.08  # leaning into the walk
            head.rotation_euler.y = 0.0
            head.rotation_euler.x = 0.04 * math.cos(ph * 2)
            tail.rotation_euler.y = 0.1 + 0.12 * math.sin(ph)
        bpy.context.view_layer.update()
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        frames.append(S.read_png(tmp))
    os.remove(tmp)
    pal = S.CUR['palette']
    cells = []
    for fr in frames:
        px = S.pixelate(fr, pal, 0.0, 1)
        a = px[..., 3] > 0.5
        # 1 px Ink outline round the silhouette (outside it), the classic sprite edge
        ring = np.zeros_like(a)
        ring[1:, :] |= a[:-1, :]
        ring[:-1, :] |= a[1:, :]
        ring[:, 1:] |= a[:, :-1]
        ring[:, :-1] |= a[:, 1:]
        ring &= ~a
        ink = S._srgb_arr([S.INK])[0]
        px[ring, :3] = ink
        px[ring, 3] = 1.0
        cells.append(px)
    strip = np.concatenate(cells, 1)
    S.write_png(os.path.join(out, 'fox_sprite_strip_1x.png'), strip)
    S.write_png(os.path.join(out, 'fox_sprite_strip.png'), np.repeat(np.repeat(strip, 6, 0), 6, 1))
    try:
        from PIL import Image
        big = [Image.open(os.path.join(out, 'fox_sprite_strip.png')).crop((i * SPRITE * 6, 0, (i + 1) * SPRITE * 6, SPRITE * 6))
               for i in range(1 + WALK)]
        walk = [b.convert('RGBA') for b in big[1:]]
        bg = [Image.new('RGBA', walk[0].size, (255, 253, 242, 255)) for _ in walk]
        gif = [Image.alpha_composite(b, w).convert('P', palette=Image.ADAPTIVE) for b, w in zip(bg, walk)]
        gif[0].save(os.path.join(out, 'fox_walk.gif'), save_all=True, append_images=gif[1:], duration=140, loop=0)
    except ImportError:
        pass


# ---------------------------------------------------------------- the sheet
def sheet(out, styles, timings):
    from PIL import Image, ImageDraw, ImageFont
    fonts = os.path.join(HERE, '..', '..', '..', 'public', 'fonts', 'bricolage-grotesque-latin-opsz-normal.woff2')

    def font(px, weight=800):
        try:
            f = ImageFont.truetype(fonts, px)
            try:
                f.set_variation_by_axes([min(96, px), weight])
            except Exception:
                pass
            return f
        except Exception:
            return ImageFont.load_default()
    ink, cream, paper = (20, 20, 20), (255, 253, 242), (244, 241, 230)
    cw, ch, gap, m = 640, 360, 28, 48
    W = m * 2 + cw * len(styles) + gap * (len(styles) - 1)
    head, lab = 120, 104
    strip_h = SPRITE * 4 + 90 if os.path.exists(os.path.join(out, 'fox_sprite_strip_1x.png')) else 0
    H = head + (lab + ch) + (gap + ch) + (gap + strip_h if strip_h else 0) + m
    img = Image.new('RGB', (W, H), cream)
    d = ImageDraw.Draw(img)
    d.text((m, 34), 'The lighthouse and the fox, in three styles', font=font(46), fill=ink)
    d.text((m, 88), 'One Blender scene and kit; a style is only materials, lighting and post. Same camera, same moment.',
           font=font(22, 500), fill=(94, 90, 80))
    for i, st in enumerate(styles):
        x = m + i * (cw + gap)
        y = head
        d.text((x, y + 8), LABELS[st], font=font(32), fill=ink)
        tm = timings.get(st, {})
        sec = f"  ·  wide {tm.get('wide', '?')} s, close-up {tm.get('closeup', '?')} s" if tm else ''
        d.text((x, y + 48), NOTES[st], font=font(18, 500), fill=(94, 90, 80))
        if sec:
            d.text((x, y + 70), sec.strip(' ·'), font=font(16, 500), fill=(143, 138, 124))
        y += lab
        for name in (f'{st}.png', f'{st}_fox.png'):
            p = os.path.join(out, name)
            if os.path.exists(p):
                im = Image.open(p).convert('RGB')
                im = im.resize((cw, ch), Image.NEAREST if st == 'pixel' else Image.LANCZOS)
                d.rounded_rectangle((x - 4, y - 4, x + cw + 3, y + ch + 3), 14, fill=ink)
                mask = Image.new('L', (cw, ch), 0)
                ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw - 1, ch - 1), 11, fill=255)
                img.paste(im, (x, y), mask)
            y += ch + gap
    if strip_h:
        y = head + lab + ch * 2 + gap * 2
        d.text((m, y), 'Pixel art, the 2D direction: a fox sprite (64 px frames: idle + 4-frame walk, shown x4)',
               font=font(26), fill=ink)
        s = Image.open(os.path.join(out, 'fox_sprite_strip_1x.png')).convert('RGBA')
        s = s.resize((s.width * 4, s.height * 4), Image.NEAREST)
        sx, sy = m, y + 48
        d.rounded_rectangle((sx - 10, sy - 10, sx + s.width + 10, sy + s.height + 10), 14, fill=paper)
        for k in range(1 + WALK):
            if k:
                d.line((sx + k * SPRITE * 4, sy, sx + k * SPRITE * 4, sy + s.height), fill=(198, 194, 181), width=2)
        img.paste(s, (sx, sy), s)
        for k, name in enumerate(['idle', 'walk 1', 'walk 2', 'walk 3', 'walk 4']):
            d.text((sx + k * SPRITE * 4 + 8, sy + 6), name, font=font(16, 600), fill=(94, 90, 80))
        # the palettes: the pixel palette as swatches
        px0 = sx + s.width + 60
        d.text((px0, y + 48), 'Pixel palette (32): Ink + the kit colours + the night sky', font=font(20, 700), fill=ink)
        pal = S.STYLES['pixel']['palette']
        sw = 34
        for k, hx in enumerate(pal):
            r, c = divmod(k, 16)
            bx, by = px0 + c * (sw + 6), y + 88 + r * (sw + 6)
            d.rounded_rectangle((bx, by, bx + sw, by + sw), 8, fill=hx, outline=ink, width=2)
    img.save(os.path.join(out, 'sheet.png'))


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--styles', default='felt,cartoon,pixel')
    ap.add_argument('--size', default='1280x720')
    ap.add_argument('--quick', action='store_true')
    ap.add_argument('--loop', action='store_true')
    ap.add_argument('--no-sheet', action='store_true')
    ap.add_argument('--loop-only', action='store_true', help='just the turntables (keeps the stills and timings)')
    a = ap.parse_args(argv)
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    w, h = (int(v) for v in a.size.lower().split('x'))
    if a.quick:
        w, h = w // 4, h // 4
    styles = [S.check(s) for s in a.styles.split(',') if s]
    timings = {}
    tf = os.path.join(out, 'timings.json')
    if os.path.exists(tf):
        timings = json.load(open(tf))
    for st in ([] if a.loop_only else styles):
        timings[st] = shoot(st, out, w, h, a.quick)
        print(json.dumps({'style': st, **timings[st]}), flush=True)
    if 'pixel' in styles and not a.loop_only:
        t0 = time.time()
        sprite_strip(out, a.quick)
        timings['sprite'] = round(time.time() - t0, 2)
    if a.loop or a.loop_only:
        for st in styles:
            timings[st]['loop'] = turntable(st, out, w, h, a.quick)
            print(json.dumps({'style': st, 'loop': timings[st]['loop']}), flush=True)
    json.dump(timings, open(tf, 'w'), indent=1)
    if not a.no_sheet:
        sheet(out, [s for s in S.NAMES if os.path.exists(os.path.join(out, f'{s}.png'))], timings)
    print(json.dumps({'done': True, 'out': out, 'timings': timings}), flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
