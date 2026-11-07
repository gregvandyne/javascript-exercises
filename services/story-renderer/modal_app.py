"""Story Builder renderer on Modal: serverless GPUs, one per scene (docs/story-builder.md "Hosting on Modal").

    modal deploy services/story-renderer/modal_app.py                # GPU type: STORY_GPU=L40S (default) | L4 | A10G
    STORY_GPU=L4 modal deploy services/story-renderer/modal_app.py

The site talks to it exactly like the HTTP renderer service (server/stories/remote-renderer.js; STORY_RENDERER=modal):
    GET    /health                         -> { ok, busy: false, engine }                       (no token)
    POST   /jobs       { key, spec }        -> 202 { id, total }   every scene starts at once, on its own GPU
    GET    /jobs/{id}                       -> { status: running|done|failed, done, total, engine, clips, error }
    GET    /jobs/{id}/clips/{scene}         -> video/mp4
    DELETE /jobs/{id}                       -> 204 (cancels whatever still runs)
Every call but /health needs `Authorization: Bearer <STORY_RENDER_TOKEN>` (Modal secret "story-renderer"), compared in
constant time. The site assembles the video from the clips itself (server/stories/assemble.js).

The scene work (render_scene_impl) is plain Python around the same render_story.py the CPU renderer uses, so it runs on
any machine with bpy and ffmpeg: tests/unit/story-modal.test.js drives the whole web API locally on the CPU through
make_api(LocalBackend()) without a Modal account.
"""
import hmac
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
BLENDER_DIR_LOCAL = HERE.parent.parent / "server" / "stories" / "blender"
BLENDER_DIR = Path("/app/blender") if Path("/app/blender").exists() else BLENDER_DIR_LOCAL
GPU = os.environ.get("STORY_GPU", "L40S")
if GPU not in ("L4", "L40S", "A10G", "A100", "H100"):
    raise SystemExit(f"STORY_GPU must be L4, L40S or A10G (got {GPU})")
MAX_SCENES = 10


# ---------------------------------------------------------------- the scene work (no Modal needed)
def check_spec(spec):
    """The same limits as services/story-renderer/spec.js: shape and size only; Blender ignores names it doesn't know."""
    import re
    probs = []
    if not isinstance(spec, dict):
        return ["spec: an object"]
    for k, lo, hi in (("width", 16, 1920), ("height", 16, 1080), ("fps", 1, 30), ("step", 1, 6), ("samples", 1, 32)):
        v = spec.get(k)
        if not isinstance(v, int) or not lo <= v <= hi:
            probs.append(f"{k}: a whole number {lo}..{hi}")
    scenes = spec.get("scenes")
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= MAX_SCENES:
        return probs + [f"scenes: 1..{MAX_SCENES}"]
    ids = set()
    for i, s in enumerate(scenes):
        if not isinstance(s, dict) or not re.fullmatch(r"[A-Za-z0-9_-]{1,16}", str(s.get("id", ""))) or s["id"] in ids:
            probs.append(f"scenes[{i}].id")
            continue
        ids.add(s["id"])
        if not isinstance(s.get("frames"), int) or not 1 <= s["frames"] <= 3600:
            probs.append(f"scenes[{i}].frames")
        for f in ("set", "time", "camera"):
            if not re.fullmatch(r"[a-z][a-z0-9_]{0,23}", str(s.get(f, ""))):
                probs.append(f"scenes[{i}].{f}")
        if len(s.get("characters") or []) > 3 or len(s.get("props") or []) > 6:
            probs.append(f"scenes[{i}]: too many characters or props")
    return probs


