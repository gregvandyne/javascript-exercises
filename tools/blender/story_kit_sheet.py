"""Contact sheets of the Story Builder kit: render one still per cell and tile them with labels.

    python3 tools/blender/story_kit_sheet.py cells.json sheet.jpg [columns] [width] [height]

cells.json is a list of {label, scene: {set, time, props, characters, camera, seed}, t: seconds into the scene,
cam: [x, y, z, lens] (optional close-up), look: felt | comic (optional; else LOOK in the environment, else felt)}.
The scene is built exactly as render_story.py builds it (preview samples),
each still is pasted into the sheet and deleted. Prints build and render seconds and the face count per cell.
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'server', 'stories', 'blender'))
import render_story as R  # noqa: E402
import bpy  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402


def main(argv):
    cells = json.load(open(argv[0]))
    out = argv[1]
    cols = int(argv[2]) if len(argv) > 2 else 4
    W = int(argv[3]) if len(argv) > 3 else 480
    H = int(argv[4]) if len(argv) > 4 else 270
    raw = os.path.join(os.path.dirname(os.path.abspath(out)), 'raw')
    os.makedirs(raw, exist_ok=True)
    spec = {'width': W, 'height': H, 'fps': 24, 'step': 2, 'engine': 'eevee', 'samples': int(os.environ.get('SAMPLES', 2)),
            'look': os.environ.get('LOOK', 'felt')}
    shots = []
    for i, c in enumerate(cells):
        sc = {'frames': 96, 'seed': 7, 'props': [], 'camera': 'drift', **c['scene'], 'id': f'c{i}'}
        t0 = time.time()
        R.build_scene({**spec, 'look': c.get('look', spec['look'])}, sc)
        t = c.get('t', 2.0)
        for fn in R.K.ANIMS:
            fn(t, int(t * 24))
        if c.get('cam'):
            cam = bpy.context.scene.camera
            cam.location = c['cam'][:3]
            cam.data.lens = c['cam'][3] if len(c['cam']) > 3 else 45
            cam.data.dof.focus_distance = abs(cam.location.y) + 0.4
        bpy.context.view_layer.update()
        path = os.path.join(raw, f'c{i:03d}.png')
        bpy.context.scene.render.filepath = path
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
        print(json.dumps({'cell': i, 'label': c['label'], 'build': round(t1 - t0, 2), 'render': round(time.time() - t1, 2), 'faces': faces}), flush=True)
        shots.append((c['label'], path))
    rows = (len(shots) + cols - 1) // cols
    lab = 22
    sheet = Image.new('RGB', (cols * W, rows * (H + lab)), (250, 246, 238))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=15)
    for i, (label, path) in enumerate(shots):
        x, y = (i % cols) * W, (i // cols) * (H + lab)
        sheet.paste(Image.open(path).convert('RGB'), (x, y + lab))
        d.text((x + 6, y + 3), label, fill=(40, 40, 60), font=font)
        os.remove(path)
    sheet.save(out, quality=88)


if __name__ == '__main__':
    main(sys.argv[1:])
