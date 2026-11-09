# Google Classroom sync: setup for the owner

Teachers can connect their Google Classroom, link an Oomba class to one of their Classroom classes ("courses" in
Google's words), import its students, post a lesson as a Classroom assignment (a link back to the lesson, with its due
date), and send each student's lesson score as a draft or assigned grade. It sits on top of **Sign in with Google**
and is **off** until you set it up. Code: `server/services/gclassroom.js` (logic), `server/services/gclassroom-client.js`
(the only file that talks to Google), `server/routes/gclassroom.js` (the class's Google Classroom page and APIs).
Decisions: docs/decisions.md "Google Classroom sync".

## What teachers see

- On a class's **Lessons** tab: a **🎓 Google Classroom** button (school staff only). It opens
  `/class/<id>/google-classroom`: Connect, pick the Classroom class, **Import students**, then each lesson with
  **Post to Google Classroom** and, once posted, **Send grades** (draft or assigned), and a list of recent syncs with
  plain-language errors.
- The **Assign a lesson** form gets "Also post to Google Classroom" (ticked) once the teacher is connected and the class
  linked.
- The **Students** tab has a one-line link to the import.
- Each teacher connects their own Google account. Co-teachers connect theirs. Students never see any of it.

## 1. Google Cloud: turn on the Classroom API

Use the same Google Cloud project as Sign in with Google (the one that owns `GOOGLE_CLIENT_ID`).

1. Google Cloud console → **APIs & Services → Library** → search "Google Classroom API" → **Enable**.
2. **APIs & Services → Credentials** → your OAuth client (Web application) → **Authorized redirect URIs**: add
   `https://oomba.ai/auth/google/classroom/callback` (keep the sign-in one, `…/auth/google/callback`).

## 2. OAuth consent screen: add the scopes (needs Google's verification)

**APIs & Services → OAuth consent screen → Data access (Scopes) → Add or remove scopes** and add exactly these three:

| Scope | Why |
|---|---|
| `https://www.googleapis.com/auth/classroom.courses.readonly` | list the classes the teacher teaches, to pick one |
| `https://www.googleapis.com/auth/classroom.rosters.readonly` | read the students of the linked class (their Google account id and name) |
| `https://www.googleapis.com/auth/classroom.coursework.students` | create the lesson's assignment and set grades on it |

We don't ask for `classroom.coursework.me`, `classroom.profile.emails`, guardians, Drive or anything else: an email is
never read, students are matched by their Google account id.

These are **sensitive scopes**: before the app is used by people outside your own Google Workspace, Google must verify
it (Publishing status → **Prepare for verification**). Expect to give: the privacy policy URL (`https://oomba.ai/privacy`),
the home page, a short video of the connect → link → import → post → grade flow, and a sentence per scope (the table
above). Verification takes days to weeks. Until it is verified, only test users you list on the consent screen can
connect (up to 100), and they see an "unverified app" warning. Schools whose Workspace admin restricts third-party
apps must also allow Oomba Academy (the same Admin console step as for sign-in, /google-setup).

The connection is per teacher and asks Google for **offline access** (a refresh token) with **incremental
authorization**: the teacher signs in to Oomba as usual, and only Connect asks for the Classroom scopes.

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
- **Against real Google:** add yourself as a test user on the consent screen, set the three variables on Render,
  create a test class in classroom.google.com with a test student, then on oomba.ai: Connect → link → Import students
  → Post a lesson (check it appears in Classroom with the link and due date) → have the student open the lesson and do
  a step → Send grades (draft) and check the grade in Classroom → Disconnect (check the app is gone from
  myaccount.google.com/permissions).

## What goes to Google, what comes back, what we keep

- **To Google:** the lesson's title, a fixed one line ("Open this lesson on Oomba Academy."), the link to the lesson,
  its due date (end of the due day in the school's time zone; left off when it has passed), maximum points 100, and for
  each student on the teacher's own Classroom roster who is in the Oomba class and has started the lesson, a score out
  of 100 (steps done of the lesson's steps). Never names, written answers, feedback, games or drawings.
- **From Google:** the teacher's Google account id and email (to show "Connected as"), their active classes' names, and
  for the linked class each student's Google account id and full name.
- **Kept:** the refresh token, encrypted (`gc_connections`); the link class ↔ course (`gc_links`); posted assignments
  and when grades were last sent, with counts (`gc_posts`); a sync log of counts and error codes (`gc_syncs`, deleted
  after 180 days), plus the audit log. A student's full name from Classroom becomes the staff-only roster name of a
  new school account; the public name is a generated username, as with login cards.
- **Disconnect** revokes the token at Google and deletes it. Deleting a teacher's account does the same.

## Limits

- Students are matched by Google account id only. A student whose Oomba account isn't connected to Google yet (a login
  card, an own account) isn't matched: connect Google on their account first, or they join with the class code.
- Students who use their own Oomba account outside the school, other schools' accounts and staff are left out and
  counted.
- New students need the school's Google domain (school Settings tab), like invites by school email.
- A lesson is posted once. Changing its due date in Oomba later doesn't move the Classroom one.
- Assignments made by Oomba can be graded by Oomba; Google doesn't let any app grade coursework another app made.
- At most 300 students per import, 20 imports an hour per class, 60 syncs an hour per teacher.
