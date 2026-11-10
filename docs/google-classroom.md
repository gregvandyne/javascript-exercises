# Google Classroom sync: setup for the owner

Teachers can connect their Google Classroom, link an Oomba class to one of their Classroom classes ("courses" in
Google's words), import its students (and keep them up to date every 6 hours), and, once they allow posting: post a
lesson as a Classroom assignment (a link back to the lesson, with its due date) or share it as a material, send each
student's lesson score as a draft or assigned grade (by hand or automatically), file Oomba's posts under a topic, and
post announcements to the class stream. It sits on top of **Sign in with Google** and is **off** until you set it up. Code: `server/services/gclassroom.js` (logic), `server/services/gclassroom-client.js`
(the only file that talks to Google), `server/routes/gclassroom.js` (the class's Google Classroom page and APIs).
Decisions: docs/decisions.md "Google Classroom sync".

## What teachers see

- On a class's **Lessons** tab: a **🎓 Google Classroom** button (school staff only). It opens
  `/class/<id>/google-classroom`: Connect, pick the Classroom class, **Import students**, then:
  - **Connect** asks Google only for the two read scopes. The panel lists what Oomba may do in the teacher's Classroom;
    while a write scope is missing, **✍️ Allow Oomba Academy to post to Classroom** asks Google again for the optional
    scopes (incremental authorization). Each write control shows only once its scope was granted; until then it is a
    short note with that button.
  - **Students from Classroom:** "Roster updated <time>", students still waiting to sign in, and **No longer in Google
    Classroom**: students who left the Classroom class, each with **Remove from class** and **Keep** (never removed on
    their own).
  - **Automatic sync:** "Update the students from Classroom every 6 hours" (on by default) and "Send grades
    automatically" (off by default; draft or assigned). A pause (connection broken, posting no longer allowed, an error)
    is said in the panel, with **Reconnect Classroom** where that is the fix.
  - **Lessons in Classroom:** the topic's name for this class ("Oomba Academy" by default, in the teacher's language),
    then each lesson with **Post to Google Classroom** and, once posted, **Send completion grades** (draft or assigned),
    and **Share as material**.
  - **Post to the class stream:** three templates the teacher completes before sending: a live game starting now (the
    code of the live game open for this class), a lesson that is ready (title and link), or their own message.
  - **Recent syncs** with plain-language errors.
- The **Assign a lesson** form gets "Also post to Google Classroom" (unticked) once the teacher is connected, allowed to
  post and the class linked.
- The **live host screen** of a class game gets **📣 Announce in Classroom** (when the host may post announcements to
  that class's linked Classroom class): it opens the class page with the live-game template ready.
- The **Students** tab has a one-line link to the import.
- Each teacher connects their own Google account. Co-teachers connect theirs. Students never see any of it.

## 1. Google Cloud: turn on the Classroom API

Use the same Google Cloud project as Sign in with Google (the one that owns `GOOGLE_CLIENT_ID`).

1. Google Cloud console → **APIs & Services → Library** → search "Google Classroom API" → **Enable**.
2. **APIs & Services → Credentials** → your OAuth client (Web application) → **Authorized redirect URIs**: add
   `https://oomba.ai/auth/google/classroom/callback` (keep the sign-in one, `…/auth/google/callback`).

## 2. OAuth consent screen: add the scopes (needs Google's verification)

**APIs & Services → OAuth consent screen → Data access (Scopes) → Add or remove scopes.** The two **required** scopes
are enough to start: with only those, teachers can connect, link a class and import (and auto-refresh) its students.
Each **optional** scope turns on its features once you add it here and a teacher allows it ("Allow Oomba Academy to post
to Classroom"); a teacher who leaves a box unticked on Google's screen just doesn't get that feature.

| Scope | Required? | Why |
|---|---|---|
| `https://www.googleapis.com/auth/classroom.courses.readonly` | required | list the classes the teacher teaches, to pick one |
| `https://www.googleapis.com/auth/classroom.rosters.readonly` | required | read the students of the linked class (their Google account id and name), by hand and every 6 hours |
| `https://www.googleapis.com/auth/classroom.coursework.students` | optional | create the lesson's assignment and set grades on it (by hand or automatically) |
| `https://www.googleapis.com/auth/classroom.courseworkmaterials` | optional | share a lesson as an ungraded material (title, one fixed line, link) |
| `https://www.googleapis.com/auth/classroom.topics` | optional | make one topic per linked class ("Oomba Academy" by default) and file Oomba's posts under it |
| `https://www.googleapis.com/auth/classroom.announcements` | optional | post an announcement the teacher wrote to the class stream |

We don't ask for `classroom.coursework.me`, `classroom.profile.emails`, guardians, push notifications (Pub/Sub), a
Classroom add-on, Drive or anything else: an email is never read, students are matched by their Google account id.

These are **sensitive scopes**: before the app is used by people outside your own Google Workspace, Google must verify
it (Publishing status → **Prepare for verification**). Expect to give: the privacy policy URL (`https://oomba.ai/privacy`),
the home page, a short video of the connect → link → import → allow posting → post → share as material → grade →
announce flow, and a sentence per scope (the table above). You can verify the two required scopes first and add the
optional ones later: the site works either way. Verification takes days to weeks. Until it is verified, only test users you list on the consent screen can
connect (up to 100), and they see an "unverified app" warning. Schools whose Workspace admin restricts third-party
apps must also allow Oomba Academy (the same Admin console step as for sign-in, /google-setup).

The connection is per teacher and asks Google for **offline access** (a refresh token) with **incremental
authorization**: the teacher signs in to Oomba as usual, Connect asks for the two read scopes, and "Allow Oomba Academy
to post to Classroom" asks for the optional ones (`include_granted_scopes=true`, so earlier grants are kept). The scopes
Google says were granted are stored and read again from Google at every token refresh, so a scope the teacher takes back
in their Google account hides its feature.

## 3. Render: environment variables

| Variable | Value |
|---|---|
| `GOOGLE_CLASSROOM` | `1` turns the feature on (needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, i.e. Sign in with Google, on). |
| `GOOGLE_TOKEN_KEY` | **Secret.** The key that encrypts teachers' Classroom refresh tokens in the database (AES-256-GCM). 32 bytes as 64 hex characters: make one with `openssl rand -hex 32`. Without it the page says Classroom isn't set up and nothing is stored. Keep it out of the repo and logs. |
| `CLASSROOM_API_BASE` | Leave unset (default `https://classroom.googleapis.com`). Tests only; the server refuses another value in production. |

Changing `GOOGLE_TOKEN_KEY` makes every stored token unreadable: each teacher sees "connect again" (nothing else is
lost). To rotate the key, set the new one and tell teachers to reconnect.

## 4. Try it

- **Locally with the fakes:** `node tests/support/fake-google.js --port 5932` and
  `node tests/support/fake-classroom.js --port 5940` (a demo course "Class 4B (Classroom)" with three students), then
  start the server with `GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=fake-test-secret
  GOOGLE_OIDC_BASE=http://127.0.0.1:5932 GOOGLE_CLASSROOM=1 GOOGLE_TOKEN_KEY=$(openssl rand -hex 32)
  CLASSROOM_API_BASE=http://127.0.0.1:5940 npm start`, sign in as DemoTeacher, open Demo Class → 🎓 Google Classroom.
  The school needs a Google domain (school Settings tab) before new students can be imported.
- **Tests:** `node --test tests/unit/gclassroom.test.js`; `npx playwright test tests/e2e/teach-gclassroom.spec.js`.
- **The automatic jobs** (services/gclassroom.js, registered with services/jobs.js): grades every 30 minutes
  (`gclassroom-auto-grades`), the roster every hour for classes last imported 6 hours ago (`gclassroom-roster-refresh`),
  each also once a few minutes after a deploy.
- **Against real Google:** add yourself as a test user on the consent screen, set the three variables on Render,
  create a test class in classroom.google.com with a test student, then on oomba.ai: Connect → link → Import students
  → Allow Oomba Academy to post to Classroom → Post a lesson (check it appears in Classroom under the topic "Oomba
  Academy", with the link and due date) → Share as material → have the student open the lesson and do a step → Send
  grades (draft) and check the grade in Classroom → turn on "Send grades automatically", have the student do another
  step, and check the grade changes within 30 minutes → Post to the class stream → Disconnect (check the app is gone
  from myaccount.google.com/permissions).

## What goes to Google, what comes back, what we keep

- **To Google**, only once the teacher allowed posting, and only what they ask for:
  - **An assignment:** the lesson's title, a fixed one line ("Open this lesson on Oomba Academy."), the link to the
    lesson, its due date (end of the due day in the school's time zone; left off when it has passed), maximum points 100.
  - **A material:** the lesson's title, the same fixed line and the link; no grade, no due date.
  - (A lesson that opens later is sent as a draft scheduled for its opening day, either way.)
  - **Grades:** for each student on the teacher's own Classroom roster who is in the Oomba class and has started the
    lesson, a completion grade out of 100 (steps done of the lesson's steps, not right answers). Automatic grades send
    only grades that changed since the last one sent, and stop 30 days after the lesson's due date (90 days after it was
    posted when it has none).
  - **A topic:** its name ("Oomba Academy", or the teacher's own name for it), made once per linked class.
  - **An announcement:** the template's fixed words (a live game's join code and link, or a lesson's title and link)
    and the teacher's own words, plain text, at most 500 characters. Oomba never adds a name or a result, and refuses
    to post a message with a student's name (roster name, first name, display name or username) in it.
  - Never names, written answers, feedback, games or drawings.
- **From Google:** the teacher's Google account id and email (to show "Connected as"), their active classes' names, and
  for the linked class each student's Google account id and full name.
- **Kept:** the refresh token, encrypted, and the scopes Google granted (`gc_connections`); the link class ↔ course
  with the class's settings (automatic sync, the topic's name and id) (`gc_links`); posted assignments and materials and
  when grades were last sent, with counts (`gc_posts`); per posted assignment and student, the grade last sent
  (`gc_grades`, so unchanged grades aren't sent again; deleted with the post); the students a roster import matched and
  when they left Classroom (`gc_roster`); a sync log of counts and error codes, never names, grades or announcement
  text (`gc_syncs`, deleted after 180 days), plus the audit log. A student new to Oomba waits (`gc_pending`: Google account id and full name, 30
  days) until they first sign in with Google on the school's domain; then their full name becomes the staff-only roster
  name of a new school account, and the public name is a generated username, as with login cards.
- **Disconnect** revokes the token at Google and deletes it. Deleting a teacher's account does the same.

## Limits

- Students are matched by Google account id only. A student whose Oomba account isn't connected to Google yet (a login
  card, an own account) isn't matched: connect Google on their account first, or they join with the class code.
- Students who use their own Oomba account outside the school, other schools' accounts and staff are left out and
  counted.
- New students need the school's Google domain (school Settings tab), like invites by school email. They join the
  class the first time they sign in with Google on that domain (within 30 days of the import; import again to renew).
  A personal Gmail on the Classroom roster never gets a school account.
- Linking a different Classroom class drops the old posts: post the lessons again to the new class. Unlinking forgets
  the class's settings (automatic sync, topic name).
- A lesson is posted once as an assignment and once as a material. Changing its due date in Oomba later doesn't move
  the Classroom one.
- Students who leave the Classroom class are never removed from the Oomba class on their own: the teacher removes them
  (or keeps them) from the list. Only students an import matched are tracked this way.
- The roster refresh runs only after a first import by hand, with the connection of the teacher who linked the class.
  Automatic grades go with the connection of the teacher who turned them on; disconnecting turns them off.
- The live-game announcement uses the code of the live game open for this class; a code can't be typed in.
- Assignments made by Oomba can be graded by Oomba; Google doesn't let any app grade coursework another app made.
- At most 300 students per import, 20 imports an hour per class, 60 syncs an hour per teacher (automatic grades count
  against the same 60), 10 announcements an hour per class.
