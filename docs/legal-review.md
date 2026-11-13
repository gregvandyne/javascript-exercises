# Legal review: what the published pages decided, and what the lawyer still has to answer

/terms, /refunds and /privacy (server/routes/info.js, text in `info.terms.*`, `info.refunds.*`, `info.privacy.*` and the
reused `info.parents.*` sections) are on the site for everyone, also before `BILLING_PUBLIC`. They were made from the
drafts terms.md, refunds.md and privacy-payments.md. The public text has no drafting markers; every marker from the
drafts is listed here with what the page says today. **Last updated: 2026-11-11** (`LEGAL_UPDATED` in
server/routes/info.js; change it with every change to the text).

## Sign-off (2026-11-09)

- **Owner: yes, 2026-11-09 · Lawyer: yes, 2026-11-09.** The owner reports that the legal team approved the published
  /terms, /refunds and /privacy as they are live on oomba.ai on 2026-11-09, with no changes to the text. That includes
  the Spark Packs section of /refunds (item 45 below) and the Teacher plan and free-trial text.
- `LEGAL_UPDATED` moved to 2026-11-09 (server/routes/info.js; tests/unit/legal.test.js and tests/e2e/legal.spec.js).
  It is also the notice version parents acknowledge for parent-made accounts, so new acknowledgements carry this date.
- The checklist below is kept as the record of what was asked. Any later change to the text needs a new sign-off here.
- Owner steps that remain: Stripe Dashboard → Settings → Business → Public details, Terms of service URL
  `https://oomba.ai/terms`; then Render `TERMS_PUBLISHED=1`.

### After the sign-off: grown-ups and teachers sign up with Google (2026-11-11, owner decision, lawyer review pending)

- **Owner: yes, 2026-11-11 · Lawyer: not yet.** The one sign-up (docs/decisions.md "One sign-up") lets a parent or a
  teacher make their own account with Google (a personal Gmail or a school account), after the "18 or older"
  statement. Kids never sign up with Google; the kid sign-up asks for no email. The verified Google email is kept for
  sign-in and account emails; matching stays by Google's account id, and an email never links two accounts.
- `info.privacy.grownups.p1` now reads: "**What we don't ask for:** your phone number, home address or age, and no email
  unless you sign up or sign in with Google. (Stripe asks for some of these when you pay: see Payments below.)"
- New `info.privacy.grownups.li8` (after li2): "if you sign up or sign in with Google: your Google account's id and email
  address, to sign you in and to send account emails, such as a password reset or trial emails (never the Google
  photo);"
- New `google.setup.privacy.adults` (the Sign in with Google section of /privacy and /parents, after p1/p1c): "Parents
  and teachers can also sign up with Google, with a personal or a school Google account. We keep that account's id and
  email address while it is connected, to sign them in and to send account emails, such as a password reset or trial
  emails. An email never joins two accounts on its own. Children never sign up with Google."
- New `info.privacy.schoolSetup.li5` (after li1): "**When a teacher creates their school while signing up** and types a
  work email, we keep the school's name, their name, that email, the language of the page, when it was sent and their
  account, for the same uses and for as long as a request. The email is also kept with their account."
