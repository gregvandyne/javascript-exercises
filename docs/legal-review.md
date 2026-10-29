# Legal review: what the published pages decided, and what the lawyer still has to answer

/terms, /refunds and /privacy (server/routes/info.js, text in `info.terms.*`, `info.refunds.*`, `info.privacy.*` and the
reused `info.parents.*` sections) are on the site for everyone, also before `BILLING_PUBLIC`. They were made from the
drafts terms.md, refunds.md and privacy-payments.md. The public text has no drafting markers; every marker from the
drafts is listed here with what the page says today. **Last updated: 2026-10-29** (`LEGAL_UPDATED` in
server/routes/info.js; change it with every change to the text).

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
