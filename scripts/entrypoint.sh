#!/bin/sh
# Container start (the image's ENTRYPOINT, under tini as PID 1). Every step ends in exec, so no shell stays behind
# as a parent and SIGTERM reaches the app (or Litestream, which passes it on) directly.
#
# No arguments (the web app):
#   as root  - make the data folder usable by the "node" user (uid 1000): only the folder and the entries directly in
#              it, only when not already writable, never through a symbolic link (the app user could plant one that
#              points at a system file), and never fatal (a network share may refuse chown); then run this script
#              again as "node" via setpriv, with no way to regain privileges (no-new-privs).
#   as node  - restore the database from the Litestream replica if the disk is empty (LITESTREAM_REPLICA_URL set),
#              seed (idempotent), then run the server, under "litestream replicate" when a replica is configured.
# With arguments (e.g. `node server/shots-worker.js`, `node scripts/backup.js`): run them as "node", no data folder work.
set -eu

APP_USER=node
DATA="${BRB_DATA_DIR:-/data}"
DB="$DATA/brb.db"
say() { echo "entrypoint: $*"; }
warn() { echo "entrypoint: warning: $*" >&2; }

if [ "$(id -u)" = 0 ]; then
  if [ "$#" -eq 0 ]; then
    mkdir -p "$DATA" 2>/dev/null || warn "could not create $DATA"
    for p in "$DATA" "$DATA"/* "$DATA"/.[!.]*; do
      if [ -L "$p" ]; then [ "$p" = "$DATA" ] && warn "$DATA is a symbolic link: not changing its owner"; continue; fi
      [ -e "$p" ] || continue
      case "$p" in */lost+found) continue ;; esac   # the file system's own folder on a freshly made disk
      setpriv --reuid="$APP_USER" --regid="$APP_USER" --clear-groups test -w "$p" && continue
      # -h: if the entry was swapped for a link meanwhile, change the link, never what it points at.
      if chown -h "$APP_USER:$APP_USER" "$p" 2>/dev/null; then say "made $p writable for $APP_USER"
      else warn "$p is not writable by uid 1000 and chown failed (on a network share, mount it with uid=1000,gid=1000)"; fi
    done
  fi
  export HOME=/home/node USER="$APP_USER"
  exec setpriv --reuid="$APP_USER" --regid="$APP_USER" --init-groups --no-new-privs -- "$0" "$@"
fi

cd /app
[ "$#" -gt 0 ] && exec "$@"

require_secret=$(printf %s "${REQUIRE_SESSION_SECRET:-}" | tr '[:upper:]' '[:lower:]')
case "$require_secret" in 1|true|yes|on) require_secret=1 ;; *) require_secret=0 ;; esac   # other values: the app refuses them
if [ "$require_secret" = 1 ] && [ -z "${SESSION_SECRET:-}" ]; then
  warn "SESSION_SECRET is not set and REQUIRE_SESSION_SECRET=1: not starting. scripts/export-session-secret.js copies the old host's secret."
  exit 1
fi

replicate=0
if [ -n "${LITESTREAM_REPLICA_URL:-}" ]; then
  mode=$(printf %s "${BRB_JOURNAL_MODE:-WAL}" | tr '[:lower:]' '[:upper:]')
  if [ "$mode" = WAL ]; then replicate=1
  else warn "Litestream needs BRB_JOURNAL_MODE=WAL (it is $mode): starting without it. Use your file share's own backups."; fi
fi

if [ "$replicate" = 1 ] && [ "${LITESTREAM_AUTO_RESTORE:-1}" = 1 ] && [ ! -e "$DB" ]; then
  say "no database at $DB: restoring the latest backup from the Litestream replica, if there is one"
  # A wrong bucket or key can make the restore retry for ever: give up after LITESTREAM_RESTORE_TIMEOUT seconds.
  if ! timeout "${LITESTREAM_RESTORE_TIMEOUT:-600}" litestream restore -if-db-not-exists -if-replica-exists "$DB"; then
    rm -f "$DB" "$DB-wal" "$DB-shm"   # there was no database before, so anything here is a half-finished restore
    warn "restoring from the replica failed, so the app is not starting (an empty database would be backed up over it)."
    warn "Check LITESTREAM_REPLICA_URL and its credentials, or set LITESTREAM_AUTO_RESTORE=0 to start empty."
    exit 1
  fi
fi

node scripts/seed.js

if [ "$replicate" = 1 ]; then
  say "starting with Litestream replication"
  # The app doesn't get the storage keys: Litestream would pass its whole environment on to it.
  exec litestream replicate -exec "env -u LITESTREAM_ACCESS_KEY_ID -u LITESTREAM_SECRET_ACCESS_KEY -u LITESTREAM_AZURE_ACCOUNT_KEY -u LITESTREAM_AZURE_SAS_TOKEN -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AZURE_CLIENT_SECRET node server/index.js"
fi
exec node server/index.js
