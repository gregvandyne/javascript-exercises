# Parent-made child accounts: data protection impact note

A short DPIA and risk note for the lawyer and the owner (docs/legal-review.md items 30–37). It describes what ships behind
`PARENT_MADE_CHILDREN` (off by default) and `familiesOn`; docs/decisions.md "Parent-made child accounts" has the design.
Nothing here is legal advice, and nothing on the site calls this feature consent.

## Purpose
A parent or legal guardian with a grown-up account makes their child's own Oomba Academy account on /family, so a child
who can't manage a sign-up can play and build, and the grown-up can look after the account (a lost password, deletion)
without the site ever asking for an email.

## The data
- **The child's account:** a made-up username, a bcrypt password hash, and then the same data as any kid account: games,
  Builder chats, pictures and files uploaded, game saves, scores, ratings and likes, friends and friend chat, a profile
  photo if added, settings, and sign-ins with the browser's name. No email, age, birthday, real name, school, location,
  phone or payment details are asked for.
- **Provenance:** `users.made_by`, `made_by_family`, `made_at`: which grown-up and family made the account. Never cleared,
  so the yearly limit and the admin can still see it after an unlink or a deletion.
- **The notice record:** `family_notice_acks`: grown-up, child, notice version (`LEGAL_UPDATED`), time, method
  `notice-ack`, and the "parent or legal guardian" statement. A record that a notice was shown and acknowledged; not a
  consent.
- **Notes:** `made_note_seen_at` (the child answered the first-sign-in card), `pw_reset_note_at` (tell the child once that
  the grown-up set a new password), `link_reports.parent_made`, and `reserved_names` (a deleted child's old username for
  90 days).
- **Audit:** ids only (`user.signup {parentMade}`, `family.child.create`, `family.link {by:'create'}`, `family.switch`,
  `family.child.password_reset`, `user.delete`), never a name the grown-up typed or a password.

## The tie to an identifiable adult
The grown-up's account may carry a real name (grown-up usernames may be real names), and if they pay, Stripe holds their
email and billing details. A parent-made child account is linked to that adult from the start, so it is more
identifiable than a self-made kid account. Nothing about the adult is shown to the child, the child's friends or the
public: the child sees only "your grown-up".

## What goes to Anthropic
The same as for every child account: Builder messages, pictures and files (to make the game and to screen them),
profile photos (a safety check) and a game's text and code for the public review. No names or usernames. Friend chat
never goes to the AI. Whether Anthropic is a service provider for internal operations, or needs a separate parent opt-in,
is legal-review items 3 and 33.

## Risks
1. **An adult makes an account and hands it to someone else's child** (grooming through a pre-made account).
2. **Switch used to impersonate the child** (an adult in kid-only spaces, friends and chat, under the child's name).
3. **The adult keeps the password** after the child wants out.
4. **Real names in children's usernames** (parents name their child).
5. **Bulk creation** of child accounts by one adult.
6. **Over-collection by the parent** (reading the child's chats, including other children's messages).
7. **Incomplete deletion** (data left behind, a reused name).

## Mitigations (design B2–B9)
1. Limits: the kid sign-up's per-address buckets, `FAMILY_MAX_CHILDREN` a rolling year (deleted accounts count) and 2 a
   day, the live cap, and no new account while a child's report against the family is open. The first-sign-in card
   tells the child a grown-up made the account and offers "This isn't my grown-up" (Report). Reports are flagged as made
   accounts for the admin, who sees every account a family made and can pause them all after a ban.
2. Switch asks for the child's password (wrong tries count toward the child's own sign-in lock) and the grown-up's
   step-up, signs the grown-up out on that device, and leaves nothing in the child's session that remembers the adult.
   The way back is the grown-up's normal sign-in. /parents asks parents not to chat as their child.
3. Report or Unlink on a made account forces a new password and ends every other sign-in in the same transaction. The
   grown-up has no Remove (unlink) for a made child, only Delete.
4. Kid name rules on this route (no `realNames`): the FirstLast real-name pattern, birth years, digit runs, the link-code
   shape, the word filter, and no part of the grown-up's own name.
5. See 1, plus a flood guard per grown-up and the step-up on every action.
6. The grown-up sees counts only, as of the end of yesterday, never content and never today; the child is told the same
   list. A content view waits for the lawyer (item 35).
7. One deletion service in one transaction (services/account-delete.js): sessions, links, friends, chat, games and their
   files, rows on other games, Google and join rows, the photo; the user row becomes a tombstone; Builder totals keep no
   text; the old name is reserved for 90 days. Refused while the child is in a class.

## Remaining risks and open questions
- No verified parental consent (COPPA 312.5(b)); GDPR/UK lawful basis and the AADC (items 31, 34).
- A determined adult who knows the password can still sign in as the child (owner decision: accept in writing).
- Backups may hold deleted data until they expire; the site says nothing about backups until the owner states how long
  they are kept (item 36).
- Retention numbers for inactive made accounts, notice records and backups are unset (owner decision).
- Reports about a deleted child's messages keep the report row with the message text blanked (item 35).
- Whether self-signed-up kid accounts should move to parent-made or school accounts once a consent method exists (item 31).

## Sign-off
The owner signs here (and records it under docs/legal-review.md item 30) before `PARENT_MADE_CHILDREN=1` in production.

- Owner: ____________________  Date: ____________
- Lawyer reviewed: ____________________  Date: ____________
