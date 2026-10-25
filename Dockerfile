# Oomba Academy: Node 22 + SQLite on a persistent disk.
ARG NODE_IMAGE=node:22-bookworm-slim
# Litestream (optional continuous backup of the database to S3 or Azure Blob). Pinned by version and digest; only its
# binary is copied.
ARG LITESTREAM_IMAGE=litestream/litestream:0.5.17@sha256:4b02b9859a6b6b4087d8b8944e15f7e984bd7957cba322bbeee38b0e27b9656a

FROM ${LITESTREAM_IMAGE} AS litestream

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=3000 BRB_DATA_DIR=/data PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# tini (PID 1: passes signals on, reaps zombies) and headless Chromium (plus its fonts, emoji included) for game
# screenshots: cover pictures and the Builder's playtests (in the app on Render, in the worker container elsewhere).
RUN apt-get update && apt-get install -y --no-install-recommends tini \
  && node node_modules/playwright-core/cli.js install --with-deps --only-shell chromium \
  && rm -rf /var/lib/apt/lists/* /tmp/*
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY deploy/litestream.yml /etc/litestream.yml
COPY package.json ./
COPY server ./server
# public/ includes vendor/three/ (the pinned Three.js): the app serves it to players, and the screenshot worker, the
# same image started as `node server/shots-worker.js`, answers 3D games' requests for it from these files.
COPY public ./public
COPY scripts ./scripts
COPY seed-games ./seed-games
RUN chmod 0755 scripts/entrypoint.sh && mkdir -p /data && chown node:node /data
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# The entrypoint fixes the data folder's owner if needed (a mounted disk can arrive owned by root), drops to the
# unprivileged "node" user, seeds (idempotent: the admin and the launch games exist after every boot) and starts the
# server, under Litestream when LITESTREAM_REPLICA_URL is set. See scripts/entrypoint.sh.
ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/entrypoint.sh"]
