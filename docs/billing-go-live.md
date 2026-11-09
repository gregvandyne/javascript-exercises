# Turning on paid plans: the owner's checklist

Paid plans (Basic, Family, School, Spark Packs) are built and tested against Stripe's sandbox and a fake Stripe.
Everything here is something only you can do (a Stripe Dashboard setting, a Render setting, a decision or a signature).
The code side is finished.

**Where oomba.ai stands (9 Nov 2026):** the server has run on live Stripe keys since at least 7 Nov (its startup log
says `"billing":"live"`), so some steps below are already done. The startup log also warns that no live Price has the
Spark Pack lookup keys `oomba_spark_25`, `oomba_spark_60` and `oomba_spark_150`, so Spark Packs can't be bought until
those are set. Use the "Ready to go live?" panel to see which of the remaining steps are still red.

**Your progress is on the site:** sign in as admin and open **/admin/billing**. The first panel, **"Ready to go
live?"**, shows one row per check, green or red, with what to do. It reads settings by name only and never shows a key.
Press **Check again** after you change something (Render restarts the server when you save a setting, so wait a
minute first).

Kids are never part of this: they never see a price, a plan name or a payment page; only grown-up accounts and school
admins can pay; paying is never parental consent. Nothing below changes that.

---

## Step 1. Decide what is still open

You approved the billing design in October 2026 (docs/decisions.md "Paid plans", D0-D16). Most decisions are built and
need nothing more. These still need you. The recommendation is what the design already assumes; nothing was changed
in code.

