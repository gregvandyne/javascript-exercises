# Legal review: what the published pages decided, and what the lawyer still has to answer

/terms, /refunds and /privacy (server/routes/info.js, text in `info.terms.*`, `info.refunds.*`, `info.privacy.*` and the
reused `info.parents.*` sections) are on the site for everyone, also before `BILLING_PUBLIC`. They were made from the
drafts terms.md, refunds.md and privacy-payments.md. The public text has no drafting markers; every marker from the
drafts is listed here with what the page says today. **Last updated: 2026-10-27** (`LEGAL_UPDATED` in
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
