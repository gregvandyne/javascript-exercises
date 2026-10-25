# Running Oomba Academy on Azure

A step-by-step guide for the site owner. Part 1 is the recommended setup and is all most sites need. The other parts
are references: backups, monitoring, security, managed-container alternatives, and the move from Render.

**What you get with Part 1:** one Azure virtual machine with a separate managed data disk, running the app and Caddy
(which gets HTTPS certificates by itself) with Docker Compose. Backups go continuously to Blob storage (Litestream)
plus a daily Azure Backup of the VM. A third container, the screenshot worker, runs the headless Chromium that takes
cover pictures, away from the data: no database, no disk, no secrets but its own token, and no internet
(`deploy/docker-compose.yml`, service `shots`).

**Ground rules that come from how the app works** (they apply to every option below):

- **One app instance, no autoscaling.** Rate limits, live "N playing" counts and one-time login cards live in the
  app's memory, and the SQLite database accepts one writer. Never run two copies against the same data. (Growing past
  one server would mean Redis and Postgres first; that is not needed now.)
- **The database wants a block disk** (a managed disk), not a network file share. On Azure Files you must set
  `BRB_JOURNAL_MODE=DELETE`, writes get slower, and Litestream can't be used.
- **2 GB of memory at the very least**, 4 GB recommended. Chromium takes up to about 1 GB while it takes a picture;
  the compose file caps the app and the screenshot worker at 1 GB each, so a heavy game can stall the worker, never
  the site.

