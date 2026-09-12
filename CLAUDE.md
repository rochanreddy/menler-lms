# Menler LMS

Standalone LMS: `server/` (Express 5 + Mongoose 8, `/api/lms`, port 4100) and
`client/` (Vite 7 + React 19 + React Router 7, port 5174). Two independent npm
projects — no workspace root, no shared lockfile. Install and run each separately.

Three roles: `student` · `mentor` · `admin`. A user has exactly one.

```
server/  index.js · db.js · routes/ · models/ · middleware/auth.js · utils/ · scripts/
client/  src/App.jsx · nav.jsx · api.js · styles.css · components/ · pages/{,admin/,mentor/}
```

## Commands

```bash
cd client && npm run build     # vite build — THE build gate for UI work (~13s)
cd client && npm run dev       # :5174
cd server && npm run dev       # :4100 (node --watch)
cd server && npm run seed      # admin@menler.in / ChangeMe123!
cd server && npm run seed:full # the whole LMS, mid-cohort (see below)
cd server && node scripts/dedupeCurriculumPdfs.js          # dry run; --apply to collapse
                               # duplicate curriculum PDF blobs (needs CONFIRM_DB to apply)
cd server && node scripts/syncCurriculumAssignments.js     # dry run; --apply to write
                               # puts a curriculum's work into every one of its batches'
                               # Assignments & Projects tab: Generalist 6 weekly
                               # assignments + 4 milestone projects, Kickstarter 17
                               # session assignments + 4 portfolio projects. Name one
                               # programme to limit it. Idempotent; sets no dates.
cd server && npm run test:flows # drives all three roles against a RUNNING server
cd server && CONFIRM_DB=<db> LMS_LAUNCH_STUDENT_PASSWORD=… node scripts/resetForLaunch.js
                               # wipe to launch state: admin + one student, two named
                               # batches, lesson trees + real library kept. Backs up
                               # every lms_* collection to server/backups/ first and
                               # refuses to run unless CONFIRM_DB names the connected DB.
```

### Curriculum

[server/scripts/curricula.js](server/scripts/curricula.js) is the **single source
of truth for lesson copy**, transcribed from the two official PDFs — AI
Kickstarter (4 sessions · 19 topics · 4 portfolio projects) and the AI Generalist
fellowship (6 weeks · 12 sessions · 4 milestone projects). `npm run seed:content`
authors both into the Learning tree; `seed:full` builds its cohort on top of the
same trees and adds the per-lesson PDFs and class links. Neither seed carries
lesson text of its own — if a PDF changes, it changes in `curricula.js` and both
seeds follow. `seed:full` will not overwrite a curriculum that already has
lessons; pass `FORCE_CURRICULUM=1` to reset a programme back to the PDF.

**A fixture seed refuses to run on live.** `seed:full`, `seed:demo` and
`seed:content` call `assertSeedTarget()`
([scripts/seedGuard.js](server/scripts/seedGuard.js)) straight after connecting:
they run freely against a database whose name ends in `_test`, and against
anything else only when `CONFIRM_DB` names that database. This exists because
`seed:full` was once run with the default `MONGODB_URI` and replaced the live
launch cohorts with sixteen invented students mid-course.

**Media belongs to the admin, not to the seed.** `curricula.js` carries lesson
copy only, so a lesson rebuilt from it has every media field empty. `seed:content`
therefore carries `readingUrl`, `notesUrl`, `classLink` and `contentUrl` across
with the lesson id — otherwise a re-author silently detaches every PDF uploaded
through the curriculum editor. The exception is the placeholders `seed:full`
stamps on (the marketing brochure, the joke recording): those count as an empty
slot, or the real curriculum would be pinned to them forever.

