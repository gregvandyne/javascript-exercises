"""Smoke test of a deployed story renderer (Modal or the CPU service): one short scene at preview quality through the
bearer-token API, timed. Used by .github/workflows/deploy-story-renderer.yml; standard library only.

    STORY_RENDER_URL=https://... STORY_RENDER_TOKEN=... python3 services/story-renderer/smoke_test.py [--summary FILE]

Prints (and appends to --summary, as Markdown) the wall time, the GPU-side render seconds the service reports, and the
clip size. Exits 1 on any failure. Never prints the token.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

URL = os.environ.get("STORY_RENDER_URL", "").rstrip("/")
TOKEN = os.environ.get("STORY_RENDER_TOKEN", "")
SPEC = {
    "width": 640, "height": 360, "fps": 24, "step": 2, "samples": 4, "key": "smoke-test",
    "scenes": [{"id": "s1", "set": "lighthouse", "time": "night", "props": ["boat"], "camera": "slow_push", "frames": 48, "seed": 7,
                "characters": [{"kind": "mouse", "action": "walk", "place": "left"}, {"kind": "owl", "action": "idle", "place": "right"}], "focus": "mouse"}],
}


def call(method, path, body=None, raw=False, timeout=120):
    req = urllib.request.Request(URL + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"authorization": f"Bearer {TOKEN}", **({"content-type": "application/json"} if body is not None else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        return r.status, (data if raw else json.loads(data or b"{}"))


def main():
    summary = sys.argv[sys.argv.index("--summary") + 1] if "--summary" in sys.argv else None
    if not URL or not TOKEN:
        sys.exit("STORY_RENDER_URL and STORY_RENDER_TOKEN are required")
    t0 = time.time()
    status, job = call("POST", "/jobs", {"key": SPEC["key"], "spec": SPEC})
    if status != 202:
        sys.exit(f"the renderer refused the job ({status})")
    st = {}
    while time.time() - t0 < 30 * 60:
        time.sleep(3)
        _, st = call("GET", f"/jobs/{job['id']}")
        if st.get("status") in ("done", "failed"):
            break
    if st.get("status") != "done":
        sys.exit(f"render did not finish: {st.get('status')} {st.get('error') or ''}")
    _, clip = call("GET", f"/jobs/{job['id']}/clips/s1", raw=True, timeout=300)
    wall = time.time() - t0
    try:
        call("DELETE", f"/jobs/{job['id']}")
    except urllib.error.HTTPError as e:
        if e.code != 204:
            raise
    if len(clip) < 1000 or clip[4:8] != b"ftyp":
        sys.exit("the clip that came back is not an MP4")
    secs = (st.get("sceneSeconds") or {}).get("s1") or {}
    frames = st.get("done") or SPEC["scenes"][0]["frames"] // SPEC["step"]
    lines = [
        "### Story renderer smoke test",
        "",
        f"- one scene, {SPEC['width']}x{SPEC['height']}, {frames} frames rendered ({SPEC['scenes'][0]['frames'] / SPEC['fps']:.0f} s of video on twos), {SPEC['samples']} samples",
        f"- engine: {secs.get('engine') or st.get('engine')}, GPU: {secs.get('gpu', 'n/a')}",
        f"- **wall time** (submit to clip downloaded, cold start included): **{wall:.1f} s**",
        f"- **render time on the GPU** (Blender start, render, encode): **{secs['render']:.1f} s** = {secs['render'] / max(1, frames):.2f} s per frame" if secs.get("render") else "- render time on the GPU: not reported",
        f"- clip: {len(clip) / 1024:.0f} KB",
    ]
    print("\n".join(lines))
    if summary:
        with open(summary, "a") as fh:
            fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} from the renderer ({'check STORY_RENDER_TOKEN' if e.code == 401 else e.reason})")
    except urllib.error.URLError as e:
        sys.exit(f"could not reach the renderer: {e.reason}")
