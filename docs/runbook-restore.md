# Runbook: restoring Oomba Academy's data

Everything the site keeps lives in one folder on one disk (`/data` in the container, `/srv/oomba/data` on the
recommended VM):

| What | Where | Backed up by |
|---|---|---|
| The database: accounts, games and every version, saves, scores, schools, lessons, chat | `brb.db` (+ `brb.db-wal`, `brb.db-shm` while running) | **Litestream** (continuous, off the server) when `LITESTREAM_REPLICA_URL` is set; `npm run backup` copies in `backups/`; disk snapshots |
| Cover pictures of Studio games | `shots/` | disk snapshots only (they can be re-taken, see step 5) |
| Profile photos | `avatars/` | disk snapshots only |
| Pictures kids uploaded to the Builder | `uploads/` | disk snapshots only |

So: Litestream protects the database to within about 10 seconds; the daily disk snapshot (EBS snapshot on AWS,
Azure Backup on Azure) protects the rest to within a day. Keep both.

Commands below assume the VM layout from `docs/deploy-aws.md` / `docs/deploy-azure.md` (repo in `/srv/oomba/app`,
compose in `/srv/oomba/app/deploy`). Run them as a user that can use Docker (`sudo` where shown).

---

## Which situation are you in?

| Situation | Go to |
|---|---|
| The disk or the server is gone or broken | [A. Restore onto a new or empty disk](#a-restore-onto-a-new-or-empty-disk-automatic) |
| The site runs, but data was deleted or damaged by mistake ("undo to 9 o'clock") | [B. Point-in-time restore](#b-point-in-time-restore-undo-a-mistake) |
| Litestream was not set up | [C. Restore from a disk snapshot or a local backup](#c-restore-from-a-disk-snapshot-or-a-local-backup) |
| You want to prove backups work (do this every 3 months) | [D. Restore drill](#d-restore-drill-every-3-months) |
| The backup itself looks damaged, emptied or tampered with | [E. When the backup can't be trusted](#e-when-the-backup-cant-be-trusted) |

Before any restore: **write down the time** and, if the old disk still exists, **keep it** (detach it, don't delete
it) until the restored site has run for a week.

---

## A. Restore onto a new or empty disk (automatic)

The container restores by itself: when `LITESTREAM_REPLICA_URL` is set and there is **no** `brb.db` on the disk, it
downloads the latest copy before starting (`LITESTREAM_AUTO_RESTORE`, on by default).

1. Get a server with an empty data disk mounted at `/srv/oomba` (follow the setup in the deploy guide), with the same
   `deploy/.env` as before (same `LITESTREAM_REPLICA_URL`, keys and `SESSION_SECRET`).
2. Restore the pictures if you have a disk snapshot: create a disk from the latest snapshot, mount it somewhere
   (e.g. `/mnt/old`), then `sudo cp -a /mnt/old/data/shots /mnt/old/data/avatars /mnt/old/data/uploads /srv/oomba/data/`
   (skip any that don't exist). Do **not** copy the old `brb.db*` files: Litestream's copy is newer.
3. Start: `cd /srv/oomba/app/deploy && docker compose up -d`.
4. Watch it: `docker compose logs -f app`. You should see
   `entrypoint: no database at /data/brb.db: restoring the latest backup from the Litestream replica` and then
   `"msg":"listening"`. If instead it says `restoring from the replica failed`, the bucket name or keys in `.env` are
   wrong: fix them and run `docker compose up -d` again.
5. Check: `curl -s https://YOUR-DOMAIN/health` shows `"ok":true`; sign in with your admin account; open a game.
6. If you had no snapshot for step 2, cover pictures show the coloured placeholder until re-taken. Ask the app to
   re-take them (it does about 6 every 2 minutes):
   ```bash
   docker compose exec -u node app node -e "import('./server/db.js').then(({q})=>console.log(q.run('UPDATE game_versions SET shot_at=0, shot_tries=0 WHERE shot_at>0').changes, 'pictures queued'))"
   ```
   Profile photos that are gone can be reset to the emoji avatar:
   ```bash
   docker compose exec -u node app node -e "import('./server/db.js').then(({q})=>{const fs=require('node:fs');let n=0;for(const u of q.all('SELECT id FROM users WHERE photo_at>0'))if(!fs.existsSync('/data/avatars/'+u.id+'.jpg')){q.run('UPDATE users SET photo_at=0 WHERE id=?',u.id);n++}console.log(n,'photos reset')})"
   ```

## B. Point-in-time restore (undo a mistake)

Litestream keeps a week of history (`deploy/litestream.yml`: daily snapshots, `retention: 168h`). Recent moments come
back to within seconds; moments more than a few hours back may come back as they were up to an hour earlier (older
changes are merged into larger steps). So pick a time a little before the mistake, and check the result (step 3).

1. Decide the moment to go back to, in **UTC** (the site's logs are in UTC), e.g. `2026-10-25T09:00:00Z`.
2. Put the site in maintenance so nobody adds data that would be lost: add `MAINTENANCE_MODE=1` to `deploy/.env`,
   then `docker compose up -d app`.
3. Restore that moment into a side file and check it before swapping anything:
   ```bash
   cd /srv/oomba/app/deploy
   docker compose run --rm --no-deps app litestream restore -timestamp 2026-10-25T09:00:00Z -integrity-check quick -o /data/restored.db /data/brb.db
   ```
   (`litestream ltx /data/brb.db` in the same way lists what history exists; adding `-dry-run` to the restore shows
   which files it would use without writing anything.)
4. Swap it in:
   ```bash
   docker compose stop app
   sudo mkdir -p /srv/oomba/data/replaced-$(date +%F)
   sudo mv /srv/oomba/data/brb.db /srv/oomba/data/brb.db-wal /srv/oomba/data/brb.db-shm /srv/oomba/data/replaced-$(date +%F)/ 2>/dev/null
   sudo mv /srv/oomba/data/restored.db /srv/oomba/data/brb.db
   ```
5. Remove `MAINTENANCE_MODE=1` from `.env` and `docker compose up -d app`. Litestream notices the database changed
   and starts a fresh backup history from it (the old history stays until its retention ends).
6. Check as in A.5. Delete the `replaced-...` folder after a week.

## C. Restore from a disk snapshot or a local backup

- **Disk snapshot** (EBS snapshot, Azure Backup / disk snapshot): create a new disk from the snapshot, attach it in
  place of the broken one at the same mount point (`/srv/oomba`), and start. The database is as it was at snapshot
  time; anything after it is lost. If the snapshot was taken while the site was writing, SQLite recovers on start
  (the `-wal` file is part of the snapshot).
- **`npm run backup` copies** (`/srv/oomba/data/backups/brb-<time>.db`, newest 14): stop the app, move `brb.db*` aside
  (as in B.4), `sudo cp backups/brb-<time>.db brb.db && sudo chown 1000:1000 brb.db`, start. These live on the same
  disk, so they help with mistakes, not with a lost disk.
- **A moving-day archive** (`scripts/export-data.js`): on an empty data folder,
  `sudo tar -xzf oomba-data-<time>.tgz -C /srv/oomba/data && sudo chown -R 1000:1000 /srv/oomba/data`, then start.

## D. Restore drill (every 3 months)

Proves that the off-server copy is complete and that you can get it back, without touching the live site. Takes
about 10 minutes. Do it on the server itself or on any computer with Docker.

1. Restore the latest copy into a scratch folder, with an integrity check:
   ```bash
   cd /srv/oomba/app/deploy
   mkdir -p /tmp/drill && sudo chown 1000:1000 /tmp/drill
   docker compose run --rm --no-deps -v /tmp/drill:/drill app \
     litestream restore -integrity-check full -o /drill/brb.db /data/brb.db
   ```
   It must end without errors.
2. Look inside it:
   ```bash
   docker compose run --rm --no-deps -v /tmp/drill:/drill app node -e "const D=require('better-sqlite3');const d=new D('/drill/brb.db',{readonly:true});for(const t of ['users','games','game_versions','saves','schools'])console.log(t,d.prepare('SELECT count(*) c FROM '+t).get().c);console.log('newest user:',new Date(d.prepare('SELECT max(created_at) m FROM users').get().m).toISOString())"
   ```
   The numbers should be close to `/admin/stats`, and the newest user from the last day or so.
3. Go back in time: restore the moment two days ago into a second file and look inside it the same way (put the
   date of two days ago, in UTC, after `-timestamp`):
   ```bash
   docker compose run --rm --no-deps -v /tmp/drill:/drill app \
     litestream restore -timestamp 2026-10-23T09:00:00Z -integrity-check quick -o /drill/older.db /data/brb.db
   ```
   It must end without errors, and step 2 with `/drill/older.db` should show a newest user from about then. If it
   fails, the history is shorter than you think: note it, and rely on the disk snapshots for older moments.
4. Optional, the full check: run the restored copy as a throw-away site on the server only (no Litestream variables,
   so it can never write into the real backup):
   ```bash
   docker run --rm -d --name drill -p 127.0.0.1:3999:3000 -e BRB_SNAPSHOTS=0 -v /tmp/drill:/data oomba-academy:latest
   curl -s http://127.0.0.1:3999/health
   ```
   From your computer, `ssh -L 3999:127.0.0.1:3999 <server>` and open http://localhost:3999 to sign in and look
   around. Then `docker stop drill`.
5. Clean up: `sudo rm -rf /tmp/drill`.
6. Write the date, the counts and "OK" (or what went wrong) in your ops notes.

How these steps were tested (Docker Compose stack from `deploy/`, Litestream 0.5.17 in the image): a fresh empty
disk restored itself on start (A) and an account created seconds before the old container stopped could sign in; a
point-in-time restore (B) brought back an account made before the chosen moment and dropped one made after it, and
the drill (D) afterwards showed Litestream had carried on backing up the swapped-in database.

## E. When the backup can't be trusted

The server can write to the backup bucket (it has to), so someone who broke into the app could delete or overwrite
what is there. That is why bucket versioning (AWS) / soft delete and versioning (Azure) are required in the deploy
guides: earlier versions of every file stay for 30 days, out of the server's reach.

1. Stop the automatic restore from using the bad copy: add `LITESTREAM_AUTO_RESTORE=0` and remove
   `LITESTREAM_REPLICA_URL` in `deploy/.env` (the app then runs without replication), and don't replace the disk yet.
2. If the live database on the disk is fine, keep using it: once the bucket is cleaned up (or pointed at a new path,
   `s3://bucket/oomba-2026b`), put `LITESTREAM_REPLICA_URL` back and Litestream starts a fresh backup from it.
3. If you need the old backup: AWS: in the S3 console turn on *Show versions* and, under `oomba/`, delete the newer
   versions and delete markers so the earlier versions become current again; Azure: *Show deleted blobs* and
   *Undelete*, or promote a blob's earlier version. Then restore as in A or B into a side file and check it before
   using it.
4. The disk snapshots (EBS / Azure Backup) are a separate copy: section C.

## Things that go wrong

- **`restoring from the replica failed`**: wrong `LITESTREAM_REPLICA_URL`, keys, or (on EC2) the instance role is
  missing or IMDSv2's hop limit is 1 (containers need 2; see the AWS guide). Fix `.env` and start again.
- **The site started empty although a backup exists**: `LITESTREAM_AUTO_RESTORE=0` was set, or `LITESTREAM_REPLICA_URL`
  was missing. Stop the app, delete the new empty `brb.db*`, fix `.env`, start again.
- **Two servers pointed at the same replica URL**: never do this (e.g. the old and the new server during a move).
  Give each its own path (`s3://bucket/oomba-2026`), or remove the variables from the one you're retiring.
- **`BRB_JOURNAL_MODE=DELETE`** (managed containers on a network share): Litestream does not run; use the file
  share's own backups (AWS Backup for EFS, Azure Files snapshots) and restore with section C.