**Module ebooks.** [server/assets/curriculum-pdfs/](server/assets/curriculum-pdfs/)
holds the week/session ebooks, committed so a seed is reproducible off one
laptop. `CURRICULUM_PDF_RULES` in
[curriculumPdfAssets.js](server/utils/curriculumPdfAssets.js) maps a module title
prefix to its ebook; the seed loads each into Mongo once (keyed on the content
hash, so re-seeding never duplicates a blob or moves a URL) and fills the reading
slot of every lesson in that module that has none. Modules with no rule keep an
empty slot, which the lesson UI renders honestly as "No reading yet".

**Lesson ids are load-bearing.** Modules/chapters/topics are embedded
sub-documents, so a naive `p.modules = …` re-mints every `_id` and orphans the
three things keyed on them: `Progress.completedTopics`, `BatchLessonVideo`
(`batchId`+`topicId`) and `User.blocked.moduleIds`. That fails silently rather
than loudly — [progress.js](server/routes/progress.js) counts
`completedTopics.length` capped at the lesson total, so a student keeps a
plausible percentage (which gates the certificate) while no lesson renders as
ticked. `seed:content` therefore carries ids over for any lesson whose module +
chapter + title are unchanged, and prunes whatever is left dangling. Editing a
lesson **body** costs nothing; renaming a lesson, its chapter or its module
retires that lesson and its progress, which is the honest outcome. Any other
code path that rewrites `Program.modules` owes the same two steps.

### Test fixtures

`npm run seed:full` builds a complete mid-cohort world and is the fixture every
role flow is tested against. It **never deletes a User** — accounts are upserted
by email so logins survive reruns — and its randomness is seeded, so two runs
produce the same data.

- **Programmes** Kickstarter (38 lessons) · Generalist (22 lessons) — the real
  curricula, not placeholders (see below) — every lesson carrying a reading PDF,
  teacher-notes PDF and a class link.
- **Batches** one per programme, started 8 weeks ago, ending in 6 — so progress,
  overdue work and upcoming sessions all exist at once.
- **Mentors** 4. Three teach both programmes, one is Generalist-only, which is
  what makes the cross-batch RBAC refusals testable.
- **Students** 16 — 6 Kickstarter-only, 6 Generalist-only, 4 in **both** batches.
  Each batch therefore has 10.
- **Per batch** 13 sessions (9 past with attendance + recordings, 1 today,
  3 upcoming), 4 assignments + 2 projects spanning closed/overdue/open/not-yet-open,
  3 quizzes incl. an exam, 3 announcements, 5 doubt threads with mentor answers.
- Every student has graded work with feedback, quiz attempts, attendance and
  partial progress. Deliberate edge cases are pinned, not random: one student per
  batch is at 100% (certificate path), one is failing (at-risk panel), one never
  sat the exam, and some submissions sit in `NEEDS_FIXES` / `PENDING_CHECK`.

`npm run test:flows` then drives the real HTTP API as admin, mentor and student —
85 assertions covering both the happy paths and the RBAC refusals. It needs the
server running, and the API rate-limits login to 10/min/IP while the script uses
9, so leave ~60s between consecutive runs.

All seeded accounts share the password `Test@1234`; the admin keeps its own.

**[docs/TEST-ACCOUNTS.md](docs/TEST-ACCOUNTS.md) is the credentials sheet** — every
login, which batches they are in, and what state each student is in. It is
*generated* (`cd server && node scripts/dumpAccounts.mjs`) from the live database
rather than hand-written, so it cannot drift from the seed; regenerate it after
any seed change. [docs/screenshots/](docs/screenshots/) holds a verified UI pass
across all three roles.

## Architecture, briefly

- **All styling lives in one file**: [client/src/styles.css](client/src/styles.css)
  (~1900 lines). No CSS modules, no Tailwind, no styled-components, no second
  stylesheet. Components are classnames against this file.
- **Routing** is table-driven from [client/src/nav.jsx](client/src/nav.jsx):
  `navFor(role)` returns the dock tabs, `extraRoutesFor(role)` the drill-down
  routes. [App.jsx](client/src/App.jsx) maps both into `<Route>`s. Nav and
  routing cannot drift because they come from the same table.
