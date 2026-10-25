# Running Oomba Academy on AWS

A step-by-step guide for the site owner. Part 1 is the recommended setup and is all most sites need. The other parts
are references: backups, monitoring, security, a managed-container alternative, and the move from Render.

**What you get with Part 1:** one EC2 server (a virtual machine) with a separate EBS disk for the data, running the
app and Caddy (which gets HTTPS certificates by itself) with Docker Compose. Backups go continuously to S3
(Litestream) plus a daily disk snapshot. A third container, the screenshot worker, runs the headless Chromium that
takes cover pictures, away from the data: no database, no disk, no secrets but its own token, and no internet
(`deploy/docker-compose.yml`, service `shots`).

**Ground rules that come from how the app works** (they apply to every option below):

- **One app instance, no autoscaling.** Rate limits, live "N playing" counts and one-time login cards live in the
  app's memory, and the SQLite database accepts one writer. Never run two copies against the same data. (Growing past
  one server would mean Redis and Postgres first; that is not needed now.)
- **The database wants a block disk** (EBS), not a network file share. On a network share (EFS) you must set
  `BRB_JOURNAL_MODE=DELETE`, writes get slower, and Litestream can't be used.
- **2 GB of memory at the very least**, 4 GB recommended. Chromium takes up to about 1 GB while it takes a picture;
  the compose file caps the app and the screenshot worker at 1 GB each, so a heavy game can stall the worker, never
  the site.