Contents: [1. Recommended: one VM](#1-recommended-one-vm-with-a-managed-data-disk) · [2. Backups](#2-backups) ·
[3. Monitoring and alerts](#3-monitoring-and-alerts) · [4. Sizing](#4-sizing) · [5. Secrets (Key Vault)](#5-secrets-key-vault) ·
[6. Security, WAF and rate limits](#6-security-waf-and-edge-rate-limits) · [7. TRUST_PROXY on Azure](#7-trust_proxy-on-azure) ·
[8. Alternatives: Container Apps, App Service](#8-alternatives) · [9. Moving from Render: cut-over checklist](#9-moving-from-render-cut-over-checklist) ·
[10. When something is wrong](#10-when-something-is-wrong)

---

## 1. Recommended: one VM with a managed data disk

Time: about an hour the first time. You need: an Azure subscription, a domain name you can edit DNS for (e.g.
`play.example.com`), and the admin password and AI key you use today.

### 1.1 Resource group and the backup storage

1. In the Azure portal: **Resource groups → Create**: name `oomba`, a region near your players (e.g. *West Europe* or
   *East US*). Use this group and region for everything below.
2. **Storage accounts → Create**: resource group `oomba`, a name like `oombabackups123` (lowercase letters and digits,
   unique), performance *Standard*, redundancy *ZRS* (or LRS). On the *Advanced* tab turn **off** "Allow enabling
   anonymous access on individual containers". Create.
3. In the storage account: **Containers → + Container** `litestream`, access level *Private*.
4. **Required: Data protection.** Tick *Enable soft delete for blobs* (14 days), *Enable soft delete for containers*
   (14 days) and *Enable versioning for blobs* with *Delete versions after 30 days*. Save.
   Why: the server must be allowed to write and delete in the container (Litestream tidies up old files), so someone
   who broke into the app could delete or overwrite the backups too. With soft delete and versioning, deleted or
   overwritten files stay recoverable, and the server's access (1.2) can't change these settings or remove old
   versions. That is also why the guide doesn't use the account key: it controls the whole account, these settings
   included.

### 1.2 Create the VM

**Virtual machines → Create → Azure virtual machine:**

| Tab / setting | Value |
|---|---|
| Basics → name / region | `oomba`, same region |
| Image | **Ubuntu Server 24.04 LTS - x64 Gen2** |
| Size | **Standard_B2ls_v2** (2 vCPUs, 4 GiB), or the AMD twin Standard_B2als_v2. Avoid the older B sizes without `_v2` (Standard_B1ms, B2s, B2ms): they retire in November 2028 and can no longer be reserved. |
| Authentication | SSH public key; let Azure generate a new key pair and **download the private key** when asked (`oomba_key.pem`). Username `azureuser`. |
| Public inbound ports | **None** (you'll open exactly what's needed in 1.3) |
| Disks → OS disk | Standard SSD |
| Disks → Data disks | **Create and attach a new disk**: 32 GiB, Standard SSD (or Premium SSD for faster writes), LUN 0. Untick "Delete with VM" if offered: the data disk must survive the VM. |
| Networking | New virtual network and a new public IP (the default *Standard* public IP is static: the address never changes) |
| Management | Turn on **system-assigned managed identity** (for the backups below and Key Vault in section 5) |
| Monitoring | Leave boot diagnostics on |

Create. Then turn on backups: **VM → Backup → Enable backup** (new Recovery Services vault, the default daily policy;
it covers the OS and data disk).

Give the VM access to the backup container, so no storage key is needed anywhere: **Storage account → Containers →
litestream → Access Control (IAM) → Add → Add role assignment → Storage Blob Data Contributor → Members: Managed
identity → Virtual machine → oomba → Review + assign.** (Scoped to that one container; it can't change the
storage account's settings.)

### 1.3 Open the right ports

**VM → Networking → Network settings → Create port rule → Inbound**:

- **HTTP (80)** and **HTTPS (443)**, source *Any* (80 is needed for the certificate and redirects to HTTPS).
- **SSH (22)**, source **My IP address** only.

Do **not** open port 3000.

### 1.4 Connect

On your computer (Windows PowerShell, macOS or Linux terminal), with the key you downloaded:

```bash
chmod 600 oomba_key.pem                    # macOS/Linux only
ssh -i oomba_key.pem azureuser@<public IP>
```

### 1.5 Prepare the data disk

```bash
sudo -i                                   # become root for the setup
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT        # the 32G disk with no mount point, usually sdc
                                          # (NOT the one mounted on /mnt: that temporary disk is wiped on restarts)
mkfs.ext4 -L oomba-data /dev/sdc          # ONLY on the new, empty disk: this erases it
mkdir -p /srv/oomba
echo 'LABEL=oomba-data /srv/oomba ext4 defaults,nofail 0 2' >> /etc/fstab
mount -a && df -h /srv/oomba              # should show about 32G mounted on /srv/oomba
mkdir -p /srv/oomba/data /srv/oomba/app
chown 1000:1000 /srv/oomba/data           # the app runs as user 1000 ("node")
```

(`nofail` lets the VM boot even if the disk is missing, so you can still connect and fix it. The app then refuses to
start, instead of starting an empty site on the OS disk: the compose file requires `/srv/oomba/data` to exist.)

### 1.6 Install Docker

```bash
curl -fsSL https://get.docker.com | sh    # Docker Engine + the Compose plugin, from Docker's own repository
docker compose version
```

Ubuntu installs security updates by itself (unattended-upgrades). Reboot once a month: `reboot` (the site comes back
by itself; down for a minute or two).

### 1.7 Get the code

```bash
cd /srv/oomba/app
git clone https://github.com/<owner>/<repo>.git .
```

If the repository is private, create a read-only token on GitHub (*Settings → Developer settings → Fine-grained
tokens*, "Contents: read" on this repository) and use it as the password when git asks.

### 1.8 Fill in the settings

```bash
cd /srv/oomba/app/deploy
cp .env.example .env
chmod 600 .env
nano .env                                  # Ctrl+O to save, Ctrl+X to quit
```

| Setting | Value |
|---|---|
| `SITE_DOMAIN` / `PUBLIC_URL` | `play.example.com` / `https://play.example.com`. Moving a domain that points at Render today: `SITE_DOMAIN` is a temporary name such as `new.example.com` until moving day ([section 9](#9-moving-from-render-cut-over-checklist)); `PUBLIC_URL` is the final address from the start. |
| `ACME_EMAIL` | your email |
| `SESSION_SECRET` | moving from Render: the exported one ([section 9](#9-moving-from-render-cut-over-checklist)); brand-new site: output of `openssl rand -hex 32` |
| `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY` | the same as on Render today |
| `SHOTS_TOKEN` | output of `openssl rand -hex 32` (a new one: it is only shared between the app and the screenshot worker) |
| `LITESTREAM_REPLICA_URL` | `abs://oombabackups123@litestream/oomba` (storage account `@` container `/` folder). Leave `LITESTREAM_AZURE_SAS_TOKEN` empty: Litestream uses the VM's managed identity (1.2). Leave the URL empty while you prepare a move from Render; see section 9. |

Keep the master copy of the secrets in Key Vault (section 5).

### 1.9 Point your domain at the VM

At your DNS provider (Azure DNS: **DNS zones → your zone → + Record set**), create an **A record** for
`play.example.com` (or the temporary name, if your domain still points at Render) with the VM's public IP, TTL 300. (Add `www` too if you want `www.play.example.com` to redirect;
if not, delete the `www.` block at the end of `deploy/Caddyfile`.) Wait until `dig +short play.example.com` shows the
IP.

### 1.10 Start

```bash
cd /srv/oomba/app/deploy
docker compose up -d --build              # the first build takes several minutes
docker compose ps                         # app, shots and caddy "running"; app and shots become "healthy"
docker compose logs -f app                # Ctrl+C to stop watching
```

The app log shows `"msg":"listening"` with `"sessionSecret":"env"` and `"journalMode":"wal"`, and with Litestream on,
`starting with Litestream replication`. The worker's log (`docker compose logs shots`) says `shots-worker listening`
with `"three":"0.185.1"` (the 3D library is in the image), then `job done` for each cover. Caddy's log (`docker compose logs caddy`) says `certificate obtained
successfully`. Open `https://play.example.com`, sign in as admin and open a game.

### 1.11 Updating to a new version

```bash
cd /srv/oomba/app && git pull
cd deploy && docker compose up -d --build
```

The new image is built while the old one keeps serving; then the app container is replaced: it finishes open requests
and Builder replies (up to 25 s) and the site is unavailable for roughly 10–30 seconds. To go back:
`git checkout <previous commit>` and the same command.

Useful: `docker compose logs --since 1h app`, `docker compose restart app`,
`docker compose exec -u node app node scripts/backup.js` (always `-u node` so files keep the right owner).

---

## 2. Backups

1. **Litestream → Blob storage, continuous (the database).** On when `LITESTREAM_REPLICA_URL` is set. Changes are
   shipped every 10 seconds; a full snapshot daily, a week of history (`deploy/litestream.yml`). Check:
   `docker compose exec -u node app litestream ltx /data/brb.db`, or look in the `litestream` container in the portal.
   Soft delete and versioning (1.1) are required: they keep these backups safe if the app is ever broken into. If the
   newest backup ever looks wrong, the runbook restores an earlier moment, and the portal can bring back deleted
   blobs or earlier versions (*Show deleted blobs*, a blob's *Versions* tab).
2. **Azure Backup of the VM (the whole disk, including cover pictures, profile photos and uploads).** Turned on in 1.2;
   check **VM → Backup** shows a recent restore point after the first night.

**Restoring, and a restore drill every three months:** [`docs/runbook-restore.md`](runbook-restore.md). To get a disk
back from Azure Backup: *VM → Backup → Restore VM → Restore disks*, then attach the restored data disk to a VM at
`/srv/oomba` (runbook section C).

---

## 3. Monitoring and alerts

1. **Monitor → Alerts → Action groups → Create**: `oomba-alerts`, notification *Email* to you.
2. **Is the site up?** Create an **Application Insights** resource (`oomba-uptime`, in `oomba`). In it:
   **Availability → Add Standard test**: URL `https://play.example.com/health`, frequency 5 minutes, 3+ locations,
   *Content match* `"ok":true`. Its alert rule → action group `oomba-alerts`. `/health` answers 503 when the database
   doesn't answer or its file disappeared, when the data disk is full (under 100 MB free) or refuses a test file, and
   while the app is shutting down.
3. **Is the VM healthy?** **VM → Alerts → Create alert rule**: signal *VM Availability Metric* less than 1, and
   *Percentage CPU* greater than 90 for 15 minutes; action group `oomba-alerts`.
4. **Disk and memory.** **VM → Monitoring → Insights → Enable** (VM insights, with a new Log Analytics workspace). Then
   **Monitor → Alerts → Create → Custom log search** on that workspace, every 15 minutes, alert when a row is
   returned:
   ```kusto
   InsightsMetrics
   | where Namespace == "LogicalDisk" and Name == "FreeSpacePercentage"
   | where tostring(parse_json(Tags)["vm.azm.ms/mountId"]) == "/srv/oomba"
   | summarize Free = min(Val) by Computer
   | where Free < 20
   ```
   (and the same with `Namespace == "Memory" and Name == "AvailableMB"` below about 400).
5. **Money.** **Cost Management → Budgets → Add**, a monthly budget with an email at 80 %. Keep the AI spend limit in
   the Anthropic Console as well; the site's own caps are `AI_DAILY_BUDGET_USD` / `AI_MONTHLY_BUDGET_USD`.
6. **Logs.** `docker compose logs app` keeps the last 50 MB per container. Each line is JSON;
   `grep '"level":"error"'` finds problems.

---

## 4. Sizing

| Site size | VM size | Data disk |
|---|---|---|
| Small and recommended start | **Standard_B2ls_v2** (2 vCPU / 4 GiB; there is no 2 GiB `_v2` size worth using) | 32 GiB Standard SSD |
| Busy (many schools, Builder used all day) | Standard_B2s_v2 (2 vCPU / 8 GiB) or Standard_D2s_v5 / D2as_v5 | 64 GiB Premium SSD |

Memory runs out first (Chromium, in the `shots` container; `BRB_SNAPSHOTS=0` in `.env` turns cover pictures off if
the VM is short of memory). B-series VMs earn CPU credits while idle; if *CPU Credits Remaining* keeps hitting
zero, pick a D-series size. Growing the disk: stop the VM, *Disks → the data disk → Size*, start, then
`sudo resize2fs /dev/sdc`.

---

## 5. Secrets (Key Vault)

The secrets are `SESSION_SECRET`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY` and `SHOTS_TOKEN` (the backups need no
secret: the VM's managed identity is used). On the VM they live only in
`deploy/.env` (mode 600). Keep the master copy in Key
Vault so a lost VM doesn't lose them:

1. **Key vaults → Create** `oomba-kv-<unique>` (permission model: Azure role-based access control). Give yourself the
   role *Key Vault Secrets Officer* on it, and the VM's managed identity *Key Vault Secrets User*
   (**Access control (IAM) → Add role assignment**).
2. **Secrets → Generate/Import** one secret per value. Key Vault names allow dashes but not underscores:
   `SESSION-SECRET`, `ADMIN-PASSWORD`, `ANTHROPIC-API-KEY`, `SHOTS-TOKEN`.
3. To rebuild the secrets on a new VM (install the CLI once: `curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash`):
   ```bash
   az login --identity
   cd /srv/oomba/app/deploy && umask 077
   for s in SESSION-SECRET ADMIN-PASSWORD ANTHROPIC-API-KEY SHOTS-TOKEN; do
     echo "$(echo $s | tr - _)=$(az keyvault secret show --vault-name oomba-kv-<unique> --name $s --query value -o tsv)"
   done > secrets.env
   # then copy those lines into .env (or add "- secrets.env" under env_file for the app in docker-compose.yml)
   ```

`REQUIRE_SESSION_SECRET=1` (set in `.env.example`) makes the app refuse to start if `SESSION_SECRET` went missing,
instead of quietly using a different one.

---

## 6. Security, WAF and edge rate limits

Already there: HTTPS everywhere (Caddy, HSTS), the app's own security headers and per-user / per-address rate limits
(sign-in, sign-up, Builder, chat, uploads), port 3000 closed, the app running as an unprivileged user that can't regain
privileges, and Chromium isolated in the screenshot worker (no data, no secrets, no internet, read-only).

**Azure Front Door with a WAF policy** adds bot protection and edge rate limits in front of the VM. Worth it if you
see abuse; a bigger change, fine to add after launch:

1. Give the VM a second name, e.g. `origin.play.example.com` (A record to the VM's IP), and add it to the site line in
   the Caddyfile (`{$SITE_DOMAIN}, origin.play.example.com {`).
2. Create **Front Door (Standard or Premium)** with the origin `origin.play.example.com`, HTTPS, *origin host header*
   = `origin.play.example.com`, custom domain `play.example.com` (Front Door manages its certificate). Front Door's
   origin response timeout: raise it to 240 s (the Builder stream also sends a heartbeat every 15 s). Caching off.
3. **WAF policy** on it: a custom **rate limit rule** (e.g. more than 300 requests in 5 minutes from one client IP to
   paths beginning `/api/auth/` → block), and on Premium the Microsoft managed rule set and bot protection.
4. Because Front Door rewrites the Host header, set `PUBLIC_URL=https://play.example.com` (login cards and the
   same-origin checks then use the real address). Add `TRUST_PROXY=2` to `deploy/.env`, and in the Caddyfile replace
   the `header_up X-Forwarded-For {remote_host}` line by `trusted_proxies static 0.0.0.0/0` under the global
   `servers` block, **only together with the next step**. Then `docker compose up -d`.
5. Make sure nobody can go around Front Door:
   - Caddy rejects anything not from *your* Front Door: inside the site block add
     `@notfd not header X-Azure-FDID <your Front Door ID>` and `respond @notfd 403` (the ID is on the Front Door
     overview page).
   - Change the VM's **HTTPS (443)** rule's source to the service tag **AzureFrontDoor.Backend**.
   - **Leave HTTP (80) open to Any.** Let's Encrypt checks `origin.play.example.com` on port 80 each time Caddy renews
     its certificate (every couple of months); with port 80 closed, renewal fails, Front Door refuses the expired
     certificate and the whole site goes down. Caddy only answers those checks there and redirects everything else
     to HTTPS.

---

## 7. TRUST_PROXY on Azure

`TRUST_PROXY` tells the app which proxies sit between the visitor and it, so it can find the visitor's real address
for rate limits. It must be exact, and the app's port must not be reachable around the proxies.

| Setup | `TRUST_PROXY` |
|---|---|
| VM + Caddy (Part 1) | Caddy's Docker network, `172.30.42.0/24` (set in `docker-compose.yml`; nothing to do) |
| Front Door → VM + Caddy | `2` in `deploy/.env`, plus the Caddy and port changes in section 6 |
| Container Apps (built-in ingress) | `1` |
| App Service | `1` |
| Front Door → App Service | `2`, and lock the app to your Front Door: *Networking → Access restrictions → Add*: type *Service Tag* `AzureFrontDoor.Backend`, with the HTTP header filter `X-Azure-FDID` = your Front Door ID; unmatched rule action *Deny* (also for the `scm` site if you don't use it) |
| Front Door → Container Apps | `2`, and lock it to Front Door: Container Apps ingress restrictions take address ranges, not service tags, so use **Front Door Premium with a Private Link origin** and turn the environment's public network access off. Without that, anyone can reach the app directly and fake their address: then leave Front Door out |
| Application Gateway → App Service | `2`, with a rewrite rule setting `X-Forwarded-For` to `{var_add_x_forwarded_for_proxy}` (Application Gateway otherwise adds the client's port; the app drops a `:port` anyway), and an App Service access restriction allowing only the gateway's subnet |

If the app logs `X-Forwarded-For arrived but TRUST_PROXY is off`, a proxy is in front of it and the setting is
missing.

---

## 8. Alternatives

Both use Azure Files (a network share) for the data, so both need `BRB_JOURNAL_MODE=DELETE`, can't use Litestream
(back up the file share instead: **Azure Backup for Azure Files**, daily), and must never run two copies at once.
Build the image in Azure without Docker on your computer: create an **Azure Container Registry** and run
`az acr build --registry <name> --image oomba-academy:<tag> .` in the repository folder.

### Azure Container Apps + Azure Files

- **Storage:** a file share `oomba-data` in a storage account; add it to the Container Apps environment
  (*Environment → Azure Files → Add*, read/write). Mount it in the app at `/data` with **mount options**
  `uid=1000,gid=1000,nobrl` so the app's user owns the files (the container can't `chown` on SMB; it only warns) and
  SQLite's locks stay inside the container. `nobrl` is safe only because there is exactly one replica.
- **Exactly one replica:** scale rule min **1**, max **1**. Updates normally start the new revision before stopping the
  old one, which would mean two writers for a moment. Use *multiple revision mode* with traffic on the latest
  revision (`az containerapp ingress traffic set -n oomba -g oomba --revision-weight latest=100`) and deploy
  stop-before-start:
  ```bash
  OLD=$(az containerapp revision list -n oomba -g oomba --query "[?properties.active].name" -o tsv)
  az containerapp revision deactivate -n oomba -g oomba --revision $OLD
  az containerapp update -n oomba -g oomba --image <registry>.azurecr.io/oomba-academy:<new tag>
  ```
  (A minute of downtime per deploy.) Check with `az containerapp replica list -n oomba -g oomba` that one replica runs.
- **App container:** 1 vCPU / 2 Gi; ingress external, target port 3000; environment `NODE_ENV=production`,
  `BRB_DATA_DIR=/data`, `BRB_JOURNAL_MODE=DELETE`, `TRUST_PROXY=1`, `PUBLIC_URL`, `REQUIRE_SESSION_SECRET=1`,
  secrets as **Key Vault references** (managed identity) mapped to `SESSION_SECRET`, `ADMIN_PASSWORD`,
  `ANTHROPIC_API_KEY`; liveness and readiness probes on HTTP `/health` port 3000 (startup probe with 60 s of grace:
  the seed runs at every start). Also `SNAPSHOT_URL=http://localhost:4900` and the secret `SHOTS_TOKEN`.
- **Screenshot worker** as a second container in the same app: same image, command `node server/shots-worker.js`,
  0.5 vCPU / 1 Gi, environment `SHOTS_PORT=4900`, `HOME=/tmp`, secret `SHOTS_TOKEN` and nothing else, no volume.
  Containers in one app share its network, so unlike the compose stack the worker can reach the internet; it still
  has no data or secrets.
- **Limits to know:** ingress cuts requests at 240 seconds, so a very long Builder reply can be cut off (the turn keeps
  running and the Studio shows the result when it's done). Container Apps waits 30 s after SIGTERM by default, which
  fits the app's 25 s.

### Azure App Service (Linux, custom container)

Possible, but the weakest fit: Microsoft advises against SQLite on App Service's network storage, and a restart can
briefly run the old and new container together.

- Plan with at least 2 GiB (e.g. B2 or P0v3), **instance count 1**, no autoscale, **no deployment slots** (a swap
  runs two copies). Chromium runs inside the app container here (no `SNAPSHOT_URL`), as on Render.
- App settings: `WEBSITES_PORT=3000`, `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true`, `BRB_DATA_DIR=/home/data` (the
  persistent `/home` share), `BRB_JOURNAL_MODE=DELETE`, `TRUST_PROXY=1`, `PUBLIC_URL`, `REQUIRE_SESSION_SECRET=1`,
  secrets as Key Vault references (`@Microsoft.KeyVault(SecretUri=...)`). *Health check* path `/health`; *Always on*.
- Requests are cut after 230 s.

---

## 9. Moving from Render: cut-over checklist

**About staying signed in:** browsers keep sign-in cookies per web address. Carrying `SESSION_SECRET` over keeps
everyone signed in **if the address stays the same** (your own domain moves from Render to Azure). If the site moves
from `magic-cup.onrender.com` to a new domain, people sign in once on the new address whatever you do. Carry the
secret over anyway: it costs nothing and keeps game links and future moves smooth.

**Which case are you?** (a) Your own domain (say `play.example.com`) points at Render today: the VM uses a temporary
name such as `new.example.com` until moving day, and the domain's DNS moves in step 8. (b) The site lives at
`magic-cup.onrender.com` and moves to a domain that has never pointed at Render: use that domain from the start;
there is no DNS switch. Steps marked **(a)** are for the first case only.

### A week before

- [ ] Merge this version and let Render deploy it. It is safe there: nothing changes until the new settings are set.
      Check the Render log shows `"msg":"listening"`. (The moving-day scripts below come with it.)
- [ ] Build the Azure VM (Part 1) with `LITESTREAM_REPLICA_URL` **empty** for now. `SITE_DOMAIN`: (a) the temporary
      name, with its A record pointing at the VM; (b) the final domain. `PUBLIC_URL`: the final address in both
      cases. Check `https://<SITE_DOMAIN>/health` says `"ok":true`.
- [ ] Dress rehearsal, still without Litestream (so the rehearsal copy never reaches the backup container): do
      moving-day steps 3, 4 and 6 once, *without* maintenance mode on Render. Sign in on `https://<SITE_DOMAIN>` and
      check your admin account, games and schools. Then empty the new data folder again (step 6's `rm` commands).
- [ ] (a) Lower your domain's DNS **TTL to 300 seconds** now.

### Moving day (about an hour; the site is down 10–20 minutes)

1. [ ] **Copy the session secret.** Render dashboard → your service → **Shell**:
       ```bash
       node scripts/export-session-secret.js /tmp/session-secret.txt
       cat /tmp/session-secret.txt; rm /tmp/session-secret.txt
       ```
       Paste it into the VM's `.env` as `SESSION_SECRET=...` and into Key Vault. (It shows only in your browser's
       shell window, never in Render's logs. Don't paste it into chats or tickets.)
2. [ ] **Stop changes on Render.** Render → **Environment** → add `MAINTENANCE_MODE` = `1` → Save. Wait for the deploy;
       the site shows "Oomba Academy is moving to a new home".
3. [ ] **Pack the data.** In the Render Shell, first check there is room (Render's disk is small, and the export
       briefly needs about as much again as the database plus the pictures): `df -h /data; du -sh /data/*`. If `/data`
       is more than about 40 % full, delete old copies in `/data/backups` first (`ls -lh /data/backups`), or write the
       export elsewhere if `df -h /tmp` shows room: `node scripts/export-data.js /tmp/oomba-data.tgz`. Otherwise:
       `node scripts/export-data.js`. Note the file name and the `sha256`.
4. [ ] **Copy it to Azure** through your storage account (Render's Docker shell has no scp). In **Azure Cloud Shell**
       (the `>_` icon in the portal, Bash):
       ```bash
       ACCOUNT=oombabackups123
       az storage container create --account-name $ACCOUNT --name move --auth-mode key
       END=$(date -u -d '+2 hours' +%Y-%m-%dT%H:%MZ)
       az storage blob generate-sas --account-name $ACCOUNT --container-name move --name oomba-data.tgz \
         --permissions cw --expiry $END --https-only --full-uri --auth-mode key -o tsv      # upload link
       ```
       (Cloud Shell looks the account key up with your own portal sign-in, just for these commands.)
       In the **Render Shell**: `node scripts/upload-file.js /data/move/oomba-data-<time>.tgz`, then paste the upload
       link when it asks (that keeps it out of the shell history).
       Back in Cloud Shell, the same `generate-sas` command with `--permissions r` gives a download link. On the VM:
       ```bash
       curl -fL -o /tmp/oomba-data.tgz '<download link>'
       sha256sum /tmp/oomba-data.tgz            # must match the sha256 from step 3
       ```
5. [ ] **Settings on the VM.** In `deploy/.env`: `SESSION_SECRET` (step 1), `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`,
       `PUBLIC_URL` (the final address), `REQUIRE_SESSION_SECRET=1`, and now `LITESTREAM_REPLICA_URL`. Leave
       `SITE_DOMAIN` as it is for now.
6. [ ] **Unpack.**
       ```bash
       cd /srv/oomba/app/deploy && docker compose stop app
       sudo rm -f /srv/oomba/data/brb.db /srv/oomba/data/brb.db-wal /srv/oomba/data/brb.db-shm
       sudo rm -rf /srv/oomba/data/shots /srv/oomba/data/avatars /srv/oomba/data/uploads /srv/oomba/data/.brb.db-litestream
       sudo tar -xzf /tmp/oomba-data.tgz -C /srv/oomba/data
       sudo chown -R 1000:1000 /srv/oomba/data
       docker compose up -d
       docker compose logs app | grep -E 'listening|warn|error'
       ```
       Expect `"sessionSecret":"env"`, `"journalMode":"wal"`, `"publicUrl":"https://..."` and no errors.
7. [ ] **Go / no-go.** On `https://<SITE_DOMAIN>` (in case (a) still the temporary name): `/health` says
       `"ok":true`; sign in as admin; play a game; send one Builder message; print a class login card (it must show
       the final address); `/admin/stats` numbers match Render's.
       **No-go?** Render → Environment → delete `MAINTENANCE_MODE`. The old site is back as it was, nothing lost; fix
       the problem and repeat from step 3 another day.
8. [ ] **(a) Switch DNS.** The A record of your domain → the VM's public IP. Wait until `dig +short play.example.com`
       shows it. Then set `SITE_DOMAIN=play.example.com` in `.env` and run `docker compose up -d`: Caddy restarts for
       the real domain and gets its certificate within a minute or two (`docker compose logs caddy`). If the log shows
       failed attempts, `docker compose restart caddy` once `dig` is right.
       **Rollback** (until step 10): point the A record back at Render and delete `MAINTENANCE_MODE` there. Anything
       written on the VM since the switch stays only there.
9. [ ] **Check** on the real address: `/health`, admin sign-in, a game, a login card.
10. [ ] **Redirect the old address.** Render → Environment: delete `MAINTENANCE_MODE`, add `MOVED_TO_URL` =
       `https://play.example.com` → Save. Old `magic-cup.onrender.com` links now land on the same page of the new site
       (a temporary redirect for now). (a) Visitors whose DNS still points at Render for your own domain get the
       "moving" page, never a redirect loop; remove the domain under the service's *Custom Domains* a day later.
       After a week without problems, add `MOVED_PERMANENTLY` = `1`.
11. [ ] **Backups running**: `docker compose logs app | grep -i litestream`, and files under `oomba/` in the
       `litestream` container. Delete the `move` container in the storage account, and on Render `rm -r /data/move`
       (or the `/tmp` file).

### After

- [ ] Keep Render running with `MOVED_TO_URL` for 1–3 months (bookmarks, school handouts, shared game links), then
      **suspend** the Render service (Settings → Suspend). Keep the Render disk a little longer, then delete it.
- [ ] Do a restore drill ([runbook](runbook-restore.md), section D) in the first week.
- [ ] Never point two servers (old and new) at the same Litestream container path.

---

## 10. When something is wrong

| Symptom | Look at |
|---|---|
| Site down, `docker compose ps` shows app restarting | `docker compose logs --tail 100 app`. `startup failed` names the wrong setting (e.g. `PUBLIC_URL`, `BRB_JOURNAL_MODE`, missing `SESSION_SECRET` with `REQUIRE_SESSION_SECRET=1`). |
| `entrypoint: warning: /data is not writable by uid 1000` | VM: `sudo chown 1000:1000 /srv/oomba/data`. Azure Files: mount with `uid=1000,gid=1000`. |
| App won't start: `bind source path does not exist: /srv/oomba/data` | The data disk isn't mounted: `sudo mount -a && df -h /srv/oomba`, then `docker compose up -d`. |
| `restoring from the replica failed` at start | `LITESTREAM_REPLICA_URL` (account@container/path), or the VM's role assignment on the container (1.2; it can take a few minutes to apply). |
| `/health` 503, log `health check failing` with `disk full` | Grow the disk (section 4) or delete old copies in `/srv/oomba/data/backups`. |
| `/health` 503, log says the database file was deleted or replaced | Restart the app (`docker compose restart app`). If `brb.db` is really gone, see the runbook. |
| HTTPS certificate errors | DNS must point at the VM and ports 80/443 must be open in the network security group; `docker compose logs caddy`. |
| `database is locked` on Azure Files | Mount option `nobrl` missing, or two replicas running. |
| Builder replies arrive all at once at the end | Something in front buffers responses (Application Gateway: turn response buffering off). Caddy is set not to. |
| Everyone shares one rate limit ("slow down" for all) | `TRUST_PROXY` missing or too low (section 7). |
| Out of memory | Bigger VM (section 4); `docker stats` shows which container uses it. |
| No cover pictures for new games | App log `cover picture waiting for the screenshot worker`: `refused SHOTS_TOKEN` means `.env` changed without a restart of both (`docker compose up -d`); `unreachable` means `docker compose ps shots` is not running (`docker compose logs shots`). Covers are taken once it works again. `cover picture failed` names a game that would not run. |