def render_scene_impl(spec, index, workdir, on_progress=None, engine=None):
    """Render scene `index` of the spec with render_story.py and encode it as an MP4 clip (the clip.js settings).
    -> (clip bytes, { engine, frames, seconds })."""
    work = Path(workdir)
    out = work / "out"
    out.mkdir(parents=True, exist_ok=True)
    engine = engine or os.environ.get("STORY_ENGINE") or "eevee"
    full = {**spec, "engine": engine, "out_dir": str(out)}
    full.pop("only_frames", None)
    spec_file = work / "spec.json"
    spec_file.write_text(json.dumps(full))
    scene = spec["scenes"][index]
    step = max(1, int(spec.get("step", 1)))
    total = -(-int(scene["frames"]) // step)
    t0 = time.time()
    done = 0
    p = subprocess.Popen([sys.executable, "-u", str(BLENDER_DIR / "render_story.py"), str(spec_file), str(index)],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env={**os.environ, "PYTHONUNBUFFERED": "1"})
    err_tail = []

    def drain():
        for line in p.stderr:
            if "EGL Error" not in line:
                err_tail.append(line.rstrip())
                del err_tail[:-20]
    threading.Thread(target=drain, daemon=True).start()
    for line in p.stdout:
        line = line.strip()
        if line.startswith("{") and '"frame"' in line:
            done += 1
            if on_progress:
                on_progress(done, total)
    if p.wait() != 0:
        raise RuntimeError(f"render exited {p.returncode}: {' | '.join(err_tail[-6:])}")
    rate = str(spec["fps"] / step)
    clip = work / f"{scene['id']}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", rate, "-i", str(out / scene["id"] / "f_%05d.png"),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", rate,
                    "-movflags", "+faststart", str(clip)], check=True)
    data = clip.read_bytes()
    return data, {"engine": engine, "frames": done, "seconds": round(time.time() - t0, 2)}


def probe_engine():
    """EEVEE if it starts here (an NVIDIA GPU with EGL, or Mesa on a CPU machine), else Cycles."""
    for engine in ("eevee", "cycles"):
        r = subprocess.run([sys.executable, str(BLENDER_DIR / "render_story.py"), "--probe", engine], capture_output=True, timeout=300)
        if r.returncode == 0:
            return engine
    return None


# ---------------------------------------------------------------- the web API (shared by Modal and the local backend)
def make_api(backend, token):
    """A FastAPI app over a backend with start(job_id, spec) / status(job_id) / clip(job_id, scene) / cancel(job_id)."""
    from fastapi import FastAPI, Request, Response
    from fastapi.responses import JSONResponse
    if not token or len(token) < 24:
        raise RuntimeError("STORY_RENDER_TOKEN is required (at least 24 characters)")
    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    def authed(req):
        h = req.headers.get("authorization", "")
        return h.startswith("Bearer ") and hmac.compare_digest(h[7:].strip().encode(), token.encode())

    @api.get("/health")
    def health():
        return {"ok": True, "busy": False, "engine": backend.engine()}

    @api.post("/jobs")
    async def create(req: Request):
        if not authed(req):
            return JSONResponse({"error": "unauthorized"}, 401)
        raw = await req.body()
        if len(raw) > 256 * 1024:
            return JSONResponse({"error": "too large"}, 413)
        try:
            body = json.loads(raw)
        except ValueError:
            return JSONResponse({"error": "bad json"}, 400)
        spec = body.get("spec") if isinstance(body, dict) else None
        probs = check_spec(spec)
        if probs:
            return JSONResponse({"error": "bad spec", "problems": probs[:10]}, 400)
        spec = {k: spec[k] for k in ("width", "height", "fps", "step", "samples", "scenes")}
        job = uuid.uuid4().hex[:16]
        total = backend.start(job, spec, str(body.get("key", ""))[:64])
        return JSONResponse({"id": job, "total": total}, 202)

    @api.get("/jobs/{job}")
    def status(job: str, req: Request):
        if not authed(req):
            return JSONResponse({"error": "unauthorized"}, 401)
        st = backend.status(job)
        return JSONResponse(st, 200) if st else JSONResponse({"error": "no such job"}, 404)

    @api.get("/jobs/{job}/clips/{scene}")
    def clip(job: str, scene: str, req: Request):
        if not authed(req):
            return JSONResponse({"error": "unauthorized"}, 401)
        data = backend.clip(job, scene)
        if data is None:
            return JSONResponse({"error": "no such clip"}, 404)
        return Response(content=data, media_type="video/mp4", headers={"cache-control": "no-store"})

    @api.delete("/jobs/{job}")
    def delete(job: str, req: Request):
        if not authed(req):
            return JSONResponse({"error": "unauthorized"}, 401)
        backend.cancel(job)
        return Response(status_code=204)

    return api