- **RBAC is enforced twice**: server-side at the chokepoint (`requireAuth` +
  `requireRole` in [server/middleware/auth.js](server/middleware/auth.js)) and
  client-side by only mounting a role's own routes. Pages read the viewer with
  `useOutletContext()` and branch on `user.role`.
- **Every page is `lazy()`-loaded** behind the Suspense boundary in
  [AppShell.jsx](client/src/components/AppShell.jsx).
- **`api()` in [client/src/api.js](client/src/api.js) is the entire frontend↔backend
  link.** It retries network failures (not HTTP errors) and broadcasts
  `lms:blocked` so an admin block takes effect on the next request.
- **Data isolation rule**: this service touches only `lms_*` collections. The
  Atlas cluster is shared with the marketing site; never read or write `leads`,
  `orders`, or the marketing `users`.
- **Email** goes through `sendMail()` in [server/utils/email.js](server/utils/email.js)
  only — Resend (`RESEND_API_KEY`, free tier 100/day) first, SMTP second, the
  server console when neither is set. Creating an account or resetting its
  password (users and batches routes) emails the credentials on the template in
  [server/utils/emailTemplates.js](server/utils/emailTemplates.js), which is the
  [docs/email-reference-enrollment-confirmation.html](docs/email-reference-enrollment-confirmation.html) layout with LMS copy; the response carries
  `emailed` so the admin UI can say whether it went out. The mail carries no
  images and no links to the marketing site — the LMS is a separate deployment
  and its mail must not depend on menler.in being up.

### The class review

After a class ends, the next time a student opens the LMS they meet
[ClassReviewGate](client/src/components/ClassReviewGate.jsx) — a full-screen
form (rating 1–5, pace, optional comment) over the whole app, cleared only by
answering. Every student in the batch is asked, not only those marked present:
the point is a complete picture, and the row records `attended` at the moment
of writing so an opinion from someone who watched the recording reads as one.

`GET /reviews/pending` picks the oldest class whose join window has closed and
which started *after* the account was created, so a student enrolled mid-course
is not met by a wall of forms for classes they never saw.

**Mentors never see reviews** — that is what makes them honest. They live under
the admin's **Feedback** tab, filtered by batch
([routes/reviews.js](server/routes/reviews.js) is `requireRole('admin')`).

### One account, one device

A seat is one person's, and that is enforced in two independent places.

**Sessions.** Every sign-in writes a row to `lms_device_sessions` and both
tokens carry its `sid`; `requireAuth` refuses a token whose row has been
revoked, which is what makes a stateless JWT revocable at all. Signing in on a
new device closes the others, so the old one stops on its *next request* rather
than when its 8h token expires. `LMS_SINGLE_SESSION` picks the manner —
`warn` (default: 409 + "used on another device", the client offers the
takeover), `strict` (newest wins silently) or `off` (rows kept, nothing
revoked). The client sends `X-Device-Id`, a random per-browser id, so re-signing
in on the *same* browser renews its own row instead of prompting you about
yourself. A refresh whose session was revoked is refused too, or the takeover
would quietly undo itself within eight hours. Tokens minted before this existed
carry no `sid`: they are honoured and adopted into a session on their next
refresh, so shipping it was not a mass logout.

**The watch lock.** `lms_playback_leases` holds one row per user with the user
id AS the `_id`, so "only one watcher" rests on primary-key uniqueness rather
than a read-then-decide race. It is claimed where the VdoCipher OTP is minted —
the OTP is what actually unlocks the video, so a client-side check would be
advisory — and held by a 20s heartbeat against a 70s lease, so a closed lid
frees it without a student losing their place to one bad connection. Separate
from sessions on purpose: two tabs share one session, and relaxing the takeover
rule must not unlock the video.

Anything that invalidates an account (password reset or change, an admin block)
closes its sessions and drops its lease.

### Webinars