| # | What to decide | Recommended answer | Where it lives |
|---|---|---|---|
| Step 0 | Real cost of a Builder message | Set `ANTHROPIC_API_KEY`, build about 20 games (normal and Pro), read "cost per message" on /admin/stats. Do this first: D0, D3, D4, D6 and the prices depend on it. | /admin/stats |
| D0 | Free AI budget | Keep $150 a month, $5 a day until Step 0's numbers say otherwise. | `AI_MONTHLY_BUDGET_USD`, `AI_DAILY_BUDGET_USD` (render.yaml) |
| D3 | Free daily messages | Keep 60. If you lower it, ship that change on its own, weeks before paid plans, never in the same release. | `BUILDER_DAILY_TURNS` |
| D4 | Family extra messages a month | Start at 40 (about half the family plan's net price ÷ cost per message); Basic 25. Recompute with Step 0's cost. | `FAMILY_EXTRA_MESSAGES`, `BASIC_EXTRA_MESSAGES` |
| D5 | Pro message weight | Switch to 2 in the same release that opens plans (approved). **But** while `BUILDER_FULL_FOR_ALL` is on (the default since "Everyone builds like a teacher", November 2026) every signed-in maker builds with Pro and each message counts as one, so `PRO_TURN_WEIGHT` changes nothing and every message costs a Pro message: measure Step 0 that way and price on it, or set `BUILDER_FULL_FOR_ALL=0` (then the weight of 2 applies to kids and grown-ups; teachers and staff still count one). The panel's row shows which applies. | `PRO_TURN_WEIGHT=2`, `BUILDER_FULL_FOR_ALL` |
| D6 | School price | **Replaced (2026-11-09) by the Teacher plan:** $119 per teacher per year, no per-student charge; schools buy N teacher seats. The per-student price stays only for grandfathered schools' renewals (docs/decisions.md "Teacher plan"). | Stripe Price `oomba_teacher_yearly` (and `oomba_school_seat_yearly`, renewals only); `TEACHER_DAILY_MESSAGES`, `TEACHER_TRIAL_DAYS`, `TEACHER_MONTHLY_AI_USD` |
| Prices | Basic and Family, monthly and yearly | **Your decision; not fixed anywhere in the design.** The Spark Pack design calls 20¢ a message "the Basic plan's rate" (25 messages ≈ $4.99 a month). Set them only after Step 0. | Stripe Prices `oomba_basic_monthly`, `oomba_basic_yearly`, `oomba_family_monthly`, `oomba_family_yearly` |
| Spark Packs | The three prices | As designed: 25 messages $4.99, 60 messages $9.99, 150 messages $19.99 (each keeps a margin at ~10¢ of AI cost a message). | Stripe Prices `oomba_spark_25`, `oomba_spark_60`, `oomba_spark_150` |
| Spark Packs | Who may buy, how long they last, refunds | Only families with a plan; 365 days, still usable after the plan ends; a full refund of an **unused** pack within 14 days (what /refunds now says). | `SPARK_PACK_EXPIRY_DAYS`; docs/legal-review.md item 45 |
| D9 | Countries and tax | US families only at launch: a Radar rule blocking non-US cards, a required billing address, Stripe Tax for US sales tax. | Stripe Dashboard (Step 3) |
| D10 | Refund rule | Keep what is built: full refund within 14 days of a first payment or a yearly renewal; monthly renewals not refunded (the lawyer may change it: legal review item 17). | /refunds |
| D13 | Coupons | Make Stripe promotion codes only when you need one (pilot schools, testers). | Stripe Dashboard |
| D15 | Legal | The lawyer answers the checklist in docs/legal-review.md, including item 45 (Spark Packs on /refunds). | docs/legal-review.md |

Already decided and built, nothing to do: D1 (grown-up accounts), D2 (4 children), D7 (invoice schools), D8 (no
trial), D11 (grace days), D12 (a school that stops paying goes back to free), D14 (testers only in test mode), D16 (kid
pages free of plans and prices).

## Step 2. Get the legal sign-off

1. Send docs/legal-review.md and the three pages (/terms, /refunds, /privacy?for=grownups) to the lawyer.
2. When they answer, record "owner: yes, date" and "lawyer: yes, date" under each item (item 45 is the new Spark Packs
   text). Text changes come back to the code; then move `LEGAL_UPDATED` in server/routes/info.js to that day.
3. Only then: in Stripe, **Settings → Business → Public details**, add `https://oomba.ai/terms` as the terms of
   service URL, and on Render set `TERMS_PUBLISHED=1` (Checkout then asks the buyer to agree to the Terms).

## Step 3. Set up Stripe in live mode

Do these in the Stripe Dashboard with **Test mode switched off**. They mirror what you already did in the sandbox.

1. **Products and Prices.** Create the Products "Basic", "Family", "School" (metadata `oomba_plan` = `basic`,
   `family`, `school`) and "Spark Pack". Create each Price with exactly these **lookup keys**: `oomba_basic_monthly`,
   `oomba_basic_yearly`, `oomba_family_monthly`, `oomba_family_yearly`, `oomba_school_seat_yearly` (recurring), and
   `oomba_spark_25`, `oomba_spark_60`, `oomba_spark_150` (one-time). USD, tax behavior as in the sandbox. The site
   finds prices only by lookup key, so a missing one shows "Price coming soon" (the panel names it).
   **Teacher plan** (done in live mode on 2026-11-09): Product "Oomba Teacher plan" (`prod_Vb0YSjk70xhUar`), Price
   `price_1UZoXC3TnSduDqoY3sZfm1IK`, $119/year, tax behavior exclusive, lookup key **`oomba_teacher_yearly`**. Add
   metadata `oomba_plan` = `teacher` on that Product, so a future Price that takes over the lookup key keeps the plan.
   Keep `oomba_school_seat_yearly` **active**: grandfathered per-student schools renew on it. New schools never buy it.
   Do the same in the sandbox (test mode) so the panel's "with the test key" check passes.
2. **Payment methods.** Settings → Payment methods → create a configuration named "Family" (cards, Apple Pay, Google
   Pay on; **Link off**). Copy its `pmc_…` id. Optionally a "School" one (cards, Link, ACH Direct Debit).
3. **Stripe Tax** (D9). Tax → Settings: head office address. Tax → Registrations: add the states where you must collect.
4. **Radar rule** (D9): block cards from outside the US, e.g. `Block if :card_country: != 'US'`.
5. **Customer Portal.** Settings → Billing → Customer portal: allow cancelling (at period end), **updating payment
   methods** (a teacher adds a card to their free trial there: "Add a card" on My classes opens the portal), and
   switching between Basic and Family (prorated). Turn on the portal's link to /terms and /privacy.
5a. **Free trial reminder (Teacher plan).** Settings → Billing → Subscriptions and emails → Manage free trial messaging:
   turn on **"Send a reminder email 7 days before a free trial ends"** (Stripe sends it to the teacher's work email;
   the site also shows its own notice and a Team inbox message when Stripe sends `customer.subscription.trial_will_end`,
   3 days before). Also set a link to your Terms there (Stripe asks for it before it sends trial reminders).
6. **Customer emails.** Settings → Customer emails: turn on "Successful payments" and "Refunds" (receipts; the site
   sends no email). Set the support email to greg@oomba.ai.
7. **Card retries.** Settings → Billing → Subscriptions and emails: make retries end within 7 days (the grace period,
   `BILLING_GRACE_DAYS`; legal review item 16).
8. **Restricted key.** Developers → API keys → **Create restricted key** "oomba-live" with: Checkout Sessions,
   Customers, Subscriptions, Customer portal, Invoices, Refunds (**write**); Charges, Disputes, Prices, Products, Tax
   settings, Tax registrations (**read**). Products (read) is needed because the site reads a subscription with its
   Price's Product. If a panel row says "Stripe answered" a permission error, add the permission it names. Never use the `sk_live_` secret key: the site refuses to start with it.
9. **Webhook.** Developers → Webhooks → Add endpoint `https://oomba.ai/api/billing/webhook`, API version
   `2026-09-30.endive` (the same as `STRIPE_API_VERSION`), with these 15 events: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.subscription.trial_will_end` (new with the Teacher plan: **add it to an endpoint made before**), `invoice.paid`,
   `invoice.payment_failed`, `invoice.finalized`, `invoice.overdue`, `charge.refunded`, `charge.dispute.created`,
   `radar.early_fraud_warning.created`. Copy its signing secret (`whsec_…`).

## Step 4. Set the settings on Render

Render → the oomba service → **Environment**. Paste values only there, never in a file, a chat or an email.

| Setting | Value |
|---|---|
| `STRIPE_API_KEY` | the live restricted key (`rk_live_…`) from step 3.8 |
| `STRIPE_LIVE_OK` | `1` (the server refuses a live key without it) |
| `STRIPE_WEBHOOK_SECRET` | the `whsec_…` from step 3.9 |
| `STRIPE_PMC_FAMILY` | the "Family" `pmc_…` from step 3.2 |
| `STRIPE_PMC_SCHOOL` | optional: the "School" `pmc_…` |
| `STRIPE_TAX` | `1` |
| `PUBLIC_URL` | `https://oomba.ai` (already set if the domain move is done) |
| `CONTACT_EMAIL` | `greg@oomba.ai` (in render.yaml already) |
| `ANTHROPIC_API_KEY` | set since Step 0 |
| `PRO_TURN_WEIGHT` | `2` (D5; no effect while `BUILDER_FULL_FOR_ALL` is on, see Step 1) |
| `BILLING_PREVIEW_TOKEN` | any 24+ random characters, so you can see the pages before everyone does |
| `TERMS_PUBLISHED` | `1`, only after Step 2 |
| `BILLING_PUBLIC` | **leave unset for now** (Step 6) |

Save. Render restarts the site. If it doesn't come back, the log's first lines say which setting is wrong (never its
value). Open /admin/billing and press **Check again**: every row except the webhook, `TERMS_PUBLISHED` (until Step 2) and
`BILLING_PUBLIC` should now be green.

## Step 5. Make one real purchase, then refund it

1. Visit `https://oomba.ai/?bpreview=<your BILLING_PREVIEW_TOKEN>` once in your browser: you now see the paid pages
   (nobody else does).
2. Make a grown-up account for yourself at /grown-ups/signup (your own name, a 12+ character password).
3. On /plans choose the cheapest plan (Basic, monthly), type your password again, and pay with your own real card.
4. Back on /family the plan shows as on within a few seconds. On /admin/billing the subscription is listed with ✅,
   and the "webhook" row is green ("received a signed live-mode event").
5. Optional: buy the smallest Spark Pack the same way (/family → Spark Packs) once item 45 is signed off.
6. **Refund:** in Stripe, open the payment (the subscription row's Stripe link) → **Cancel subscription** (immediately)
   → then **Refund** the payment in full. Within a minute /admin/billing shows the plan ended, and /family is back to
   free. For a Spark Pack, refunding the payment takes back the messages that are left.
7. Check your receipt and refund emails arrived from Stripe.

If any of this fails, nothing reached a family: just switch billing off (below) and send me the time it happened and
what the page said.

## Step 6. Open it to everyone

When every row on the panel is green except `BILLING_PUBLIC`, and the test purchase worked: set `BILLING_PUBLIC=1` on
Render. The Plans link appears in the menus, /parents and /grown-ups mention plans, and the legal pages drop their
"not on sale yet" notice. Watch /admin/billing's "Event problems" for the first few days.

## Turning it off again

- **Hide the plans but keep existing plans working** (the usual "pause"): remove `BILLING_PUBLIC` (or set it to `0`).
  Nobody new can buy; families and schools that already pay keep their messages; webhooks, renewals and refunds go on.
- **Stop billing completely** (an emergency): remove `STRIPE_API_KEY` (or `STRIPE_WEBHOOK_SECRET`). The site works as
  before plans existed and everyone builds with the free messages. Stripe keeps charging existing subscriptions, so if
  you stop for good, also cancel them in the Stripe Dashboard (and refund as /refunds promises). Put the key back to
  resume: the 6-hourly reconcile job catches up on what happened meanwhile.
- **Stop selling one thing:** archive its Price in Stripe (the page shows "Price coming soon" for it; for Spark Packs,
  "Spark Packs aren't on sale yet").
- Nothing is ever deleted when billing stops: games, classes and saves stay as they are.

## What the code checks for you, and what it can't

The panel checks: the key is a live restricted key and `STRIPE_LIVE_OK` is set, the webhook secret is set and a signed
live event has arrived, every Price exists by lookup key (with the key you have set), the Family payment methods,
Stripe Tax collecting, `TERMS_PUBLISHED`, `CONTACT_EMAIL`, `PUBLIC_URL`, the AI key, `PRO_TURN_WEIGHT`, that every
paid-plan word is translated in all 13 languages (tests/unit/billing-i18n.test.js checks the same), and
`BILLING_PUBLIC`.

It can't check: the lawyer's sign-off (Step 2), the Radar rule, the Customer Portal and email settings, the free
trial reminder email (3.5a), card retries, and the webhook's event list (Step 3, `trial_will_end` included). Tick
those off here by hand. The Teacher plan's price has its own row (`oomba_teacher_yearly`).