Contents: [1. Recommended: one EC2 server](#1-recommended-one-ec2-server-with-an-ebs-disk) ·
[2. Backups](#2-backups) · [3. Monitoring and alerts](#3-monitoring-and-alerts) · [4. Sizing](#4-sizing) ·
[5. Secrets](#5-secrets) · [6. Security, WAF and rate limits](#6-security-waf-and-edge-rate-limits) ·
[7. TRUST_PROXY on AWS](#7-trust_proxy-on-aws) · [8. Alternatives: Lightsail, ECS Fargate](#8-alternatives) ·
[9. Moving from Render: cut-over checklist](#9-moving-from-render-cut-over-checklist) · [10. When something is wrong](#10-when-something-is-wrong)

---

## 1. Recommended: one EC2 server with an EBS disk

Time: about an hour the first time. You need: an AWS account, a domain name you can edit DNS for (e.g.
`play.example.com`), and the admin password and AI key you use today.

### 1.1 Pick a region and make the backup bucket

1. In the AWS console, choose a region near your players (top right), e.g. *US East (N. Virginia)* `us-east-1`. Use the
   same region for everything below.
2. **S3 → Create bucket.** Name it e.g. `oomba-backups-<something-unique>`. Keep **Block all public access** on.
   Default encryption (SSE-S3) is fine. **Bucket Versioning: Enable.** Create.
3. **Required: keep old versions for 30 days.** In the bucket: **Management → Create lifecycle rule**, name
   `old-versions`, apply to all objects, tick *Permanently delete noncurrent versions of objects* (30 days after they
   become noncurrent) and *Delete expired object delete markers*. Create.
   Why: the server must be allowed to delete files (Litestream tidies up old ones), so someone who broke into the app
   could delete or overwrite the backups too. With versioning, a deleted or overwritten file stays recoverable for 30
   days, and the server's role (next step) has no permission to remove old versions or to turn versioning off.

### 1.2 Give the server permission to use the bucket (IAM role)

1. **IAM → Policies → Create policy → JSON**, paste (put your bucket name in both places), name it `oomba-backups`:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": ["s3:ListBucket", "s3:GetBucketLocation"], "Resource": "arn:aws:s3:::BUCKET" },
       { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::BUCKET/*" }
     ]
   }
   ```
2. **IAM → Roles → Create role → AWS service → EC2.** Attach `oomba-backups`, `AmazonSSMManagedInstanceCore` (lets you
   open a terminal from the browser, no SSH keys or open port 22) and, for disk/memory alarms later,
   `CloudWatchAgentServerPolicy`. Name it `oomba-server`.

With the role, the server needs **no** AWS keys in any file. Don't add `s3:DeleteObjectVersion`,
`s3:PutBucketVersioning` or `s3:PutLifecycleConfiguration` to this policy: their absence is what keeps the old
versions safe.

### 1.3 Launch the server

**EC2 → Launch instance:**

| Setting | Value |
|---|---|
| Name | `oomba` |
| Image | **Ubuntu Server 24.04 LTS** (64-bit x86) |
| Instance type | **t3.medium** (2 vCPU, 4 GiB). `t3.small` (2 GiB) works for a small site but leaves little room. |
| Key pair | "Proceed without a key pair" (you'll use Session Manager). Or pick one if you prefer SSH. |
| Network settings → Firewall | Create a security group `oomba-web`: allow **HTTPS (443)** and **HTTP (80)** from anywhere (80 is needed for the certificate and redirects to HTTPS). **Don't** allow port 3000. Don't allow SSH (22) unless you chose a key pair, and then only from *My IP*. |
| Configure storage | Root: 20 GiB gp3. **Add new volume**: 20 GiB **gp3**, device `/dev/sdf`, "Delete on termination" **off** (the data disk must survive the server). |
| Advanced details → IAM instance profile | `oomba-server` |
| Advanced details → Metadata version | **V2 only (token required)** |
| Advanced details → Metadata response hop limit | **2** (containers need 2 to reach the role's credentials; with 1, Litestream gets no credentials and backups fail) |

Launch. Then tag the data volume so the snapshot policy finds it: **EC2 → Volumes →** the 20 GiB volume **→ Tags →**
add `Backup` = `oomba`.

### 1.4 Give it a fixed address

**EC2 → Elastic IPs → Allocate**, then **Actions → Associate** with the `oomba` instance. Write the IP down.

### 1.5 Open a terminal and prepare the data disk

**EC2 → Instances → oomba → Connect → Session Manager → Connect.** In the browser terminal:

```bash
sudo -i                                   # become root for the setup
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT        # find the empty 20G disk with no mount point, usually nvme1n1
mkfs.ext4 -L oomba-data /dev/nvme1n1      # ONLY on the new, empty disk: this erases it
mkdir -p /srv/oomba
echo 'LABEL=oomba-data /srv/oomba ext4 defaults,nofail 0 2' >> /etc/fstab
mount -a && df -h /srv/oomba              # should show about 20G mounted on /srv/oomba
mkdir -p /srv/oomba/data /srv/oomba/app
chown 1000:1000 /srv/oomba/data           # the app runs as user 1000 ("node")
```

(`nofail` lets the server boot even if the disk is missing, so you can still connect and fix it. The app then
refuses to start, instead of starting an empty site on the small root disk: the compose file requires
`/srv/oomba/data` to exist.)

### 1.6 Install Docker

```bash
curl -fsSL https://get.docker.com | sh    # Docker Engine + the Compose plugin, from Docker's own repository
docker compose version                    # check it works
```

Ubuntu installs security updates by itself (unattended-upgrades). Reboot once a month: `reboot` (the site comes back
by itself; it is down for a minute or two).

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

Fill in at least:

| Setting | Value |
|---|---|
| `SITE_DOMAIN` / `PUBLIC_URL` | `play.example.com` / `https://play.example.com`. Moving a domain that points at Render today: `SITE_DOMAIN` is a temporary name such as `new.example.com` until moving day ([section 9](#9-moving-from-render-cut-over-checklist)); `PUBLIC_URL` is the final address from the start. |
| `ACME_EMAIL` | your email |
| `SESSION_SECRET` | moving from Render: the exported one ([section 9](#9-moving-from-render-cut-over-checklist)); brand-new site: output of `openssl rand -hex 32` |
| `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY` | the same as on Render today |
| `SHOTS_TOKEN` | output of `openssl rand -hex 32` (a new one: it is only shared between the app and the screenshot worker) |
| `LITESTREAM_REPLICA_URL` | `s3://oomba-backups-<...>/oomba` (leave the two key lines empty: the role is used). Add a line `AWS_REGION=us-east-1` (your region). Leave it empty while you prepare a move from Render; see section 9. |

Keep a copy of the secrets somewhere safe outside the server too (section 5).

### 1.9 Point your domain at the server

At your DNS provider (Route 53: **Hosted zones → your domain → Create record**), create an **A record** for
`play.example.com` (or the temporary name, if your domain still points at Render) with the Elastic IP, TTL 300. (Add `www` too if you want `www.play.example.com` to redirect; if not,
delete the `www.` block at the end of `deploy/Caddyfile`.) Wait until it resolves: `dig +short play.example.com`
shows the IP.

### 1.10 Start

```bash
cd /srv/oomba/app/deploy
docker compose up -d --build              # the first build takes several minutes
docker compose ps                         # app, shots and caddy "running"; app and shots become "healthy"
docker compose logs -f app                # Ctrl+C to stop watching
```

In the app log you should see `"msg":"listening"` with `"sessionSecret":"env"` and `"journalMode":"wal"`, and with
Litestream on, `starting with Litestream replication`. The worker's log (`docker compose logs shots`) says
`shots-worker listening` with `"three":"0.185.1"` (the 3D library is in the image), then `job done` for each cover.
Caddy's log (`docker compose logs caddy`) says `certificate obtained successfully`. Then open
`https://play.example.com`, sign in as admin and open a game.

### 1.11 Updating to a new version

```bash
cd /srv/oomba/app && git pull
cd deploy && docker compose up -d --build
```

The new image is built while the old one keeps serving; then the app container is replaced: it finishes open requests
and Builder replies (up to 25 s) and the site is unavailable for roughly 10–30 seconds. Do it at a quiet time. To go
back: `git checkout <previous commit>` and the same command.

Useful commands: `docker compose logs --since 1h app`, `docker compose restart app`,
`docker compose exec -u node app node scripts/backup.js` (a local backup copy now; always `-u node` so files keep the
right owner).

---

## 2. Backups

Two layers, both on:

1. **Litestream → S3, continuous (the database).** On when `LITESTREAM_REPLICA_URL` is set. New changes are shipped
   every 10 seconds; a full snapshot is made daily and a week of history is kept (`deploy/litestream.yml`). Check it:
   `docker compose exec -u node app litestream ltx /data/brb.db` lists what is in the bucket, and the S3 console shows
   files under `oomba/`. Bucket versioning and the 30-day rule (1.1) are required: they are what keeps these backups
   safe if the app is ever broken into (the app needs write access to the bucket; only old versions are out of its
   reach). If the newest backup ever looks wrong, the runbook restores an earlier moment, and S3 can bring back any
   file version from the last 30 days (*Show versions* in the bucket).
2. **Daily EBS snapshot (the whole data disk, including cover pictures, profile photos and uploads).**
   **EC2 → Lifecycle Manager → Create lifecycle policy → EBS snapshot policy**: target resource type *Volume*, tag
   `Backup` = `oomba`, every 24 hours, keep 7 (or 14). The IAM role it offers to create is fine.

**Restoring, and a restore drill every three months:** [`docs/runbook-restore.md`](runbook-restore.md). Do the first
drill in the week after you go live.

`npm run backup` (`node scripts/backup.js`) still works and keeps 14 local copies in `/srv/oomba/data/backups`; these
are on the same disk, so they help after a mistake, not after losing the disk.

---

## 3. Monitoring and alerts

Set these up once; all send email through one SNS topic.

1. **SNS → Topics → Create topic** (Standard) `oomba-alerts` → **Create subscription** → Email → your address →
   confirm the email AWS sends.
2. **Is the site up?** **Route 53 → Health checks → Create**: endpoint by domain name `play.example.com`, protocol
   HTTPS, path `/health`, advanced: *String matching* on `"ok":true`. In the last step, create an alarm that notifies
   an SNS topic **in US East (N. Virginia)**: Route 53 health-check alarms only exist in `us-east-1`, and an alarm can
   only notify a topic in its own region. If your region is another one, pick *New SNS topic* there (e.g.
   `oomba-alerts-us-east-1`, your email) and confirm the second email. `/health` answers 503 when the database doesn't
   answer or its file disappeared, when the data disk is full (under 100 MB free) or refuses a test file, and while
   the app is shutting down.
3. **Is the server healthy?** **EC2 → Instances → oomba → Status checks → Actions → Create status check alarm**:
   notify `oomba-alerts`, action *Recover* for system check failures (AWS moves the server to new hardware, same disk
   and IP).
4. **Disk and memory.** The data disk filling up is the most likely real problem. Install the CloudWatch agent:
   ```bash
   sudo -i
   wget -q https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb && dpkg -i amazon-cloudwatch-agent.deb
   cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'EOF'
   { "metrics": { "append_dimensions": { "InstanceId": "${aws:InstanceId}" },
       "metrics_collected": { "mem": { "measurement": ["mem_used_percent"] },
         "disk": { "measurement": ["used_percent"], "resources": ["/", "/srv/oomba"] } } } }
   EOF
   /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
   ```
   Then **CloudWatch → Alarms → Create alarm → CWAgent**: `disk_used_percent` for `/srv/oomba` above 80, and
   `mem_used_percent` above 90 for 15 minutes, both notifying `oomba-alerts`.
5. **Money.** **Billing → Budgets → Create budget** (monthly cost budget with an email at 80 %). Keep the AI spend
   limit in the Anthropic Console as well; the site's own caps are `AI_DAILY_BUDGET_USD` / `AI_MONTHLY_BUDGET_USD`.
6. **Logs.** `docker compose logs app` keeps the last 50 MB per container (rotation is set in the compose file). Each
   line is JSON; `grep '"level":"error"'` finds problems. To keep logs in CloudWatch instead, add
   `logging: { driver: awslogs, options: { awslogs-region: us-east-1, awslogs-group: oomba, awslogs-create-group: "true" } }`
   to the app service and `CloudWatchAgentServerPolicy` already covers the permission.

---

## 4. Sizing

| Site size | Server | Data disk |
|---|---|---|
| Small (one school, a few hundred players) | t3.small, 2 GiB (minimum: the worker's 1 GB cap keeps Chromium off the app's memory; if `docker stats` shows the server short of memory, add `BRB_SNAPSHOTS=0` to `.env`: no cover pictures) | 20 GiB gp3 |
| Recommended start | **t3.medium, 4 GiB** | 20 GiB gp3 |
| Busy (many schools, Builder used all day) | t3.large, 8 GiB | 50 GiB gp3 |

Memory is what runs out first (Chromium, in the `shots` container). CPU credits: if the CloudWatch metric `CPUCreditBalance` keeps falling to
zero, move to the next size or an `m7i`/`m6i` (non-burstable) type. Growing the disk: EBS → Modify volume, then
`sudo resize2fs /dev/nvme1n1`, online.

---

## 5. Secrets

The secrets are `SESSION_SECRET`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `SHOTS_TOKEN` (and Litestream keys if you
don't use the role). On the server they live only in `deploy/.env` (mode 600, owned by root). Keep the master copy
in **Systems Manager → Parameter Store** as *SecureString* parameters under `/oomba/` (e.g. `/oomba/SESSION_SECRET`),
or in **Secrets Manager**, so a lost server doesn't lose them.

To rebuild `.env`'s secrets from Parameter Store on a new server (add `ssm:GetParametersByPath` on
`arn:aws:ssm:REGION:ACCOUNT:parameter/oomba/*` plus `kms:Decrypt` to the `oomba-server` role first;
`sudo snap install aws-cli --classic` installs the CLI):

```bash
cd /srv/oomba/app/deploy && umask 077
aws ssm get-parameters-by-path --path /oomba/ --with-decryption --query 'Parameters[].[Name,Value]' --output text \
  | while read -r name value; do echo "${name##*/}=$value"; done > secrets.env
# then copy those lines into .env (or add "- secrets.env" under env_file for the app in docker-compose.yml)
```

`REQUIRE_SESSION_SECRET=1` (set in `.env.example`) makes the app refuse to start if `SESSION_SECRET` went missing,
instead of quietly using a different one.

---

## 6. Security, WAF and edge rate limits

What is already there: HTTPS everywhere (Caddy, HSTS), the app's own security headers and per-user / per-address rate
limits (sign-in, sign-up, Builder, chat, uploads), port 3000 closed to the internet, the app running as an
unprivileged user that can't regain privileges, and Chromium isolated in the screenshot worker (no data, no secrets,
no internet, read-only).

**AWS WAF** cannot be attached to an EC2 server directly; it needs CloudFront (or an ALB) in front. Worth it if you see
abuse (lots of sign-up attempts, scraping) or want AWS's managed bad-bot lists:

1. Give the server a second name for CloudFront to connect to, e.g. `origin.play.example.com` (an A record to the
   Elastic IP), and add it to the site line in the Caddyfile (`{$SITE_DOMAIN}, origin.play.example.com {`) so Caddy
   gets a certificate for it. Request an **ACM certificate for `play.example.com` in us-east-1** (CloudFront only uses
   certificates from that region). Create a **CloudFront distribution** with origin `origin.play.example.com`,
   protocol HTTPS only, origin read timeout 60 s (the Builder stream sends a heartbeat every 15 s, so it never idles
   that long), alternate domain `play.example.com` with that certificate. Under the origin's **Add custom header**,
   add `X-Origin-Verify` with a long random value (`openssl rand -hex 32`).
2. Cache policy **CachingDisabled** for the default behaviour (pages are per user); optionally `CachingOptimized` for
   `/css/*`, `/js/*`, `/fonts/*`, `/icons/*`. Origin request policy **AllViewer** (forwards cookies, query strings
   and the Host header).
3. Attach a **WAF web ACL** with the *Core rule set* and a **rate-based rule**, e.g. 300 requests per 5 minutes per IP
   for paths starting with `/api/auth/`, and 2,000 per 5 minutes for everything.
4. Point `play.example.com` at CloudFront, add `TRUST_PROXY=2` to `deploy/.env` (CloudFront + Caddy), and make Caddy
   keep CloudFront's `X-Forwarded-For`: add `trusted_proxies static <CloudFront ranges>` under `servers` in the
   Caddyfile and remove the `header_up X-Forwarded-For` line. Then `docker compose up -d`.
5. Make sure nobody can go around CloudFront (otherwise anyone can fake their address for the rate limits):
   - In the Caddyfile's site block, refuse requests without the secret header:
     `@notcf not header X-Origin-Verify <the value>` and `respond @notcf 403`.
   - Security group `oomba-web`: change the **HTTPS (443)** rules' source to the AWS managed prefix list
     `com.amazonaws.global.cloudfront.origin-facing` (one rule; delete the IPv4 and IPv6 "anywhere" 443 rules). The
     list counts as 55 of the group's 60 rules, which is why there must be only one such rule.
   - **Leave HTTP (80) open to anywhere.** Let's Encrypt checks `origin.play.example.com` on port 80 each time Caddy
     renews its certificate (every couple of months); with port 80 closed, renewal fails and the whole site goes
     down when the certificate runs out. Caddy only answers those checks there and redirects everything else to
     HTTPS.

That is a bigger change; the plain setup is fine to launch with.

---

## 7. TRUST_PROXY on AWS

`TRUST_PROXY` tells the app which proxies sit between the visitor and it, so it can find the visitor's real address
for rate limits. It must be exact, and the app's port must not be reachable around the proxies.

| Setup | `TRUST_PROXY` |
|---|---|
| EC2 + Caddy (Part 1) | Caddy's Docker network, `172.30.42.0/24` (set in `docker-compose.yml`; nothing to do) |
| CloudFront → EC2 + Caddy | `2` in `deploy/.env`, plus Caddy `trusted_proxies` and the lock-down in section 6 |
| ALB → ECS/EC2 (no Caddy) | `1`; the app's security group allows port 3000 only from the ALB's security group |
| CloudFront → ALB → ECS | `2`, and lock the ALB to CloudFront: its security group allows 443 only from the prefix list `com.amazonaws.global.cloudfront.origin-facing` (one rule), CloudFront adds a secret `X-Origin-Verify` header (as in section 6), and the ALB listener's default action is a fixed 403, with one rule forwarding to the target group only when that header matches |

If the app logs `X-Forwarded-For arrived but TRUST_PROXY is off`, a proxy is in front of it and the setting is
missing.

---

## 8. Alternatives

### Lightsail (simpler console, fixed monthly price)

Same steps as Part 1 with these differences: create a Linux instance with the 2 GB or 4 GB plan and Ubuntu 24.04;
create a **block storage disk** in the same zone and attach it (Lightsail shows the device name; format and mount it as
in 1.5); attach a **static IP**; in the instance's **Networking** tab add HTTPS (443) to the firewall (HTTP 80 is open by
default) and restrict SSH to your IP. Lightsail instances can't use IAM roles: for Litestream create an IAM user with
only the `oomba-backups` policy, make an access key, and put it in `LITESTREAM_ACCESS_KEY_ID` /
`LITESTREAM_SECRET_ACCESS_KEY` (plus `AWS_REGION`). Turn on **automatic snapshots** for the instance and snapshot the
disk too (Lightsail → Storage → the disk → Snapshots).

### ECS on Fargate with EFS (managed containers)

Works, with real catches. Choose it only if you don't want to look after a server at all.

- **EFS is a network file system:** set `BRB_JOURNAL_MODE=DELETE`. Writes are slower than on EBS. Litestream can't run
  (it needs WAL); back up with **AWS Backup** on the EFS file system (daily, keep 14 days), and use section C of the
  restore runbook.
- **Exactly one task:** service desired count **1**, *minimum healthy percent* **0** and *maximum percent* **100**, so
  ECS stops the old task before starting the new one (two tasks must never share the database). Each deploy then
  takes the site down for a minute or two. No service auto scaling.
- Setup outline:
  1. Push the image to **ECR** (build on your computer: `docker build -t oomba-academy .`, then the push commands ECR
     shows).
  2. **EFS** file system in the same VPC, with an **access point**: path `/oomba`, POSIX user and group `1000`, root
     directory owner `1000:1000`, permissions `750`. Its security group allows NFS (2049) from the task's security
     group.
  3. **Task definition** (Fargate, Linux/X86_64, **1 vCPU / 3 GB**; container memory limits app 1 GB, `shots` 1.5 GB,
     so Chromium can never take the app's memory):
     - `app`: port 3000; environment `NODE_ENV=production`, `BRB_DATA_DIR=/data`, `BRB_JOURNAL_MODE=DELETE`,
       `TRUST_PROXY=1`, `PUBLIC_URL=https://play.example.com`, `REQUIRE_SESSION_SECRET=1`; **secrets**
       `SESSION_SECRET`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY` from Secrets Manager or Parameter Store (the task
       execution role needs read access); the EFS volume (with the access point, transit encryption on) mounted at
       `/data`; **stop timeout 40** seconds; also `SNAPSHOT_URL=http://127.0.0.1:4900` and the secret `SHOTS_TOKEN`.
     - A second container `shots` (the screenshot worker): the same image, command `node,server/shots-worker.js`,
       user `1000`, *read-only root file system* with a small volume mounted at `/tmp`, environment `SHOTS_PORT=4900`,
       `HOME=/tmp`, secret `SHOTS_TOKEN` and nothing else (no EFS, no other secrets). *Essential* **off** with a
       restart policy on, so a crash in the worker restarts it and never stops the app. Containers in a task share
       one network, so unlike the compose stack the worker can reach the internet; it still has no data or secrets.
  4. **Application Load Balancer**: HTTPS listener with an ACM certificate (and HTTP → HTTPS redirect), target group
     HTTP port 3000, health check path `/health`, deregistration delay 30 s. Idle timeout: keep 60 s (the app keeps
     connections 65 s; the Builder stream sends a heartbeat every 15 s). The task's security group allows 3000 only
     from the ALB's security group.
  5. **Service** as above, with *ECS Exec* turned on (for a shell: `aws ecs execute-command ... --command sh`).
- Monitoring: Container Insights, an alarm on the ALB's `HTTPCode_Target_5XX_Count` and `UnHealthyHostCount`, and the
  Route 53 health check from section 3.
- WAF: attach the web ACL from section 6 to the ALB directly; `TRUST_PROXY` stays `1`. With CloudFront in front
  it is `2`, with the ALB locked to CloudFront as in section 7.

### App Runner and ECS Express Mode: not for now

App Runner is closed to new AWS accounts since 30 April 2026, and it never had a persistent disk. AWS now points to
**ECS Express Mode** (Fargate plus a load balancer from one image) as the simple managed option. Like App Runner it
has no block disk and is built to scale out, which SQLite and the in-memory state don't allow; it becomes an option
after a move to Postgres and Redis.

---

## 9. Moving from Render: cut-over checklist

**About staying signed in:** browsers keep sign-in cookies per web address. Carrying `SESSION_SECRET` over keeps
everyone signed in **if the address stays the same** (your own domain moves from Render to AWS). If the site moves
from `magic-cup.onrender.com` to a new domain, people sign in once on the new address whatever you do. Carry the
secret over anyway: it costs nothing and keeps game links and future moves smooth.

**Which case are you?** (a) Your own domain (say `play.example.com`) points at Render today: the new server uses a
temporary name such as `new.example.com` until moving day, and the domain's DNS moves in step 8. (b) The site lives
at `magic-cup.onrender.com` and moves to a domain that has never pointed at Render: use that domain from the start;
there is no DNS switch. Steps marked **(a)** are for the first case only.

### A week before

- [ ] Merge this version and let Render deploy it. It is safe there: nothing changes until the new settings are set.
      Check the Render log shows `"msg":"listening"`. (The moving-day scripts below come with it.)
- [ ] Build the AWS server (Part 1) with `LITESTREAM_REPLICA_URL` **empty** for now. `SITE_DOMAIN`: (a) the temporary
      name, with its A record pointing at the Elastic IP; (b) the final domain. `PUBLIC_URL`: the final address in both
      cases. Check `https://<SITE_DOMAIN>/health` says `"ok":true`.
- [ ] Dress rehearsal, still without Litestream (so the rehearsal copy never reaches the backup bucket): do moving-day
      steps 3, 4 and 6 once, *without* maintenance mode on Render. Sign in on `https://<SITE_DOMAIN>` and check your
      admin account, games and schools. Then empty the new data folder again (step 6's `rm` commands).
- [ ] (a) Lower your domain's DNS **TTL to 300 seconds** now, so the switch spreads fast.

### Moving day (about an hour; the site is down 10–20 minutes)

1. [ ] **Copy the session secret.** Render dashboard → your service → **Shell**:
       ```bash
       node scripts/export-session-secret.js /tmp/session-secret.txt
       cat /tmp/session-secret.txt; rm /tmp/session-secret.txt
       ```
       Paste it into the new server's `.env` as `SESSION_SECRET=...` and into Parameter Store. (It is shown only in
       your browser's shell window, never in Render's logs. Don't paste it into chats or tickets.)
2. [ ] **Stop changes on Render.** Render → **Environment** → add `MAINTENANCE_MODE` = `1` → Save. Wait for the deploy
       to finish; the site shows "Oomba Academy is moving to a new home".
3. [ ] **Pack the data.** In the Render Shell, first check there is room (Render's disk is small, and the export
       briefly needs about as much again as the database plus the pictures): `df -h /data; du -sh /data/*`. If `/data`
       is more than about 40 % full, delete old copies in `/data/backups` first (`ls -lh /data/backups`), or write the
       export elsewhere if `df -h /tmp` shows room: `node scripts/export-data.js /tmp/oomba-data.tgz`. Otherwise:
       `node scripts/export-data.js`. Note the file name and the `sha256`.
4. [ ] **Copy it to AWS.** (Render's Docker shell has no scp, so the file goes through your S3 bucket.)
       In **AWS CloudShell** (the `>_` icon in the console), make a one-hour upload link (your bucket and region):
       ```bash
       python3 -c "import boto3,botocore; s3=boto3.client('s3',region_name='us-east-1',config=botocore.config.Config(signature_version='s3v4')); print(s3.generate_presigned_url('put_object',Params={'Bucket':'BUCKET','Key':'move/oomba-data.tgz'},ExpiresIn=3600))"
       ```
       In the **Render Shell**: `node scripts/upload-file.js /data/move/oomba-data-<time>.tgz`, then paste the link
       when it asks (that keeps it out of the shell history).
       On the **new server** (`sudo snap install aws-cli --classic` once):
       ```bash
       aws s3 cp s3://BUCKET/move/oomba-data.tgz /tmp/oomba-data.tgz
       sha256sum /tmp/oomba-data.tgz            # must match the sha256 from step 3
       ```
       (Render SSH users can try `scp` first; if it says the remote side has no scp/sftp, use the link.)
5. [ ] **Settings on the new server.** In `deploy/.env`: `SESSION_SECRET` (step 1), `ADMIN_PASSWORD`,
       `ANTHROPIC_API_KEY`, `PUBLIC_URL` (the final address), `REQUIRE_SESSION_SECRET=1`, and now
       `LITESTREAM_REPLICA_URL` + `AWS_REGION`. Leave `SITE_DOMAIN` as it is for now.
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
       `"ok":true`; sign in as admin; open a game and play; send one Builder message; open a class and print a login
       card (it must show the final address); `/admin/stats` numbers match Render's.
       **No-go?** Render → Environment → delete `MAINTENANCE_MODE`. The old site is back as it was, nothing lost; fix
       the problem and repeat from step 3 another day.
8. [ ] **(a) Switch DNS.** The A record of your domain → the Elastic IP. Wait until `dig +short play.example.com`
       shows it. Then set `SITE_DOMAIN=play.example.com` in `.env` and run `docker compose up -d`: Caddy restarts for
       the real domain and gets its certificate within a minute or two (`docker compose logs caddy`). If the log shows
       failed attempts, `docker compose restart caddy` once `dig` is right.
       **Rollback** (until step 10): point the A record back at Render and delete `MAINTENANCE_MODE` there. Anything
       written on the new server since the switch stays only there.
9. [ ] **Check** on the real address: `/health`, admin sign-in, a game, a login card.
10. [ ] **Redirect the old address.** Render → Environment: delete `MAINTENANCE_MODE`, add `MOVED_TO_URL` =
       `https://play.example.com` → Save. Every old `magic-cup.onrender.com` link now goes to the same page on the new
       site (a temporary redirect for now). (a) Visitors whose DNS still points at Render for your own domain get the
       "moving" page, never a redirect loop; remove the domain under the service's *Custom Domains* a day later.
       After a week without problems, add `MOVED_PERMANENTLY` = `1` (browsers and search engines then remember the
       new address).
11. [ ] **Backups running**: `docker compose logs app | grep -i litestream` shows replication, and the S3 bucket has
       files under `oomba/`. Delete the moving file: `aws s3 rm s3://BUCKET/move/oomba-data.tgz`, and on Render
       `rm -r /data/move` (or the `/tmp` file).

### After

- [ ] Keep Render running with `MOVED_TO_URL` for 1–3 months (bookmarks, school handouts, shared game links), then
      **suspend** the Render service (Settings → Suspend). Keep the Render disk a little longer, then delete the
      service.
- [ ] Do a restore drill ([runbook](runbook-restore.md), section D) in the first week.
- [ ] Never point two servers (old and new) at the same Litestream bucket path.

---

## 10. When something is wrong

| Symptom | Look at |
|---|---|
| Site down, `docker compose ps` shows app restarting | `docker compose logs --tail 100 app`. `startup failed` names the setting that is wrong (e.g. `PUBLIC_URL`, `BRB_JOURNAL_MODE`, missing `SESSION_SECRET` with `REQUIRE_SESSION_SECRET=1`). |
| `entrypoint: warning: /data is not writable by uid 1000` | `sudo chown 1000:1000 /srv/oomba/data` |
| App won't start: `bind source path does not exist: /srv/oomba/data` | The data disk isn't mounted: `sudo mount -a && df -h /srv/oomba`, then `docker compose up -d`. |
| `/health` 503, log `health check failing` with `disk full` | Grow the disk (section 4) or delete old copies in `/srv/oomba/data/backups`. |
| `/health` 503, log says the database file was deleted or replaced | Restart the app (`docker compose restart app`). If `brb.db` is really gone, see the runbook. |
| `restoring from the replica failed` at start | Bucket name, region (`AWS_REGION`) or the role / hop limit (1.3). |
| HTTPS certificate errors | DNS must point at the server and ports 80 and 443 must be open; `docker compose logs caddy`. |
| Random 502 errors | Should not happen with Caddy (it keeps connections shorter than the app). With an ALB, keep its idle timeout below `KEEPALIVE_TIMEOUT_SECONDS` (65). |
| Builder replies arrive all at once at the end | Something between the visitor and the app buffers responses. Caddy is set not to; check any CDN in front. |
| Everyone shares one rate limit ("slow down" for all) | `TRUST_PROXY` is missing or too low (section 7). |
| Out of memory | Bigger instance (section 4); `docker stats` shows which container uses it. |
| No cover pictures for new games | App log `cover picture waiting for the screenshot worker`: `refused SHOTS_TOKEN` means `.env` changed without a restart of both (`docker compose up -d`); `unreachable` means `docker compose ps shots` is not running (`docker compose logs shots`). Covers are taken once it works again. `cover picture failed` names a game that would not run. |