Masterclasses, scheduled by an admin and open to **everyone** — they carry no
batch, because a guest session is worth the same to either cohort. All three
roles share [pages/mentor/Webinar.jsx](client/src/pages/mentor/Webinar.jsx);
only the scheduling form is gated on `role === 'admin'`. The page splits
upcoming from past, since a learner arrives asking "what's next and how do I
get in", not "what happened in July".

Scheduling one notifies every student and mentor, and so does the **recording**
appearing — the one edit worth interrupting people for, and only on the
transition from absent to present, so re-saving a link stays silent. Nothing
else about an edit notifies. Before this the webinar existed only for whoever
thought to open the tab, and students had no tab at all.

### Doubt sessions

An admin announces one from the **Doubts** tab: a programme, which of its
cohorts, a date, a window (7–10 pm in 30-minute slots by default) and the
write-up. That pushes an in-app notification to every invited student pointing
at `/app/doubt-session`, where they give a name, pick a slot and say what they
want cleared. The booked sheet — every slot, the free ones included — is on the
same admin tab, with the question each student wrote.

**The push is never automatic.** There is no recurring rule that fires every
Wednesday by itself: a notification nobody chose to send is one that goes out
the week the session was cancelled, and students stop reading the bell after
the second of those. **Push again** sends a reminder, and every push is counted.

**One student per slot rests on a unique index**, not on a check
([models/DoubtBooking.js](server/models/DoubtBooking.js): unique
`{sessionId, slotAt}` and `{sessionId, studentId}`). Two students tapping 7:30
in the same second both read it as free — only the index can settle it. The
loser gets a 409 carrying the *refreshed* grid, so they pick again from what is
actually free rather than from what was free when the page loaded. The second
index makes a booking MOVE in place instead of accumulating, so nobody quietly
holds three slots of a six-slot evening. Same reasoning as the playback lease.

A taken slot shows the student only the word "Taken". Who booked 7:30 is the
admin's business; a public register of who has doubts is how you stop people
admitting they have any. The client resolves the slot instants, because
"Wednesday, 7 to 10" is a fact about the admin's calendar, not the server's UTC
clock. Cancelling a session pulls it from every student's view but keeps the
bookings as a record of what had been asked.

### Classes and attendance

Admins schedule classes per batch — one at a time, or a whole cohort through
**Schedule the whole course** (`POST /sessions/bulk`), which titles them from
the curriculum (`GET /sessions/outline`: a Kickstarter module is a session, a
Generalist week's `S1 · Week N` chapters are its two). `weeks` in the same
response is one title per module, for the Generalist's single four-hour class
per week (6 classes, not 12). The client computes the dates because "Saturdays
7 pm" is a local-timezone fact.

The Home live-class card (`GET /sessions/live`, mirrored client-side on the
mentor Home) shows today's class with its Zoom link, else the next class with
no link until its day, else the last class with its **recording** only — never
a past class's Zoom link, which on a recurring meeting is the next class's room.

[utils/sessionTime.js](server/utils/sessionTime.js) defines when a class is
"on" — 15 min before start to 1 h after end, 4 h assumed when there is no end
— and all three sources of **present** use it: the LMS Join button, the Zoom
webhook, the mentor's register. Each class usually has its own Zoom link (set
per row in the bulk form, or later with **Edit** on the session), but a course
can also run on one recurring meeting — so the webhook matches a join to the
session on at `join_time` in a batch the student is in, never to the meeting
id alone. Changing a session's link re-derives its meeting id, even if the
form echoes the old one back.

Attendance % is present ÷ records, so a no-show with no record would not count
against anyone. [utils/attendanceSweep.js](server/utils/attendanceSweep.js)
runs at boot and every 5 min: once a class's window closes it writes `absent`
(`$setOnInsert`, never overwriting) for every enrolled student without a
record, then stamps `absenceSweptAt`. It skips students whose account postdates
the class, and a class **entered after it ended** marks nobody — nobody could
have joined it through the LMS. Removing a session removes its attendance. `npm run test:flows` covers the
takeover, the revoked refresh, and the lease; it signs in with `force: true`
because an automated client taking the account over should say so.

---