class LocalBackend:
    """Runs every scene in a thread on this machine (CPU): the same scene code as on Modal, for tests and development."""

    def __init__(self, workers=2):
        self.pool = ThreadPoolExecutor(max_workers=workers)
        self.jobs = {}
        self._engine = None

    def engine(self):
        if self._engine is None:
            self._engine = probe_engine() or "none"
        return self._engine

    def start(self, job, spec, key):
        step = max(1, spec["step"])
        scenes = {s["id"]: {"done": 0, "total": -(-s["frames"] // step), "clip": None, "error": None} for s in spec["scenes"]}
        tmp = tempfile.mkdtemp(prefix=f"story-{job}-")
        self.jobs[job] = {"scenes": scenes, "tmp": tmp, "engine": self.engine()}
        for i, s in enumerate(spec["scenes"]):
            st = scenes[s["id"]]

            def run(i=i, st=st, sid=s["id"]):
                try:
                    data, info = render_scene_impl(spec, i, os.path.join(tmp, sid), lambda d, t: st.update(done=d), engine=self.jobs[job]["engine"])
                    st["secs"] = {"render": info["seconds"], "engine": info["engine"], "gpu": "none (CPU)"}
                    st["clip"] = data
                except Exception as e:  # noqa: BLE001 — reported to the caller
                    st["error"] = str(e)[:300]
            self.pool.submit(run)
        return sum(v["total"] for v in scenes.values())

    def status(self, job):
        j = self.jobs.get(job)
        if not j:
            return None
        sc = j["scenes"].values()
        err = next((v["error"] for v in sc if v["error"]), None)
        done = all(v["clip"] is not None for v in sc)
        return {"id": job, "status": "failed" if err else "done" if done else "running", "done": sum(v["done"] for v in sc),
                "total": sum(v["total"] for v in sc), "engine": j["engine"], "sceneSeconds": {k: v.get("secs") for k, v in j["scenes"].items()}, "clips": [k for k, v in j["scenes"].items() if v["clip"] is not None], "error": err}

    def clip(self, job, scene):
        j = self.jobs.get(job)
        v = j and j["scenes"].get(scene)
        return v["clip"] if v else None

    def cancel(self, job):
        j = self.jobs.pop(job, None)
        if j:
            shutil.rmtree(j["tmp"], ignore_errors=True)


# ---------------------------------------------------------------- Modal (only when the modal package is installed)
try:
    import modal
except ImportError:  # running the local backend, or the tests, without Modal
    modal = None

if modal is not None:
    app = modal.App("oomba-story-renderer")
    # Blender 5.2 needs Python 3.13. No Mesa: on Modal's NVIDIA GPUs EEVEE uses the driver's EGL (glvnd vendor file
    # below); if that is unavailable the probe falls back to Cycles on the GPU (CUDA/OptiX).
    image = (
        modal.Image.debian_slim(python_version="3.13")
        .apt_install("ffmpeg", "libegl1", "libgl1", "libglvnd0", "libglx0", "libgles2", "libx11-6", "libxrender1", "libxfixes3",
                     "libxi6", "libxext6", "libxkbcommon0", "libsm6", "libice6", "libxxf86vm1", "libxcb1")
        .pip_install("bpy==5.2.3", "fastapi[standard]==0.115.*")
        .run_commands("mkdir -p /usr/share/glvnd/egl_vendor.d && echo '{\"file_format_version\":\"1.0.0\",\"ICD\":{\"library_path\":\"libEGL_nvidia.so.0\"}}' > /usr/share/glvnd/egl_vendor.d/10_nvidia.json")
        .env({"NVIDIA_DRIVER_CAPABILITIES": "all", "STORY_CYCLES_DEVICE": "GPU"})
        .add_local_dir(str(BLENDER_DIR_LOCAL), "/app/blender", ignore=["__pycache__"])
        .add_local_file(__file__, "/app/modal_app.py")
    )
    progress = modal.Dict.from_name("story-renderer-progress", create_if_missing=True)
    secret = modal.Secret.from_name("story-renderer")   # STORY_RENDER_TOKEN

    # scaledown_window: a GPU container is billed while it idles; scenes arrive together, so let it go quickly.
    @app.function(image=image, gpu=GPU, timeout=60 * 60, max_containers=20, retries=0, scaledown_window=10)
    def render_scene(spec: dict, index: int, job: str) -> bytes:
        """One scene on one GPU -> its MP4 clip."""
        sid = spec["scenes"][index]["id"]
        engine = probe_engine()
        last = [0.0]

        def tick(done, total):
            if time.time() - last[0] > 2 or done == total:
                last[0] = time.time()
                progress[f"{job}:{sid}"] = done
        with tempfile.TemporaryDirectory() as tmp:
            data, info = render_scene_impl(spec, index, tmp, tick, engine=engine)
        progress[f"{job}:{sid}"] = info["frames"]
        # seconds this GPU spent rendering and encoding the scene (after the container started): for the measurements
        progress[f"{job}:{sid}:secs"] = {"render": info["seconds"], "engine": engine, "gpu": GPU}
        progress[f"{job}:engine"] = engine
        return data

    class ModalBackend:
        def engine(self):
            return f"modal-{GPU}"

        def start(self, job, spec, key):
            step = max(1, spec["step"])
            calls = {s["id"]: render_scene.spawn(spec, i, job).object_id for i, s in enumerate(spec["scenes"])}
            totals = {s["id"]: -(-s["frames"] // step) for s in spec["scenes"]}
            progress[f"{job}:job"] = {"calls": calls, "totals": totals, "key": key, "at": time.time()}
            return sum(totals.values())

        def _calls(self, job):
            try:
                return progress[f"{job}:job"]
            except KeyError:
                return None

        def status(self, job):
            j = self._calls(job)
            if not j:
                return None
            clips, err = [], None
            for sid, cid in j["calls"].items():
                fc = modal.FunctionCall.from_id(cid)
                try:
                    fc.get(timeout=0)
                    clips.append(sid)
                except TimeoutError:
                    pass
                except Exception as e:  # noqa: BLE001 — a failed scene fails the job
                    err = f"scene {sid}: {str(e)[:200]}"
            done = sum(min(progress.get(f"{job}:{sid}", 0), t) for sid, t in j["totals"].items())
            total = sum(j["totals"].values())
            st = "failed" if err else "done" if len(clips) == len(j["calls"]) else "running"
            scene_secs = {sid: progress.get(f"{job}:{sid}:secs") for sid in j["calls"]}
            return {"id": job, "status": st, "done": total if st == "done" else done, "total": total, "sceneSeconds": scene_secs,
                    "engine": progress.get(f"{job}:engine", self.engine()), "clips": clips, "error": err}

        def clip(self, job, scene):
            j = self._calls(job)
            if not j or scene not in j["calls"]:
                return None
            try:
                return modal.FunctionCall.from_id(j["calls"][scene]).get(timeout=0)
            except Exception:  # noqa: BLE001
                return None

        def cancel(self, job):
            j = self._calls(job)
            if not j:
                return
            for cid in j["calls"].values():
                try:
                    modal.FunctionCall.from_id(cid).cancel()
                except Exception:  # noqa: BLE001
                    pass
            for k in [f"{job}:job", f"{job}:engine", *[f"{job}:{s}" for s in j["calls"]], *[f"{job}:{s}:secs" for s in j["calls"]]]:
                progress.pop(k, None)

    @app.function(image=image, secrets=[secret], timeout=120, min_containers=0)
    @modal.concurrent(max_inputs=50)
    @modal.asgi_app(label="oomba-story-renderer")
    def web():
        return make_api(ModalBackend(), os.environ.get("STORY_RENDER_TOKEN", ""))


# ---------------------------------------------------------------- local: python3 modal_app.py --serve PORT
if __name__ == "__main__" and len(sys.argv) >= 3 and sys.argv[1] == "--serve":
    import uvicorn
    uvicorn.run(make_api(LocalBackend(workers=int(os.environ.get("STORY_LOCAL_WORKERS", "2"))), os.environ.get("STORY_RENDER_TOKEN", "")),
                host="127.0.0.1", port=int(sys.argv[2]), log_level="warning")
