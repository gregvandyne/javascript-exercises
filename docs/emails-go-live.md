# Trial emails: going live

The Teacher plan's trial emails (docs/decisions.md "Trial emails") are built and tested, but nothing is sent until the
owner does the steps below. Until then the sequence still keeps its schedule, so nothing breaks; emails that come due
while sending is off wait, and are skipped once they would be too late (24 hours for the date-sensitive ones).

## 1. Resend account and the oomba.ai domain

1. Create an account at resend.com (sign in as Greg@oomba.ai).
2. **Domains → Add domain → `oomba.ai`** (region: us-east-1, or the one nearest Render's).
3. Resend shows the DNS records to add at the oomba.ai DNS host. Add **exactly** what it shows:
   - **SPF**: a `TXT` record on the `send` subdomain (`send.oomba.ai`, `v=spf1 include:amazonses.com ~all`) and the
     `MX` record on the same subdomain (Resend's bounce handling). They sit on the subdomain, so the root SPF record of
     oomba.ai (Google Workspace's mail) is untouched.
   - **DKIM**: the `TXT` record `resend._domainkey.oomba.ai` (a long `p=…` key).
   - **DMARC** (if oomba.ai has none yet): `TXT` on `_dmarc.oomba.ai`, start with `v=DMARC1; p=none; rua=mailto:Greg@oomba.ai`
     and move to `p=quarantine` once reports look clean. If a DMARC record already exists, keep it.
4. Wait for Resend to show the domain **Verified** (minutes to a few hours).
5. Optional, recommended: in the domain's settings turn **click tracking and open tracking off** (the emails carry UTM
   tags already, and rewritten links look less trustworthy to school spam filters).

## 2. API key

**API Keys → Create API key**: name "oomba.ai production", permission **Sending access**, domain **oomba.ai**. Copy it
once (`re_…`): Resend never shows it again.

## 3. Render settings (oomba.ai's web service → Environment)

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | the key from step 2 |
| `EMAIL_POSTAL_ADDRESS` | the business's postal address for the footer (CAN-SPAM): a street address, or a PO box / private mailbox registered with the USPS. One line, e.g. `Oomba Academy, 123 Main St, Springfield, IL 62701, USA`. **Required**: without it no trial email is sent. |
| `EMAIL_FROM` | optional; default `Greg at Oomba Academy <greg@oomba.ai>` (the domain must be the verified one) |
| `EMAIL_REPLY_TO` | optional; default `Greg@oomba.ai` |
| `EMAIL_ENABLED` | optional; `0` is the off switch for every email |
| `ADMIN_ALERTS_TO` | optional; extra addresses for the admin alerts (comma list), besides your admin account's Google address. Only your own addresses: alerts go to platform admins only. |
| `ADMIN_ALERTS` | optional; `0` stops the admin alerts (and their test button) |

Save: Render redeploys.

## 4. Check

1. `/admin/emails`: "Sending: on", "Trial emails: on", no red warning (the same warning shows on `/admin/billing`
   while anything is missing).
2. **Send me a test** for each email: it goes to your Google address, else `CONTACT_EMAIL`, else `EMAIL_REPLY_TO`.
   Check it arrives (not in spam), on a phone too, in light and dark mode, and that **Unsubscribe** shows the page.
   In Gmail, "Show original" should say SPF, DKIM and DMARC **PASS**.
3. The first real trial: its welcome appears in the log on `/admin/emails` within a minute.

## Admin alerts (emails to you, the platform admin)

When something needs you, you get one summary email every 10 minutes at most (docs/decisions.md "Admin alerts by
email"): games waiting for review, new accounts (by type: students, kids, teachers, grown-ups), messages to the Oomba
team inbox, school set-up requests, safety reports (games, chat messages, live games, family links) and billing
problems (a failed or disputed payment, an overdue invoice, a fraud warning, a school asking to pay by invoice). Each
line links to the admin page that handles it. A burst (500 sign-ups) is still one email, with counts.

They hold no message text, no real names, no email addresses and no game content: account types, public usernames,
the titles of games sent for review (clipped to 60 characters), counts and links. Open the admin page for the rest.

They need only `RESEND_API_KEY` (not `EMAIL_POSTAL_ADDRESS`: they are internal mail, not marketing, and carry no
unsubscribe link). They go to every platform admin account's known address (your Google sign-in's) plus
`ADMIN_ALERTS_TO`, and never to anyone who is not a platform admin.

On `/admin/emails`, **Admin alerts**: switch them all off or on, or one kind at a time; see who gets them (a red note
when no address is known: sign in with Google as the admin, or set `ADMIN_ALERTS_TO`), when the next check is and the
last few emails; **Preview** and **Text** show a made-up example; **Send a test alert** sends that example to every
address now (it works while switched off, to check the address first). `ADMIN_ALERTS=0` on Render stops them all.

Check: send a test alert, then on a second browser sign up a test account; within 10 minutes "1 new account" arrives.

## Turning it off

`/admin/emails` → **Switch off** stops the sequence (nothing is deleted; due emails wait, and those that become too
late are skipped). `EMAIL_ENABLED=0` on Render stops every email.

## Not done here (later)

- Translations: the emails are English for every teacher until the owner approves copy in other languages
  (`server/emails/trial-en.js` is the model; register a language in `server/services/email-templates.js`).
- Bounces and complaints: Resend suppresses hard-bounced and complained addresses itself. A webhook from Resend into
  our `email_prefs` is a later step.
