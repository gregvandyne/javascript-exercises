# syntax=docker/dockerfile:1
# The Story Builder renderer service (docs/story-builder.md "Hosting"): Blender 5.2 as a Python module (bpy), headless
# EEVEE through Mesa's software EGL (llvmpipe: no GPU needed), ffmpeg (with libass) for the clips and the final video,
# and a small Node server.
# Build from the repository root:  docker build -f services/story-renderer/Dockerfile -t story-renderer .
# Run:  docker run -p 4800:4800 -e STORY_RENDER_TOKEN=... story-renderer
ARG NODE_IMAGE=node:22-bookworm-slim
ARG PYTHON_IMAGE=python:3.13-slim-bookworm
ARG BASE_IMAGE=ubuntu:24.04

FROM ${NODE_IMAGE} AS node
# bpy 5.2 wheels are for Python 3.13 only: take the official CPython 3.13 build (in /usr/local) from its image.
FROM ${PYTHON_IMAGE} AS python

# Ubuntu 24.04 for the system parts: ffmpeg 6.1, Mesa (llvmpipe) and EGL for EEVEE without a GPU, and the X11/GL client
# libraries bpy links to (it never opens a display); the libraries CPython needs; fallback fonts for the words in
# Hebrew, Arabic, Cyrillic (DejaVu) and Japanese and Chinese (Noto CJK); tini as PID 1, so SIGTERM reaches
# the server and Blender's processes are reaped.
FROM ${BASE_IMAGE}
ENV DEBIAN_FRONTEND=noninteractive PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg tini ca-certificates fontconfig fonts-dejavu-core fonts-noto-cjk \
      libegl1 libegl-mesa0 libgl1-mesa-dri libgles2 libgl1 libglx0 libglvnd0 \
      libx11-6 libxrender1 libxfixes3 libxi6 libxext6 libxkbcommon0 libsm6 libice6 libxxf86vm1 libxcb1 \
      libssl3t64 libffi8 libsqlite3-0 libbz2-1.0 liblzma5 zlib1g libexpat1 libncursesw6 libreadline8t64 libuuid1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=python /usr/local/ /usr/local/
# (An optional build secret "pip_ca" adds a CA for networks that inspect TLS; production builds don't pass one.)
RUN --mount=type=secret,id=pip_ca,required=false ldconfig && python3 --version \
    && if [ -s /run/secrets/pip_ca ]; then export PIP_CERT=/run/secrets/pip_ca; fi \
    && pip install bpy==5.2.3 && python3 -c "import bpy; print('bpy', bpy.app.version_string)"
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
# Only what the renderer needs: the Blender kit and render script, the shared Node renderer and assembly code, the
# music composer and caption timing (pure JS), the site's font for the words, and the service itself.
COPY services/story-renderer/package.json ./package.json
COPY server/stories/blender ./server/stories/blender
COPY tools/blender/feltkit.py tools/blender/styles.py tools/blender/felt_*.py ./tools/blender/
COPY server/stories/renderer.js server/stories/remote-renderer.js server/stories/clip.js server/stories/assemble.js ./server/stories/
COPY server/services/story-music.js server/services/story-captions.js ./server/services/
COPY public/fonts ./public/fonts
COPY services/story-renderer ./services/story-renderer
RUN useradd --create-home --uid 10001 renderer && mkdir -p /work && chown renderer:renderer /work
USER renderer
ENV PORT=4800 STORY_RENDER_DIR=/work STORY_PYTHON=python3 STORY_ENGINE=auto STORY_RENDER_PROCS=1 NODE_ENV=production
EXPOSE 4800
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4800)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "services/story-renderer/server.js"]
