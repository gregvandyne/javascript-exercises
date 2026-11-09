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

Save: Render redeploys.

## 4. Check

1. `/admin/emails`: "Sending: on", "Trial emails: on", no red warning (the same warning shows on `/admin/billing`
   while anything is missing).
2. **Send me a test** for each email: it goes to your Google address, else `CONTACT_EMAIL`, else `EMAIL_REPLY_TO`.
   Check it arrives (not in spam), on a phone too, in light and dark mode, and that **Unsubscribe** shows the page.
   In Gmail, "Show original" should say SPF, DKIM and DMARC **PASS**.
3. The first real trial: its welcome appears in the log on `/admin/emails` within a minute.

## Turning it off

`/admin/emails` → **Switch off** stops the sequence (nothing is deleted; due emails wait, and those that become too
late are skipped). `EMAIL_ENABLED=0` on Render stops every email.

## Not done here (later)

- Translations: the emails are English for every teacher until the owner approves copy in other languages
  (`server/emails/trial-en.js` is the model; register a language in `server/services/email-templates.js`).
- Bounces and complaints: Resend suppresses hard-bounced and complained addresses itself. A webhook from Resend into
  our `email_prefs` is a later step.