- All 13 languages. `LEGAL_UPDATED` is already 2026-11-11 (the date of this change), so it did not move.
- For the lawyer: is the "18 or older" statement enough for an adult account made with a Google account (a school
  Workspace account of a student could also tick it), and does keeping a teacher's or parent's Google email change
  anything in the COPPA analysis of item 31 (the "no email" rule still holds for every child's account)?

### After the sign-off: the school set-up email on /privacy (2026-11-11, needs the lawyer's sign-off)

- **Owner: yes, 2026-11-11 · Lawyer: not yet.** /teachers "Set up your school" now makes the teacher's account
  (docs/decisions.md "Account first: set up your school"), so the work email is also kept with that account.
  `info.privacy.schoolSetup.li1` adds: "If they made their teacher account with the form, we also keep the work email
  with that account." `li2` now reads: "What we use it for: to set up the school, to reply to the request, to send the
  school's welcome guide, and to send a password-reset link if the account's owner asks for one. We don't send
  newsletters, and we don't share it with Stripe or anyone else." 13 languages. `LEGAL_UPDATED` moved to 2026-11-11
  (also the notice version new parent acknowledgements carry).

### After the sign-off: Google Classroom on /privacy (2026-11-09, needs the lawyer's sign-off)

With `GOOGLE_CLASSROOM` on, the "Privacy" section about Google accounts on /privacy (`google.setup.privacy`, all 13
languages) changes: `p1c` replaces `p1` (it no longer says we read nothing else from Google), and two paragraphs are
added: `classroom` (what a teacher's Classroom connection reads: class names, the linked class's students' Google ids
and names; what it sends: the assignment's title, link and due date and each student's score out of 100; never answers,
feedback, games or drawings; stored encrypted until disconnect, revoked at Google) and `limitedUse` (Google's required
statement that use of Google API data follows the API Services User Data Policy including Limited Use, plus: never sold,
never for ads, never to train AI). Text written by us, not yet reviewed: **owner: not yet · lawyer: not yet.**
`LEGAL_UPDATED` is already 2026-11-09, so it did not move; move it to the sign-off date if the lawyer changes the text.

## Turning on TERMS_PUBLISHED

`TERMS_PUBLISHED=1` makes family Checkout ask the buyer to agree to /terms (Stripe's own checkbox; set the Terms URL in
the Stripe Dashboard's public details first) and links /terms from /family. The pages being on the site does **not**
turn it on: that stays the owner's choice, once the lawyer has answered the checklist below and the text has been
updated. Until then Checkout shows the price and renewal terms as it does today, without the agreement checkbox.

## Wording switches with BILLING_PUBLIC

The sentences that become untrue with paid plans (privacy-payments.md appendix) have a second wording (`paidN` keys)
shown only once paid plans are public (`familiesOn`: billing on, and `BILLING_PUBLIC=1` or the preview cookie):

| Page | Today | Once paid plans are public |
|---|---|---|
| /parents, What is Oomba Academy? | `info.parents.what.p1` ("no purchases") | `info.parents.what.paid1` |
| /parents and /privacy, What we never collect | `info.parents.never.p1` ("nothing to buy") | `info.parents.never.paid1` |
| /parents and /privacy, How long we keep it | `info.parents.keep.p1` | `info.parents.keep.paid1` (links to the billing timers on /privacy) |
| /parents and /privacy, What we keep | p1, p2 | adds `info.parents.stored.paid3` (families never see class activity) |
| /safety, No ads | `info.safety.ads.p1` ("Nothing is for sale") | `info.safety.ads.paid1` |

Until then /terms, /refunds and /privacy say at the top that paid plans are not on sale yet (`info.legal.notYet`).
The new English strings fall back to English in the other 12 languages; the legal pages' text is left out of the 90%
"ready" share (`UNCOUNTED_PREFIXES` in server/i18n/index.js), so no language leaves the picker. The paidN strings
**must be translated before BILLING_PUBLIC** (the appendix asks for all 13 languages), and docs/safety.md §11 changes
at the same time.

## Markers from the drafts and what the public text says

Placeholders filled with neutral wording (the owner confirms or replaces them):

| Draft | Public text today |
|---|---|
| Legal entity name and mailing address (terms §1, §14; refunds and privacy contact) | "Oomba Academy" and the contact email (`CONTACT_EMAIL`, else greg@oomba.ai). No postal address. |
| Effective date / Last updated | One "Last updated" date, 2026-10-27, on all three pages. No separate effective date. |
| Governing law state, venue county (terms §11) | "the laws of the US state where Oomba Academy is based", "the courts where Oomba Academy is based" |
| DMCA designated agent (terms §6.3) | Sentence dropped; infringement reports go to the contact email. Register an agent. |
| Check mailing address (terms §7.3) | "by check (email us for the mailing address)" |
| Refund by check or bank transfer (refunds) | "We refund by check or bank transfer." |
| Link to the parental notice (privacy §5) | Sentence dropped; /terms §7.9 points to the Privacy Policy. |
| Days to handle parents' requests (privacy §5) | No number: "we handle these requests by hand". |
| Hosting region (privacy §7) | Dropped. |

Wording: terms §4 says "adult content" for the draft's "sexual content" (the site's word filter checks every English string).

Prices: terms §7.2 and §7.3 no longer show $7.99 / $69 / $20 / $500 (children never see prices, and anyone can type
/terms). The footer links /terms only for grown-up accounts and school staff; kids, students, guests and the
signed-out get a Privacy link to /privacy without its billing sections (no plan names), and /parents links /terms once
paid plans are public. They say "at the price shown to the
grown-up before they buy" and "the price is shown to the school's admins on the school's Billing tab". The liability cap
says "100 US dollars".

Assumptions kept as written (the owner and lawyer confirm or change them): free-allowance changes announced on
/parents first; games not used in marketing without asking; no remixing; the per-child daily limit and cost limit on
family extras are disclosed (not their numbers); 7-30 days' notice of a price change by a notice and email; no
reduction of extras in a paid period; no delete button yet (requests by email); a suspended child's account is not
a refund reason; no refund after closing an account for fraud; pro-rata refund when we end a plan or shut down; 30
days' notice of important terms changes; transfer on a sale; reply to refund requests within 3 business days; refund
outside 14 days when a child used the card (the public text promises only the 14 days); Stripe's fraud data described
in general terms; notices sent by hand from the contact email to the email Stripe holds.

Owner decision applied: the 14-day full refund covers the **first payment and yearly renewals only**; monthly renewals
are not refunded and can be cancelled (refunds.md, terms §7.6; the same rule as `refundWindow` in
server/services/billing.js). Still open: whether a mid-year school seat increase counts as "a payment that starts a
plan"; whether an unpaid invoice is voided or still owed after the 30-day lapse; reminder timing for yearly renewals.

Dropped notes for the lawyer (not in the public text): terms §2.2 COPPA consent model, §3 school-authorized consent
and "school official", §6.1 copyright status of AI-made code and art, §7.5 renewal-reminder rules, §7.7 California
price-change notice, §7.8 unpaid invoices, §7.9 consent, §11 arbitration and class-action waiver, §12 fresh agreement
for changes; privacy §5 COPPA consent model and FERPA position, §6 written retention policy (2025 COPPA Rule).

---

## Lawyer checklist before Oomba Academy takes real payments

Draft pages to review: terms.md, refunds.md, privacy-payments.md. Every `[LEGAL REVIEW]`, `[ASSUMPTION]` and `[PLACEHOLDER]` in them needs an answer. The billing design is stripe/spec.md (decisions D0–D16).

### Children's privacy (highest priority)

1. **COPPA verifiable parental consent model.** The site is directed to children aged 8–14. Own accounts collect a username, password, games, Builder chats, uploads, friend chat messages, a profile photo (a child's image), and persistent identifiers (session cookies, user agent), all **without any parental notice or consent today**. Decide the consent method and which features need it (photos, friend chat and public sharing are the riskiest). Spec rule: **billing is not the consent mechanism**, and no copy may say paying is consent.
2. **2025 COPPA Rule amendments** (compliance date April 22, 2026, already passed): written children's data **retention policy** with deletion timeframes (today: "kept as long as the account exists", deleted games kept forever), written information security program, updated direct and online notices, separate consent for any third-party disclosure that is not part of internal operations.
3. **Anthropic as a recipient of children's data.** Builder messages, uploads, profile photos and games go to Anthropic. Confirm it qualifies as a service provider for internal operations, the API terms on retention and training, and Anthropic's usage-policy requirements for products used by minors. decisions.md says the parents page should answer this only once confirmed.
4. **Parents' rights with no self-serve tools.** There is no delete or export button. Confirm a manual process (with parent verification) and a response time meets COPPA and state laws.
5. **Minors and contracts.** Children may disaffirm contracts; terms.md has a parent agree for the child. Confirm how a parent's agreement is captured for kid accounts made with no grown-up present.
6. **Other kids' privacy laws:** New York Child Data Protection Act (users under 18), state age-appropriate design codes and kids' social-media laws (friend chat, profiles), CCPA/CPRA thresholds, and **GDPR / UK Children's Code** for free users outside the US (the site has 13 languages; spec D15 mentions GDPR).

### Schools and student data

7. **FERPA "school official" position** and the contract terms that create it (direct control, use only for the school's purposes, no re-disclosure).
8. **COPPA school-authorized consent** for school accounts and class codes (education use only), and what notice schools must give parents.
9. **State student-privacy laws and DPAs:** California SOPIPA/AB 1584, New York Ed Law 2-d (DPA plus Parents' Bill of Rights), Illinois SOPPA (published contract list, breach timelines), and others. Decide whether to offer the Student Data Privacy Consortium's National DPA as the standard school agreement.
10. **School Google sign-in** (status.md): legal review of school-directed Google accounts before a wide launch.
11. **School contract terms not in the draft:** purchase-order terms that override ours, indemnities, data-breach notice, insurance, accessibility (schools often ask for a VPAT/WCAG statement), and whether an **unpaid invoice is voided or still owed** after the 30-day lapse (D11/D12).

### Subscriptions and consumer law

12. **California Automatic Renewal Law** (Bus. & Prof. Code §17600 ff., as amended from July 1, 2025): clear and conspicuous terms next to the pay button (add Stripe Checkout `custom_text`, not only the ToS checkbox), affirmative consent, an **acknowledgment** after purchase that includes cancellation terms (Stripe's receipt may not be enough; we have no email system), online "click to cancel" (the Stripe Portal), **price-change notice** (7–30 days), **annual reminders**, and record-keeping of consent. Confirm the exact rules.
13. **Other states' auto-renewal laws** (for example New York, Colorado, Virginia, Illinois, Minnesota) and yearly renewal reminder windows. Set Stripe's renewal reminder timing to match.
14. **FTC rules:** ROSCA (federal auto-renewal law), the status of the FTC "click-to-cancel" negative option rule (vacated in 2025; check for a new rulemaking), and FTC Act Section 5.
15. **Undisclosed caps.** The spec keeps a per-child daily maximum and a dollar backstop on family extras unadvertised. Selling "N extra messages a month" with hidden limits may be deceptive. terms.md discloses them; confirm.
16. **Card retry window vs. 7-day grace.** Stripe may keep retrying a failed card after our 7-day grace ends access. Either set Stripe retries to end within 7 days or confirm the terms cover a late successful charge.
17. **Refund rule.** Spec D10 (14 days after a first payment or yearly renewal) differs from the launch brief (14 days after **any** payment). Pick one; check any state refund-posting laws. Also decide refunds when we terminate an account and on shutdown (terms.md proposes pro-rata refunds when it isn't the customer's fault).
18. **No outbound email.** Price-change, terms-change and ARL notices need to reach the payer. Confirm that sending by hand from greg@oomba.ai to the email Stripe holds is acceptable, and say so in the privacy text.
19. **Kids and marketing.** Children never see prices or plan names (spec §4.1). Done: /terms and /refunds show no prices, and neither is linked from a page a child's account sees (the footer's Terms link is for grown-up accounts and school staff only; /parents links them once plans are on sale). /privacy shows a child's account only the sections without plan names. The lawyer confirms that /parents (linked from every footer, as before) may name the plans in adult text (D16), and that the kid-facing /privacy, with a "For grown-ups and schools" pointer for the signed-out, is a prominent enough notice link for COPPA.

### Tax and payments

20. **Sales-tax registration:** home state, and economic-nexus thresholds elsewhere; taxability of digital education or SaaS services varies by state. The accountant picks the Stripe product tax code. Stripe Tax collects $0, with no error, until a state registration exists.
21. **School tax exemptions:** process for collecting and storing exemption certificates.
22. **Stripe's terms** (Services Agreement, its role as processor vs. controller for payer data), and Stripe's rules on businesses serving minors.

### Company and site basics

23. **Legal entity, mailing address, governing law and venue** (placeholders throughout).
24. **Dispute clause:** the draft has courts plus small claims, with no arbitration or class waiver. Decide.
25. **Liability cap** (draft: greater of 12 months' fees or $100) and the disclaimers. Check them against state consumer law.
26. **DMCA:** register a designated agent with the US Copyright Office, and adopt a repeat-infringer policy (user-generated games).
27. **Ownership of AI-generated games:** copyright status, and the licence wording in terms.md §6.
28. **Existing site text** that becomes false at launch ("no purchases", "nothing is for sale", "never ask for payment details"): see the appendix in privacy-payments.md.
29. **Insurance:** cyber and general liability for an ed-tech product for children.

### Navigation weeks 3–4: school plan asks (live text)

29a. **New live privacy sentence (school billing): `info.privacy.schoolBilling.li7`**, "Asking for a School plan". It is
    shown on /privacy (the full text: grown-ups, school staff, ?for=grownups) while families are on, and
    `LEGAL_UPDATED` moved to 2026-10-29 for it. What it says we keep: which teacher asked their school's admins for a
    School plan, for which school, and when; never a message (table `school_plan_asks`: ids and dates only). The
    school's admins see who asked until they dismiss it or the school gets a plan; the row is then deleted **90 days**
    after it was closed, by the daily `school-plan-asks-retention` job (server/services/plan-asks.js). Teachers only see
    whether their school has a plan. Please confirm the wording and the 90 days.

### Parent-made child accounts (navigation weeks 3–4; behind `PARENT_MADE_CHILDREN`, off)

30. **Parent-made child accounts: consent model, notice text, review/delete process.** The owner signs off on this
    item before `PARENT_MADE_CHILDREN` goes on in production, and before `BILLING_PUBLIC`. What ships is a direct
    notice the parent acknowledges, plus a stored "parent or legal guardian" statement (`family_notice_acks`: grown-up,
    child, notice version, time, method `notice-ack`). It is **not** called consent anywhere. Paying stays separate
    from consent (D15).
    **Text for the lawyer** (English only; shown only while `PARENT_MADE_CHILDREN=1` and families are on, so nothing
    live changed and `LEGAL_UPDATED` stays 2026-10-29). Every key is marked in server/i18n/notes.json as a legal notice
    to translate exactly:
    - the direct notice on "Make your child's account": `family.made.notice.h`, `.keep`, `.ai`, `.who`, `.howLong`,
      `.rights`, `.more` (links to /privacy#made);
    - the boxes and the no-consent sentence: `family.made.ack`, `family.made.guardian`, `family.made.noConsent`;
    - /privacy#made, "Accounts a grown-up makes for a child": `info.privacy.made.h`, `.p1`, `.li1`, `.li8` (what the
      grown-up sees; the counts stop at the end of yesterday, but something deleted or ended today can already be
      missing, so no "never what the child does today" promise), `.li3`–`.li5`, `.li9` (deletion: what goes and what we
      keep, see item 36), `.li7`;
    - /parents#made, "If you make your child's account": `info.parents.made.h`, `.p1`, `.li1`–`.li5` (includes "please
      don't chat or play as them");
    - deletion: `family.kept.deleteTextKeeps` (everything the child made, wrote and uploaded goes "straight away"; a
      short record that the account existed and who made it stays, and a class the child used to be in keeps its own
      records; nothing about backups yet, item 36);
    - "What we keep" for the grown-up: `family.kept.introCounts` (the same "up to the end of yesterday" caveat);
    - the "no delete button yet" sentences, replaced while parent-made accounts are on (a grown-up can delete an account
      they made): `info.parents.keep.madeP2` (in place of `info.parents.keep.p2`, on /privacy and /parents) and terms §8
      `info.terms.ending.madeLi1` (in place of `info.terms.ending.li1`);
    - what the child is told: `me.family.made.card.*`, `me.family.made.sees.*`, `me.family.madeLinked`.
    The notice version stored with each acknowledgement is `LEGAL_UPDATED` at the time. **Change `LEGAL_UPDATED`
    whenever any of this text changes** after the flag is on, so each record points at the text the grown-up read. In
    the terms only §8's "no delete button yet" changes, and only while the flag is on (`info.terms.ending.madeLi1`
    above); §7.9 already says paying is not consent. The DPIA note is docs/dpia-parent-made.md.
    **Owner sign-off:** owner approved, 2026-10-30, ahead of lawyer review. `PARENT_MADE_CHILDREN=1` is on in
    production from that date; the lawyer review of the text above is still open.
31. **Consent method (COPPA 312.5(b)).** The "no email" rule rules out email-plus. Email-plus and text-plus are only
    allowed when nothing is disclosed, and friend chat and public games count as disclosure. The choices are: (a) keep
    notice and acknowledgement only for now, (b) a third-party verified-consent provider or a COPPA Safe Harbor, or
    (c) a card check, which would reverse the owner's "paying is not consent" rule. Also decide whether kid self-signup
    must move to parent-made or school accounts once a method exists.
32. **Personal information and collection (312.2).** Does in-site friend chat make the username "online contact
    information"? Do free text and uploads in the Builder and in public games count as collection? This decides which
    features need consent, and whether they must be off by default for made accounts (AADC std 7).
33. **Separate consent for disclosure (312.5(a)(2), 2025 rule).** Is Anthropic a service provider for internal
    operations (see item 3)? If not, the Builder needs a separate parent opt-in, or it must be gated.
34. **GDPR and UK.** Which lawful basis applies: Art 8 consent with reasonable efforts to verify (ages vary by
    country), contract, or legitimate interests? Does the AADC apply? Should parent-made accounts be US-only, like
    family billing (D9)? Review the DPIA note (docs/dpia-parent-made.md).
35. **Parents' rights.** What may a parent review? The design shows counts only: is the child's own Builder chat
    reviewable, and is friend chat that holds other children's messages? How fast must requests be answered? Does a
    code-linked grown-up get the same see and delete rights as the maker? Who may see the content of a report about a
    deleted child's chat messages?
36. **Deletion text.** The page says everything the child made, wrote and uploaded is deleted "straight away", and that
    a short record stays (`family.kept.deleteTextKeeps`, `info.privacy.made.li9`). Confirm this is enough, given that
    backups may exist (owner: state backup retention), and that refusing deletion while the child is in a class (school
    records) is acceptable. What server/services/account-delete.js deliberately **keeps** after a deletion:
    - the user row as a tombstone (`deleted_<id>`, no password, banned), with `made_by`, `made_by_family` and `made_at`,
      kept indefinitely (the yearly creation limit and the admin's "accounts this family made" count it);
    - the old username in `reserved_names` for 90 days, so nobody can sign up as the child (its /u/ page is a plain 404);
    - `family_notice_acks` (the grown-up's acknowledgement record), indefinitely; `family_children` rows (unlinked;
      deleted 90 days after unlinking) and `link_reports` rows (resolved ones deleted after a year);
    - from a class the child **used to be** in (active membership refuses the deletion): `step_progress` rows (written
      answers, teacher feedback) and inactive `class_members` rows, as school records;
    - `plays` rows with the user id removed; `builder_turns` rows with the request text emptied (ids, day, weight: the
      family and AI-spend totals); the per-day counters `builder_usage` and `ai_usage`;
    - a chat message someone else reported: the row stays with its body blanked and the sender id kept, so that report
      stays for the other child's safety (item 35);
    - `audit_log` entries (ids only).
    Is keeping each of these acceptable, and for how long?
37. **US state laws.** Do the NY Child Data Protection Act, state age-appropriate design codes or kids' social-media
    laws need extra steps for friend chat or profiles on made accounts? Is "no age asked" still defensible for 13–14
    year olds once a parent is involved? Does a stranger making an account and handing it to someone else's child
    change our exposure, and are the first-sign-in Report card and the made-by record enough?

Owner decisions for parent-made accounts (no lawyer needed):
- **Retention numbers:** when an inactive made account is deleted; what happens to made children when the grown-up's
  own account goes; how long `family_notice_acks` records and backups are kept. Until these are set, no page claims a
  timer.
- **Unlinking a made account:** the design gives the grown-up no Remove, only Delete, and lets the child unlink or
  report with a forced new password. Confirm, or choose a hand-over that forces a password change.
- **Parent toggles** for friend chat, profile photo and public sharing, with privacy-first defaults (AADC std 7 and
  std 11)? This is extra scope with step-up. Also fix safety.md, which says grown-ups can switch chat off; today the
  kid's own Me does it.
- **Children a banned grown-up made:** today the admin pauses them by hand from a list. Should they be paused by
  default?
- **Numbers:** `FAMILY_MAX_CHILDREN` made per rolling 365 days, 2 per day, and whether a grown-up account must be some
  minimum age before it can make children.
- **Switch:** keep asking for the child's password (recommended)? Should made accounts get shorter sessions than
  60 days on shared devices?
- **Accept in writing** that a parent signing in as their child puts an adult in kid-only spaces (friends and chat)
  under the child's name. This can't be prevented technically, since the parent knows the password. /parents and
  safety.md should say "your child's account is your child's; please don't chat as them".

### Builder: speaking instead of typing, and looking facts up on the web (2026-10-30)

38. **Voice input in the Builder chat (COPPA audio exception, 16 CFR 312.5(c)(9) as amended in 2025).** New live
    privacy sentence `info.parents.ai.p2` on /parents and /privacy; `LEGAL_UPDATED` moved to 2026-10-30 for it. What
    ships, behind the owner setting `STT_API_KEY` (off until then, and the 🎤 button is not shown): a child taps the
    microphone, the clip (at most 60 seconds) goes to our server and from there to a speech-to-text provider
    (`STT_PROVIDER`, OpenAI by default); the words come back into the chat box for the child to check and edit, and
    are only sent when the child presses Send (then they go through the same screening as typed text). The clip is
    held in memory for that one request and dropped; it is never written to disk, the database or a log (the log line
    has its size, the time taken and the provider's name only). Please confirm:
    - that this fits the audio-file exception (collected only to replace written words, used for nothing else, deleted
      immediately), and that the notice wording is enough for it;
    - the claim "{provider} is not allowed to keep it or use it to train its systems" (the page names the provider set
      by `STT_PROVIDER`, e.g. OpenAI, as the amended COPPA notice rule asks). It is true only once the owner has
      **zero data retention** agreed for the key's project (OpenAI requires it before processing data of children under
      13; ElevenLabs only in its enterprise zero-retention mode, which the code requests with `enable_logging=false`).
      The owner must not set `STT_API_KEY` before that agreement exists;
    - the provider is now named on the page (from `STT_PROVIDER`); whether it must also be listed as a sub-processor;
    - the per-builder daily clip count and the site-wide minutes are kept in the database (`stt_usage`: day, user id,
      clips, seconds; never audio or words; 3 days, deleted with the account) so the caps survive a restart;
    - whether a school (FERPA, state student-privacy laws) needs to be told before its students can use it, or whether
      voice input should stay off for school accounts.

    **Addendum: live words while the child speaks (2026-10-30, not yet reviewed).** The words now show in the chat box
    while the child speaks (`server/services/stt-live.js`; `STT_LIVE=0` turns only this off). Same provider, same
    purpose, still never stored, so the Privacy sentence `info.parents.ai.p2` is unchanged and **`LEGAL_UPDATED` was not
    moved**. What changed in the data flow, please confirm:
    - the audio now reaches the provider **while the child is speaking** (before: after they pressed stop), through
      our server (a WebSocket relay; the key stays on the server). So speech the child then cancels with Esc has already
      been sent. The cancel message "Recording stopped. Nothing was sent or kept." would no longer be true in live mode,
      so live mode shows a new string, `js.studio.mic.cancelledLive` "Recording stopped. Nothing was kept." (13
      locales). **This new wording needs sign-off**; the old string is still used when the mic records and uploads;
    - zero data retention must also cover **OpenAI's Realtime API** for the key's project (not only the transcription
      endpoint), and ElevenLabs must honour `enable_logging=false` on its **realtime** endpoint (the code requests it);
    - when a live session fails, the page uploads the same recording once to the old endpoint, so the **same audio may
      reach the provider twice** (both deleted at once, neither stored by us);
    - **new small table `stt_live`** (review fixes, 2026-10-30): for each live session, a random session id, the child's
      user id, the game id, a state and an expiry, so the one fallback upload is still recognised after a server
      restart and not counted as a second clip. No audio, no words; rows go when used, when the session ends with its
      words, or within about 3 minutes; deleted with the account. The Privacy text was **not** changed for it and
      **`LEGAL_UPDATED` was not moved**: please confirm this usage metadata needs no mention (it is like `stt_usage`);
    - the first second or so of audio is now held **in our server's memory** (never on disk) until the provider's
      session is ready, then sent; and the words reach the provider phrase by phrase while the child speaks.
39. **The Builder looking facts up on the web.** New live privacy sentence `info.parents.ai.p3`; behind
    `BUILDER_WEB_SEARCH` (render.yaml keeps it `0` until the owner turns it on). The AI may search the web for a fact
    (for example a real animal or a sport's rules) with Anthropic's web search tool. Children never see links, pages or
    site names; adult, gambling, social, forum and video sites are blocked; queries that look like personal details, or
    that contain the builder's username or display name, or a full name next to a school or town word, are stopped;
    and an admin log keeps the query (those replaced by `[redacted]`), the sites, the game and the build for 90 days,
    with no user name or id. Note: a search runs as soon as the model asks for it (it is Anthropic's server tool), so
    stopping a query keeps its results out of the game and its words out of the log, but cannot stop the query
    reaching the search engine; the first guard is the rule given to the model and the screen on kids' own messages.
    The page now says this ("the Builder is told never to search for anything personal; if a search still looks
    personal, its results are not used and its words are not kept") instead of "nothing about your child is sent".
    The log is pseudonymous, not anonymous (each row has the game, which leads to the account); the page says "without
    your child's name or username, together with the game they were for". Please confirm:
    - **Citations.** Anthropic's terms ask that search results shown straight to users carry their sources. Our chat
      shows only the Builder's own words, never the results, and no source names (the owner's rule: no links for kids).
      Is that acceptable, or should the chat show plain, non-clickable source names ("Facts checked on: Wikipedia")?
    - the 90-day log and its wording on the page;
    - that facts about films, shows or brands found by search don't change the copyright rules (the Builder still
      refuses to put protected characters or names in games).
40. **The player's own Oomba character (the shared avatar).** New live privacy sentence `info.parents.stored.p4` (on
    /parents and /privacy; `LEGAL_UPDATED` is 2026-10-30). On the Me page a child with their own account can design a
    drawn character (species, body shape, one of 8 skin tones, hair style and colour, eyes, top and colours, one
    accessory, and what it wears in the "Bold" look for older players). It is stored as a small list of those choices
    (`users.character_spec`, migration 0036, never a picture, a photo, free text or a name), is given to the games the
    child plays (`BRB.user.character`, so the hero can be "them"), and is deleted with the account. Guests cannot save
    one (they play as the mascot). Please confirm:
    - that a skin-tone choice on a drawn character is not "personal information" under COPPA (it describes a cartoon
      the child chose, not the child), or whether it needs its own mention or parental notice;
    - that passing the character to games made by other children is fine (the game sees only the choices, never who
      made them; a game cannot send anything out of its sandbox);
    - whether school accounts need anything extra (it is optional and off until the student designs one).
41. **Live classroom: guest play without accounts (Oomba Live).** New, behind `LIVE_CLASSROOM` (on by default; `0`
    turns it off). `LEGAL_UPDATED` is unchanged: the new /parents and /teachers sections (`info.parents.live.*`,
    `teachers.live.*`) describe the feature and add no new collection from children with accounts. A teacher, a
    grown-up account or the platform admin opens a live room (`/live`); players join at `/join` with a 7-digit code
    from the host's screen (docs/decisions.md "Oomba Live", docs/safety.md §12).
    - **What a guest gives: nothing.** No account, no name, no email, no age. They pick one of 144 made-up nicknames
      ("Brave Otter") from a fixed list and get a random cartoon character. They cannot type anything anywhere (the
      only typed input is the code). No cookie is set for them; the page keeps a short-lived seat token in the tab's
      own `sessionStorage` (it dies when the tab closes or the session ends, at most 4 hours). Is the seat token
      "support for the internal operations of the website" under COPPA (16 CFR 312.2), so no notice or consent is
      needed for it?
    - **What is kept.** Sessions live in the server's memory only and end within 3 hours. When one ends we save one
      row of counts (players, guests) and the host's own question texts with per-question accuracy (`live_runs`),
      never a code, a nickname, a token, a name or an IP address. Rows without a class are deleted after 90 days.
      In a teacher's own class room, the class's signed-in students' scores are saved (`live_run_scores`) and go
      into the class gradebook like any other class work (school records, FERPA as for the gradebook today).
    - **Names.** Account names appear only in a class room run by a teacher of that class, where every player is a
      signed-in student of that class. Everywhere else (open rooms, family rooms) everyone, signed in or not, is a
      nickname. Hosts never get profile links, messages or any way to reach a player outside the session.
    - **Self-declared grown-up hosts.** Grown-up accounts are not verified. Their open rooms are capped at 30
      players, show nicknames only, can run only official and publicly reviewed games, save counts only, and every
      player screen has Report (fixed reasons). Should open rooms also need an account older than, say, 24 hours, or
      a confirmed email? (Owner question 4 in the design.)
    - **Reports.** Kept for a year after they are resolved, with the host, the game and the set's question texts;
      never who reported.
    - **Logs.** Session ids, seat numbers, user ids and counts only; never names, nicknames, codes or addresses.
      Visits to `/join` and `/live` are not counted in the site statistics.
    Questions for counsel: the seat token point above; whether a class room's account names shown on the projector
    need anything in the school-facing terms; whether open rooms hosted by unverified grown-ups are acceptable with
    these limits; and whether the per-question accuracy rows (host-written text plus counts) need a mention on /privacy.


42. **Oomba Live teams and teacher tools (part 3).** New, inside the school only; no new collection from guests and
    nothing new outside the session in open or family rooms (docs/decisions.md "Oomba Live, part 3", docs/safety.md
    §12). `LEGAL_UPDATED` changes only if the teachers' privacy text changes (one sentence in `teachers.live.*`).
    - **(a) A class's saved teams** (`live_class_teams`: class, student, team number; `live_class_team_cfg`: number of
      teams, preset numbers, scoring, who saved it). Seen only by the class's teachers. Deleted when the student leaves
      the class or the school, when the class is deleted, with the account, or on demand ("Forget saved teams").
    - **(b) Per-student support** (`live_support`: extra time ×1.5/×2, read aloud, simple view). It may reveal that a
      student has an IEP/504 plan: treated as education records (FERPA), seen only by the class's teachers, never shown
      to other students (it reaches only that student's own device and the teacher's dashboard), never given to game
      code, never on the projector, in the results or in the CSV. Deleted like (a), or with "Clear support". Behind
      `LIVE_SAVE_SUPPORT` (off) until the owner signs off; support for one session (memory only) works without it.
      **Question:** is "support" special-category data (GDPR Art 9, health) anywhere we serve, so an explicit school
      instruction (DPA clause) is needed before turning it on?
    - Deletion on demand never depends on a flag or the class being active: "Forget saved teams" and "Clear support"
      (and their APIs) work with Oomba Live, teams or `LIVE_SAVE_SUPPORT` turned off and for archived classes, and the
      progress page offers them whenever rows exist. Merging a school account into a student's own account moves (a),
      (b) and their live scores with the class membership; nothing stays on the switched-off account.
    - **(c) Per-question marks and bonus points** in `live_run_scores` (`marks`, `bonus`, `team`), class runs only,
      kept with the class like the gradebook. Bonus points are never in the gradebook score.
    - **(d) The host's own remembered game settings** (`live_prefs`), deleted with the account.
    - **Play again** keeps, for at most 2 minutes after a game ends, which seat had which account, nickname, avatar and
      team, and the session's removals, so the same players can be moved into a new game; then it is wiped.

43. **Oomba Live co-hosts: who else may run a live game, and what they see (part 4).** New, behind `LIVE_COHOST` (on by
    default; `0` turns it off). docs/decisions.md "Oomba Live, part 4", docs/safety.md §12. No new collection from
    students or guests; no new channel between an adult and a child.
    - **Who.** Class rooms: active staff (teachers, school admins) of the class's school, picked from the staff list a
      class teacher already sees (no search). Never a student, a guest, a banned account, staff of another school or a
      platform admin outside the school. Family rooms: another grown-up of the same family; **today nobody** (a family
      has one grown-up). Open rooms: nobody. At most 3, invites included; invites expire after 15 minutes.
    - **Two tiers.** A co-host who teaches the class sees what the host sees (account names on the Teacher view, needs
      help, support and support changes, who answered, Student details, the CSV, saved runs). Anyone else gets the game
      controls only: players' names as the players see them (account names only when the host shows them to the whole
      room), answer counts, no needs help, no support, no Student details, no CSV, no saved runs.
    - **The tier follows access now, not as it was at accept.** A teacher taken off the class mid-game (still staff of
      the school) drops to controls only at the next check (every 30 s, on reconnect, on a support change, at a handoff
      and at the end): their Teacher view is redrawn without needs help, support and who answered, and the results page
      shows them no Student details or CSV. Leaving the school stops co-hosting altogether. Support changes are never on
      the projector page, not even in its gated Co-hosts dialog.
    - **Adult names** (display or school roster names) go only to the adults running the game: never to a student's
      device, never into game code, never on the projector screen (the projector's Co-hosts list is behind a "check the
      class can't see your screen" step). Adults' account ids never go over the wire (small per-session numbers do).
    - **Stored:** `live_run_log` (who did what in a run that had a co-host: adults' ids, action, time, and in class runs
      the class student an action was about, e.g. removed or support changed) and `audit_log` rows for invites,
      answers, removals, leaving and handoffs (user ids and the session id only). Seen by the run's viewers (the owner,
      the class's teachers, platform admins). Retention follows `live_runs` (classless runs: 90 days); a deleted account
      becomes "A former co-host" (also when it is deleted while the game is still open: its id is never written into
      the log afterwards); a student who leaves the class is taken off the log; a school account merge moves it.
    - **Questions for counsel:** (1) Limited same-school staff see students' account names when the room already shows
      them to everyone: is that within "school officials with a legitimate educational interest" (FERPA), or should
      limited co-hosts always get nicknames? (2) The owner chose to give a school admin who doesn't teach the class the full tier
      (student details, support, CSV): confirm that fits "legitimate educational interest". (3) Does the action log about students (removed, support changed) need a sentence in the
      school-facing privacy text? (4) A "second grown-up in a family" feature (needed before family co-hosting does
      anything) needs its own review.
    - **Question:** do the school terms already cover teachers' saved groups ((a)), or do they need a sentence?
43a. **CS Quest class Standards tab and rubric marks (`/class/:id/standards`, `.csv`, `?report=1`).** Stores nothing new beyond the rubric marks 0-3 (`step_progress.marks`, P11); it reads the class's step progress, quiz marks and live exit-ticket scores and shows, per CSTA standard, how many students practiced, the class's exit-ticket accuracy, rubric means and (teachers only) the names of students who got none right. Seen only by the class's teachers and school admins (never students, the projector or public pages); the CSV holds counts only; the school report is aggregate with no names; rows go with the class (`onClassLeave` hook) and a student who leaves stops showing, like the gradebook. Education records under FERPA: please confirm no new notice is needed.
### AI voices: games, lessons and Oomba Live reading their own words aloud (2026-11, server part; not yet reviewed)

44. **AI voices (text to speech with OpenAI).** docs/decisions.md "AI voices", docs/tts-design.md. **Off** until the
    owner sets `TTS_ENABLED=1` and a key (`TTS_API_KEY`, or `STT_API_KEY` when both providers are OpenAI); even then
    each language stays silent until the admin switches it on at `/admin/voices` after listening to it. What ships:
    official games (never Builder games; **changed on 2026-11-13, see item 44a**), lesson quiz steps and Oomba Live questions can be read aloud with a voice
    made by OpenAI's speech API instead of the device's own voice. Please confirm:
    - **No child's personal information goes to OpenAI.** Only text written by us, an official game's makers or the
      child's teacher is sent (live and lesson questions are looked up on the server by number; the child's page can't
      send its own text there; game text needs a signed token for an official game, bound to the player). Checks refuse
      rude words, emails, phone numbers, addresses, links and the player's own name or username. Never chat, typed
      answers, names or a child's voice. Requests go from our server, so OpenAI sees our server's address, not the
      child's. Is OpenAI then outside COPPA's "disclosure" (no personal information), and does it still need listing as
      a sub-processor for schools?
    - **OpenAI's data retention for this text.** Speech API inputs are site text only, but they may be kept by OpenAI
      for abuse monitoring (30 days by default, from memory: please check OpenAI's current API data-usage terms) unless
      the project has zero data retention. Is ZDR needed here (it is required for the STT key, item 38, and the same key
      may be reused), or is default retention of site-written text acceptable?
    - **OpenAI usage policy: AI voices must be disclosed.** OpenAI requires telling listeners the voice is AI-generated
      and not a human. The disclosure goes on /parents (`info.parents.ai.p4`), /privacy (`info.privacy.children.p6`), the
      play page's 🔊 Voices sheet, the live settings, and a note under Read in Oomba Live and lesson quizzes (all 13
      locales; `LEGAL_UPDATED` moved to 2026-11-01). The direct notice to parents (`family.made.notice.*`) is not
      changed, because no information about the child goes to OpenAI: please confirm it needs no AI-voice line. Draft: "Characters in this game are voiced by a computer (AI voices from OpenAI). They read only
      the game's own words, never anything you type or your name." Is that wording enough for kids 8-14 and their
      parents?
    - **A choice, not consent.** Kids can switch to "This device's voice" (kept on the device), teachers choose AI or
      device voices for a live game (`voices` setting, default AI). No consent screen, because no personal information
      is involved: please confirm.
    - **Stored:** audio files on our disk (`<data>/tts`, keyed by a hash of the text and voice; capped at
      `TTS_CACHE_MB`), a `tts_cache` row per line (hash, sizes, voice, locale, role; no text, no user) and `tts_usage`
      per day (counts and characters only; 90 days). Logs carry a short hash, sizes and timings, never the text or who
      asked. The cost goes into the AI spending caps. Nothing is sold; there are no ads.

### AI voices for games made in the Builder (2026-11-13; the owner decided; NEEDS THE LAWYER'S SIGN-OFF)

44a. **AI voices now read the fixed lines of Builder games, including games children make.** docs/decisions.md "AI
    voices for Builder games: fixed, scanned lines only", docs/tts-design.md "Builder games by default". **Status: the
    owner decided this on 2026-11-13; the code and the policy text are written; no lawyer has reviewed either.** It
    changes item 44, which said "official games (never Builder games)" and "Only text written by us, an official
    game's makers or the child's teacher is sent". Like item 44 it does nothing until `TTS_ENABLED=1`, a key and a
    language switched on at `/admin/voices`; `TTS_BUILT_GAMES=0` turns this part alone off.
    - **What now goes to OpenAI:** when a player hears a Builder game read a line, that line's text is sent from our
      server to OpenAI's speech API once (then served from our cache). The line must be exactly one of the strings
      fixed in the stored, published version of the game, and that version must have passed our automatic safety scan.
      In a game a child made, those strings can contain **words the child asked the Builder to write** (a title, a
      joke, a question, a pet's name, and possibly the child's own first name if they asked for it in the game).
      Nothing else goes with it: no account, username, game id, device or address of the child or the player.
    - **What still never goes:** anything typed or said while playing, the player's name or username (checked), chat,
      and any line the game puts together while it runs (scores, answers, names filled in). Rude words, email
      addresses, phone numbers and family link codes in a line are refused. The maker's own name is **not** checked
      for (the checks know only who is playing).
    - **The policy text that changed** (13 languages; `LEGAL_UPDATED` 2026-11-13):
      - /parents `info.parents.ai.p4`. Before: "AI voices: some of our own games, lesson quizzes and Oomba Live
        quizzes can read their words aloud with a computer-made voice from OpenAI. Only text written by us, a game's
        makers or your child's teacher is sent, never what your child types or says, and never their name. …" Now:
        "AI voices: our own games, games made in the Builder, lesson quizzes and Oomba Live quizzes can read their
        words aloud with a computer-made voice from OpenAI. Only fixed text is sent: text written by us or your
        child's teacher, and the lines written into a game when it was made. In a game a child made with the Builder,
        those lines can include words the child asked for; they are sent only when our safety check has passed that
        version of the game. What a player types or says while playing is never sent, and never their name. …" (the
        last sentence, about being told and the 🔊 button, is unchanged).
      - /privacy `info.privacy.children.p6`. Before: "AI voices: when a game, lesson or Oomba Live reads text aloud
        with an AI voice, only that text is sent from our server to OpenAI to make the sound, never anything about
        your child. OpenAI may keep it for a limited time to check for misuse. Players are told these voices are made
        by a computer." Now: "AI voices: when a game, lesson or Oomba Live reads text aloud with an AI voice, only
        that text is sent from our server to OpenAI to make the sound, with nothing that says who is playing or who
        made the game. It is always fixed text: written by us or a teacher, or a line written into a game when it was
        made. In a game a child made with the Builder, those lines can include words the child asked for; a line is
        sent only if that version of the game passed our safety check, and never if it has rude words, an email
        address, a phone number or the player's own name in it. What a player types or says while playing is never
        sent. OpenAI may keep the text for a limited time to check for misuse. Players are told these voices are made
        by a computer."
      - **Not changed, please decide:** the direct notice to a parent making a child's account
        (`family.made.notice.ai`, also `info.privacy.made.*`) lists only what goes to Anthropic's Claude. The play
        page's note to kids ("They read only the game's own words, never anything you type and never your name") and
        the Terms were left as they are.
    - **Questions for counsel:**
      1. Is the text of a child-made game "personal information collected from a child" under COPPA when it is sent
         to OpenAI without any identifier, and is OpenAI then a recipient that must be named in the direct notice and
         covered by verifiable parental consent (or the school's authorization for school accounts)? The words were
         already sent to Anthropic to build the game (disclosed); OpenAI is a second AI company receiving a part of
         them.
      2. "Never anything about your child" was removed from /privacy because a child's own words in their game can
         now be sent. Is the new sentence accurate and enough, and should the **direct notice** get an OpenAI line
         before this is switched on for families?
      3. A child can ask the Builder to put a name in a game (their own, a friend's, a teacher's). Our checks stop
         the player's own name, emails and phone numbers, not other names. Is that acceptable for text that carries
         no other identifier, or should names be screened (which we cannot do reliably)?
      4. **Schools:** student work (a student's game text) now reaches OpenAI as well as Anthropic. Does OpenAI need
         adding to the school-facing subprocessor list and to any signed DPA before this is on for school accounts
         (FERPA school official; NY Ed Law 2-d, SOPIPA, SOPPA)? If so, we can keep school students' games on the
         device's voice until then (not built; say if wanted).
      5. OpenAI's retention of this text (item 44: about 30 days for abuse monitoring by default, from memory, not
         checked): is zero data retention now needed, since some of the text is child-written?
      6. The owner's rule is "only when the automatic scan passed". Is the automatic scan plus the per-line filters a
         reasonable safeguard to describe as "our safety check" in the policy?
    - **Until the lawyer answers:** the owner can leave `TTS_BUILT_GAMES=0` in production, which keeps Builder games
      on the device's voice while everything else about AI voices stays as reviewed under item 44. The policy text
      above would then describe more than the site does.

### Spark Packs on /refunds (2026-11-08; needs the owner's and the lawyer's sign-off before packs go live)

45. **Refund and cancellation text for Spark Packs** (`info.refunds.intro.p3` and the new `info.refunds.sparks.*`
    section on /refunds, between "Refunds" and "Special cases"; all 13 languages; docs/decisions.md "Spark Packs").
    **Status: written, not signed off.** The text says what the code does (server/services/sparks.js):
    - One payment, no renewal, nothing to cancel.
    - **A full refund within 14 days of buying a pack if none of its messages were used** (the owner's proposed rule,
      "refunds of unused packs on request within 14 days"; the same words as the pack picker on /family,
      `family.sparks.terms.refund`). After that, or once some messages are used, no refund "unless the law where you
      live says we must". Is a no-refund rule for partly used packs acceptable (state law, and EU/UK rules if packs are
      ever sold outside the US: there a consumer may lose the withdrawal right only with express consent at purchase)?
    - **A refund takes back what is left:** the webhook (`charge.refunded`) removes the refunded share of the pack's
      messages from what is left; a full refund ends the pack; messages already used stay used. A dispute or an early
      fraud warning ends the pack at once (`charge.dispute.created`, `radar.early_fraud_warning.created`).
    - **Expiry:** messages end one year after purchase (`SPARK_PACK_EXPIRY_DAYS`, 365: if the owner changes it, this
      sentence must change too); a pack keeps working after the plan ends; what is left at expiry is not refunded.
      Questions for counsel: do state gift-card / stored-value laws (some forbid expiry, e.g. California) reach a
      prepaid bundle of Builder messages? Is writing off unused messages at expiry fine, or must it be refundable?
    - The intro's sentence "This policy is only about the paid Family and School plans" (`info.refunds.intro.p2`) was
      left as it was (now followed by the pointer to the packs section). It also doesn't name the Basic plan: please
      reword it at the same pass (and re-translate it).
    - **`LEGAL_UPDATED` was not moved** for this change: it is also the version parents acknowledge for parent-made
      accounts (`notice_version`), so the owner moves it to the sign-off date when approving the text (and updates the
      date in tests/unit/legal.test.js and tests/e2e/legal.spec.js).
    - **Sign-off:** _owner: yes, 2026-11-09_ · _lawyer: yes, 2026-11-09_ (see "Sign-off" at the top). Earlier note: packs stay off sale until both are recorded here (the Spark
      Pack Prices are not created in live mode before then: docs/billing-go-live.md step 3).

### Teacher plan and free trial (2026-11-09; needs the lawyer's sign-off with the rest before `TERMS_PUBLISHED`)

The Teacher plan replaced the per-student School plan in the live text (docs/decisions.md "Teacher plan"). Changed:
terms 7.3 (`info.terms.plans.s3`, `li13`–`li15`: $ per teacher per year, the 14-day free trial with no card that
simply stops without one, one trial per teacher / email / school, the class's shared daily messages, schools buying
teacher seats, grandfathered per-student plans keeping their price at renewal), the privacy policy's school billing
(`info.privacy.schoolBilling.li5`: seats are teachers) and /refunds (`info.refunds.intro.p2`, new
`info.refunds.refunds.p8`: a trial costs nothing; the 14-day refund window starts at the first payment after it).
Questions for the lawyer:

1. Free-trial disclosures: the trial needs no card, so nothing auto-renews into a charge unless the teacher adds one.
   Is the Checkout page (Stripe's) plus the 7-day reminder email (a Stripe setting) and our own notice 3 days before
   enough for state automatic-renewal laws when a card *is* added during the trial?
2. The trial sign-up keeps an HMAC of the work email (never the address) to allow one trial per email. Fine as
   described in the privacy policy, or does it need its own line?
3. The self-serve teacher sign-up makes a school with the teacher as its admin (no "Set up my school" review): the
   terms' section 3 (the school confirms its authority) now also binds a single teacher. Is that wording still right?

### Google Classroom sync (2026-11-09; behind `GOOGLE_CLASSROOM`, off; FLAGGED for the owner's legal review)

A teacher can connect their own Google Classroom and sync one Oomba class with one Classroom class
(docs/google-classroom.md, docs/decisions.md "Google Classroom sync"). This is a new flow of student data between Oomba
and Google, directed by the teacher. Data-protection notes (DPIA-style):

- **Purpose:** the school's own teaching: put Oomba lessons into the class's Classroom stream and its grades into the
  teacher's Classroom gradebook. No other use; nothing goes to Google for advertising or analytics.
- **Sent to Google** (only when the teacher presses Post or Send grades, or ticks "Also post"): the lesson's title, a
  fixed one-line description, the link to the lesson, its due date and 100 points; then, for each student who is on the
  teacher's own Classroom roster, in the Oomba class and has started the lesson, a completion grade out of 100 (steps done). Never names,
  written answers, feedback, games, drawings, audio or anything from other classes. The score is a draft grade unless
  the teacher chooses "assigned".
- **Received from Google:** the teacher's Google account id, email and active Classroom class names; for the linked
  class each student's Google account id and full name. No student emails (we don't request that scope). A student
  new to Oomba is held (Google account id and full name, 30 days) until they first sign in with Google on the school's
  domain; only then is a school account made, with the full name as its staff-only roster name (never public; the
  public name stays a generated username), as invites by school email do. A personal account never gets one.
- **Stored:** the teacher's refresh token, encrypted (AES-256-GCM, key in an env var); the class ↔ course link; which
  lessons were posted and when grades were sent (counts only); a sync log of counts and error codes kept 180 days; the
  audit log. Disconnect revokes the token at Google and deletes it; deleting the teacher's account does too.
- **Who:** only the class's teachers and the school's admins; students never see it.

Questions for the lawyer:

1. Is sending scores to the school's own Google Workspace for Education a disclosure *to the school* (FERPA school
   official; COPPA school authorization) that our school terms and privacy policy already cover, or does the privacy
   policy need a line naming Google Classroom as a teacher-chosen integration?
2. Holding a Classroom roster entry (name + Google account id, 30 days) until the student first signs in, then making
   their school account: is that covered by the school's authorization, as with login cards and email invites?
3. Google's API Services User Data Policy and the Workspace "Limited Use" requirements for these sensitive scopes: do
   the privacy policy and a public "how we use Google data" statement need wording before Google verifies the app?
4. State laws (NY Ed Law 2-d, SOPIPA, SOPPA): does a teacher-initiated sync to Google need to appear in the school DPA
   template or the published list of subprocessors? (Google is the school's own processor here, not ours.)
