# Magic Cups: Node 22 + SQLite on a persistent disk.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=3000 BRB_DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY seed-games ./seed-games
RUN mkdir -p /data && chown -R node:node /data
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# A mounted persistent disk (Render, docker -v) arrives owned by root: hand it to the unprivileged
# "node" user, then run the app as that user. Seeding is idempotent, so every boot makes sure the
# admin and the three featured games exist.
CMD ["sh", "-c", "chown -R node:node \"$BRB_DATA_DIR\" && exec su node -s /bin/sh -c 'cd /app && /usr/local/bin/node scripts/seed.js && exec /usr/local/bin/node server/index.js'"]
