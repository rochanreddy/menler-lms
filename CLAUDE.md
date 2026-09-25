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
cd server && node scripts/liftCurriculumEbooks.js          # dry run; --apply to move ebooks
                               # copied onto every lesson up to the week/session
                               # they cover (needs CONFIRM_DB to apply)
cd server && node scripts/syncCurriculumAssignments.js     # dry run; --apply to write
                               # puts a curriculum's work into every one of its batches'
                               # Assignments & Projects tab: Generalist 6 weekly
                               # assignments + 4 milestone projects, Kickstarter 17
                               # session assignments + 4 portfolio projects. Name one
                               # programme to limit it. Idempotent; sets no dates.
cd server && node scripts/addMasterclassRecordings.js       # dry run; --apply to write
                               # the four recorded masterclasses onto the Webinars
                               # tab as past rows with their Drive recording, and
                               # notifies students (only students). Idempotent on
                               # the title (needs CONFIRM_DB to apply).
cd server && npm run test:flows # drives all three roles against a RUNNING server
cd server && npm run test:rubric # the grading rubric's arithmetic, the curriculum
                               # classifier, the link checker's refusals and the
                               # duplicate detector. No network, no DB, no API key.
cd server && npm run calibrate  # does the rubric agree with the mentors? Compares
                               # every submission that has BOTH an AI review and a
                               # mentor grade. Read-only.
cd server && npm run test:quality # does the model separate strong work from
                               # fluent filler? Needs GEMINI_API_KEY. Pass model
                               # ids to compare two.
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

**Ebooks attach to the week or the session, not to each lesson.** Reading
material and teacher notes have a slot on the module, on the chapter and on
the lesson ([models/Program.js](server/models/Program.js)), and a lesson
resolves **lesson → chapter → module**. The books are organised that way — one
per week, or one per week+session — so the admin attaches a book once, on the
week or session row (the book icon in the curriculum editor), and every lesson
under it opens it. A lesson's own slot is for the rare lesson that needs a
different file; the editor says when a lesson is already covered from above.
Before this the ebook was copied onto every lesson, which put nothing against
the week or session in the admin panel and, worse, would have hidden a
per-session book behind the week-wide copy on each lesson.
`node scripts/liftCurriculumEbooks.js` (dry run; `--apply` with `CONFIRM_DB`)
moves those copies up on a live database; `seed:content` does the same on every
run (`liftSharedMedia`).

**Mentors push notes, they do not edit the tree.** Next to the single
`notesUrl` slot, every week, session and lesson carries a `materials`
list (`{url, name, kind, addedBy, addedAt}`, `kind` = `notes` | `resource`:
the deck versus a notice or template — the mentor says which at upload, and
the student's list is split on it). A mentor reaches it from Programs →
**Add teacher notes** ([MaterialsManager](client/src/components/MaterialsManager.jsx)):
the course as one row per class — a module, which is a Kickstarter session
(`S01 · …`) or a Generalist week (one four-hour class a week, so no row per
S1/S2 chapter) — because a mentor teaches a class in one sitting and a row
per lesson made forty drop targets of a four-session course. Drop several PDFs
on a row, each drop saved at once
through `POST /programs/:id/materials` (multipart `files[]` + `moduleId` /
`chapterId` / `topicId`, or `url`+`name` for a link) and taken down with
`DELETE /programs/:id/materials/:mid`. Both need `canEditProgram`, both go
through the same hash-deduped store as the editor's single drop, and every
upload is checked for the `%PDF-` header, not just its declared type. The
full curriculum editor is still there for the admin, with the same list on
each node as **More teacher notes**, saved with the tree. `seed:content`
carries `materials` across a re-author the way it carries the ebook.
`tierNames()` in [features.js](client/src/features.js) decides what the two
levels are called on screen: a Kickstarter module (`S01 · …`) is a *session*
of *parts*, a Generalist module is a *week* of *sessions*.

The student's **Teacher notes** chip lists everything at once — the
resolved `notesUrl`, then the lesson's, the session's and the week's
materials, deduped on url ([ReadingPicker](client/src/components/ReadingPicker.jsx)).
**Reading material** stays the admin's ebook alone: the ebook is the course,
the notes are what the mentor put up after class, and the two chips must not
blur into one list. An **assignment** — Kickstarter's `Assignment: …` lesson
(`isAssignmentLesson()`) or Generalist's `Weekly assignment: …` chapter
(`isAssignmentChapter()`) — lists only its own notes: its reading is the
brief and its notes the solution book, not the session's deck. The mentor's
page shows no row for an assignment chapter for the same reason.
One item opens straight into the reader; more than one opens the list; a
link that is not a PDF opens in a new tab rather than as a blank box in
the PDF reader. That list is the promise the mentor's page makes ("a file
for the whole week goes on the week"), so it must not be narrowed to the
lesson's own files.

**On a piece of work the two chips are called something else.** A
student opening an assignment is not looking for reading material and
teacher notes; they are looking for the brief they are marked against and
the solution book. So `materialLabels()` in [features.js](client/src/features.js)
renames the pair — **Assignment brief** / **Solution brief**, or **Project
brief** / **Project solution** — off `workKind()`, which reads the node
title (Kickstarter's `Assignment: …` and `P01 · …` lessons, Generalist's
`Weekly Assignment: …` and `Milestone Project N · …` chapters). Only the
words change: the same two slots, the same store, the same reader.

Renaming forces the resolution to be right, and it was not. A lesson
resolves lesson → chapter → module, so an assignment with an empty slot
showed the WEEK's ebook — harmless while it said "Reading material",
a lie the moment it says "Assignment brief". **A piece of work therefore
never resolves upwards**: its own file, plus the chapter's where the
chapter IS the work, and otherwise nothing. `No brief yet` is the honest
answer, and the four Kickstarter portfolio projects give it, because
`CURRICULUM_PDF_RULES` has no file for them. The same reasoning already
kept the session's materials off an assignment; projects are now in that
exception too.

**The same two chips are on the Assignments & Projects tab.** The brief
and the solution book are attached to the *curriculum* node while the
thing a student submits against is an `Assignment` row, which is per batch
and carries no media — so the brief was three clicks away in Learning →
Content from the tab where the work is handed in.
[utils/workMaterials.js](server/utils/workMaterials.js) closes that: it
matches an Assignment to its curriculum node **by title** — which is what
`syncCurriculumAssignments.js` matches on, so the two cannot disagree —
and hangs `briefUrl`, `solutionUrl` and `materials` on the row as it goes
out. Resolved at read time, never copied onto the row: the media is the
admin's and changes in the curriculum editor whenever they like, and a
snapshot would go stale without anyone re-running a script. A card with
neither shows no chips at all — unlike the reader, where the chips are the
lesson's only furniture, the brief is written out on the card regardless,
and a permanently dead pair of chips teaches people to ignore chips.

[server/assets/curriculum-pdfs/](server/assets/curriculum-pdfs/) holds the
ebooks that ship with the repo, committed so a seed is reproducible off one
laptop. `CURRICULUM_PDF_RULES` in
[curriculumPdfAssets.js](server/utils/curriculumPdfAssets.js) maps a module
title prefix — optionally a session or a lesson prefix inside it — to its PDF;
the seed loads each into Mongo once (keyed on the content hash, so re-seeding
never duplicates a blob or moves a URL) and attaches it there if the slot is
empty. A lesson rule carries two files: the one-page assignment brief as
reading material and the solution book as teacher notes (Kickstarter has one
per session, on every `Assignment:` lesson of that session). A rule-mapped file lives
only where its rule puts it — a copy anywhere else is cleared — while files no
rule knows about are never touched. Nodes with no rule keep an empty slot,
which the lesson UI renders honestly as "No reading yet".

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

### Programme names

The programmes read **AI Kickstarter** and **AI Generalist** on every screen,
and that text is data: `Program.title`, and the batch names built from it
("AI Kickstarter · Sept 2026"). A rename is therefore
`node scripts/renameProgrammes.js` (dry run; `--apply` with `CONFIRM_DB`),
not a UI change. Every lookup by title in the seeds goes through
`titleQuery()` in [utils/programmes.js](server/utils/programmes.js), which
matches the bare "Kickstarter" a database seeded before the rename still
carries — otherwise a seed on such a database would create a second
programme beside the first. Issued certificates keep the title they were
issued with.

### Test fixtures

`npm run seed:full` builds a complete mid-cohort world and is the fixture every
role flow is tested against. It **never deletes a User** — accounts are upserted
by email so logins survive reruns — and its randomness is seeded, so two runs
produce the same data.

- **Programmes** AI Kickstarter (38 lessons) · AI Generalist (22 lessons) — the real
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
- **Support** 3 tickets across the desk — one waiting on the team, one answered,
  one resolved — so each state is on screen without a wall of invented
  complaints burying what the screen is meant to show.
- Every student has graded work with feedback, quiz attempts, attendance and
  partial progress. Deliberate edge cases are pinned, not random: one student per
  batch is at 100% (certificate path), one is failing (at-risk panel), one never
  sat the exam, and some submissions sit in `NEEDS_FIXES` / `PENDING_CHECK`.

`npm run test:flows` then drives the real HTTP API as admin, mentor and student —
120 assertions covering both the happy paths and the RBAC refusals. It needs the
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

**A mentor sees their own classes' reviews, never a name.** The admin's
**Feedback** tab and the mentor's are the same page
([pages/admin/Feedback.jsx](client/src/pages/admin/Feedback.jsx), branching on
the viewer's role); `GET /reviews` serves an admin everything and a mentor only
the batches they are assigned to, with the student's name and email stripped.
Session carries no mentor, so the batch is the link — two mentors on one batch
share its feedback. The anonymity is what is left of the older rule that
mentors saw none of this: a mentor cannot improve without reading their own
scores, and a student who thinks their mentor can see their name writes the
review they think is safe. A batch id typed into the query string is
intersected with the mentor's own batches, so it widens nothing.

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

**The watch lock is dormant.** It is claimed where the VdoCipher OTP is minted,
and VdoCipher is currently switched off (see below), so nothing claims a lease
today. All of it still works and comes back with the flag.

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

### Lesson video: Drive links, not VdoCipher

`VDOCIPHER_ENABLED` in [client/src/features.js](client/src/features.js) is
**false**. Nothing is deleted — the player, the library picker, the per-batch
`BatchLessonVideo` mapping, the OTP endpoint and the watch lock are all still
there and all still tested — because "we're on Drive for now" is a commercial
decision that can reverse, and deleting a working integration to get it off the
screen means rebuilding it from git history later. `VITE_VDOCIPHER_ENABLED=true`
brings it back.

While it is off, a lesson's video is a link a mentor pastes: the lesson's own
**Lesson video** field, or the **Class link** (the recording of the live
session). The student's video chip lights for either, because nobody cares
which box it was typed into, and opens it in a new tab.

A Drive share link is an HTML page, not a media file, so it must never reach a
`<video src>` — that renders a black box and a decode error.
`isDirectVideoFile()` is what decides: real media files (`.mp4`, `.webm`, …)
play inline, everything on Drive/YouTube/Loom/Dropbox gets a hand-off card that
says where it is about to send you. Drive is deliberately not iframed either;
that breaks the moment the folder's sharing changes.

The failure mode to know about: a Drive link works for the admin who uploaded
it and silently shows everyone else a request-access screen. The sharing has to
be **Anyone with the link → Viewer**, which the editor says next to the field.

### Forgotten passwords

Three steps on the login page itself: `POST /auth/forgot` mails a six-digit
code, `POST /auth/verify-otp` trades a correct code for a one-time ticket, and
`POST /auth/reset` spends the ticket. **The code is emailed; the ticket never
is** — six digits is only safe while it is short-lived and guess-limited, so
all it buys is a proper 256-bit token, which is what authorises the change.

Codes are stored as salted hashes and compared in constant time; five wrong
guesses burn the code, counted on the **account** so spreading the guessing
around buys no more of them; `/forgot` is limited per recipient as well as per
IP, or one IP limit still allows mail-bombing one person. A wrong code and an
address with no account get the identical reply, so this never becomes the
enumeration oracle `/forgot` deliberately isn't. Asking for a new code voids
any ticket already issued, and a reset clears `mustChangePassword` — they just
chose their own password.

**The mail carries no link and no button**, which is why `shell()` treats `cta`
as optional. A password-reset email is the most impersonated message there is,
and one that never asks you to click anything cannot train its readers to click.

### Webinars

Masterclasses, scheduled by an admin and open to **everyone** — they carry no
batch, because a guest session is worth the same to either cohort. All three
roles share [pages/mentor/Webinar.jsx](client/src/pages/mentor/Webinar.jsx);
only the scheduling form is gated on `role === 'admin'`. The page splits
upcoming from past, since a learner arrives asking "what's next and how do I
get in", not "what happened in July".

**The whole row is the link.** A masterclass card has one obvious purpose —
join it while it is ahead of you, watch it once it is behind you — so the card
opens that one thing wherever you click it, rather than making you hit a word
on the far right. It is a real `<a href>` stretched across the panel by an
overlay (`.row-link` / `.list-row.is-linked` in
[styles.css](client/src/styles.css)), not a div with a click handler, so
middle-click, ⌘-click, "copy link address" and the focus ring all still work.
A second action (Slides next to a recording) is raised above the overlay and
keeps its own click.

Scheduling one notifies **every student and nobody else**, and so does the
**recording** appearing — the one edit worth interrupting people for, and only
on the transition from absent to present, so re-saving a link stays silent.
Nothing else about an edit notifies. Before this the webinar existed only for
whoever thought to open the tab, and students had no tab at all. Mentors and
admins read the same list on the same tab; what they do not get is the bell. A
mentor hears about a masterclass from the admin who booked it, and a push they
did not need is what teaches them to stop reading the ones they did — so
`audience()` in [routes/webinars.js](server/routes/webinars.js) is students
alone, with no batch filter, because a masterclass has no batch.

**The four recorded masterclasses are an archive, not a schedule.** They ran
before the LMS existed, so there is nothing to book — only past rows carrying
their Drive recording, which is what "Past masterclasses" is for.
`node scripts/addMasterclassRecordings.js` (dry run; `--apply` with
`CONFIRM_DB`) puts them in, matched on title so a re-run adds nothing and
notifies nobody, and sends students **one** notification for the batch rather
than one per recording. The recordings live in the team Drive folder shared
*Anyone with the link → Viewer*; a Drive link shared any other way works for
the admin who uploaded it and silently shows every student a request-access
screen. Their dates are the day the recordings were filed, an hour apart so the
archive has a stable order — change them in the script and re-run if the real
session dates turn up.

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

**The meeting link is per booking, not per session.** A slot is one student
in the room, so the admin makes the Meet *after* they can see who booked it
and sends it on that student's row of the booked sheet
(`PATCH /doubt-sessions/:id/bookings/:bookingId`, admin only). It notifies
that student and nobody else, it can be re-sent, and `notify: false` fixes a
typo quietly. The create form's `joinUrl` is still there for an evening that
runs on one shared room — it is announced to the whole cohort before anyone
has booked, which is exactly why it cannot be the one-to-one link. The link
lives on the booking, so a student who moves from 7:30 to 8:00 keeps it, and
the student's page prefers their own over the session's.

**Closing the booking is not cancelling the session.** Once the admin has
the sheet they are going to make the Meets from, **Close booking** on the
session card freezes it (`bookingsClosedAt`, set through `PATCH
/doubt-sessions/:id` with `bookingsClosed`): no new slot is claimed and no
booking moves, while the evening stays on and everyone who booked keeps
their slot, their question and their link. Cancelling, by contrast, pulls
the whole thing from every student's view. It is a flag rather than an
emptying of `slotsAt`, because a closed session must still show a booked
student their own slot, and **Reopen booking** answers "fit one more in"
without re-announcing anything. Giving a slot back outlives the close — a
freed slot is something the mentor can act on, where holding someone to a
slot they cannot attend only buys an empty chair nobody was warned about —
and the student's page says before they press it that it is one-way.

A taken slot shows the student only the word "Taken". Who booked 7:30 is the
admin's business; a public register of who has doubts is how you stop people
admitting they have any. The client resolves the slot instants, because
"Wednesday, 7 to 10" is a fact about the admin's calendar, not the server's UTC
clock. Cancelling a session pulls it from every student's view but keeps the
bookings as a record of what had been asked.

### Support

A student reports something broken — a dead link, a login that won't hold, a
wrong receipt — and an admin answers it. A **thread**, not a form: the answer
to "I can't open the recording" is usually a question, and a ticket that cannot
hold the second message pushes the conversation onto WhatsApp where nobody else
can see it.

Deliberately not the Forum. A doubt about the course belongs to the cohort; a
problem with your own account, your payment or your access belongs to you and
the admin, and a public board is where people stop reporting them. Mentors see
none of it — [routes/support.js](server/routes/support.js) is `requireRole('admin')`
on the desk, and a mentor cannot read, reply or close.

**Where it lives is the whole design question.** The student dock is six tabs
and they are all used weekly; support is used the day something breaks. So it
is *not* a tab — it sits in the account menu next to "Change password" (where
people look for help), in ⌘K, and on the notification that a reply has landed.
The admin's side *is* a tab, next to Doubts, because for an admin the queue is
the job. See `extraRoutesFor('student')` in [client/src/nav.jsx](client/src/nav.jsx).

`status` is derived from who spoke last, never set by hand: admin last →
`answered`, student last → `open`, and `resolved` only when an admin closes it.
A student reply reopens a resolved ticket, because "that didn't work" must not
land in a closed folder. The admin's queue therefore cannot disagree with the
thread, and it defaults to *everything* rather than to the open ones — a ticket
answered last week and never followed up is the one most likely to have been
dropped, and a queue that hides it is how it stays dropped.

Both sides are told: raising a ticket notifies every admin, a reply notifies
the other party, and resolving notifies the student — from their side a ticket
that was settled and one that went quiet look identical. New tickets are capped
at ten an hour per student: not a security control (support is the one place a
person in trouble is *meant* to be able to shout) but a jammed submit button
fires forty in a second.

### Mail

An admin writes a mail once, picks the batches it goes to, and says when —
one time, or several in the same day. The **Mail** tab
([pages/admin/Mail.jsx](client/src/pages/admin/Mail.jsx)) is two panes:
compose, and what is scheduled or sent. Admin only, end to end —
[routes/mail.js](server/routes/mail.js) is `requireRole('admin')` on
everything; a mentor reaches students through the classroom, not a mailer.

**The admin owns the subject and the body. Nothing else.** The body includes
the greeting: there is no automatic "Dear <first name>," on these mails,
because a cohort mail opens "Hi all," and the shell's greeting stacked on top
read as two (and the preview, rendered for the admin, said "Dear Menler,").
`{{first_name}}` is there for a mail that wants one. The banner, the help
line, the signature and the footer are the same shell every account mail is on (`shell()` in
[emailTemplates.js](server/utils/emailTemplates.js), via `broadcastEmail()`),
so a reminder typed on a hurried Friday still reads as the company that sent
the welcome mail. The body is plain text: blank lines split paragraphs, a bare
URL becomes a link, and markup is escaped rather than honoured, because an
admin pasting from a doc is how a mail ships with half a table in it.
`{{first_name}}`, `{{name}}`, `{{email}}`, `{{batch}}` and
`{{programme}}` (`PLACEHOLDERS` in
[utils/mailCampaigns.js](server/utils/mailCampaigns.js)) are filled per
recipient; `{{batch}}` is the batch the mail was *sent through*, so a student
in both cohorts picked via Kickstarter reads "Kickstarter". There are no
saved templates on purpose: **Reuse** on any past mail refills the form,
which is the whole of what a template did without a second list to tend.
Three worked examples (`EXAMPLES` in Mail.jsx) fill the form so a first test
needs no writing; they live in the client, not the database.

**One row per send time.** A compose with three times is three
`MailCampaign` rows with the same copy (`POST /mail/campaigns` takes
`sendAts[]`, up to twelve, deduped and sorted). Each has its own status and
counts, so "the 9 am one went, the 6 pm one is waiting" is a fact the list
shows, and each can be reworded, sent early or cancelled on its own.

**The row is the schedule.** There is no timer object: `startMailScheduler()`
wakes every minute (and at boot, so a Render instance that slept through a
send time sends the moment it wakes) and claims any `scheduled` row whose
`sendAt` has passed with one atomic status flip to `sending`. Two instances,
or a restart mid-run, cannot send a campaign twice. A row still `sending`
thirty minutes on was interrupted and is closed as `failed` with a note
rather than re-run — whoever was reached was reached, and running it again
would double them up. "Send now" and anything due inside thirty seconds run
in the request itself, so *now* means now. `sendAt` is resolved on the
admin's own clock and sent as an instant, like classes and doubt sessions.

The audience is resolved **at send time**, not at scheduling: a student
enrolled tonight gets Friday's mail. It skips accounts blocked from the LMS
and students blocked from that batch, and a student in two picked batches is
one person and gets one mail. The compose form shows the same count through
`GET /mail/audience`. Sends are paced at 600 ms apart on Resend, whose free
tier refuses more than two requests a second and caps at 100 mails a day —
the form says so past ninety recipients, and it counts every time picked,
since three sends to thirty students is ninety mails. A **test** goes to any
address the admin types, remembered in the browser (ten an hour), and the **preview** renders the real shell
in a sandboxed iframe, so the placeholders are checked before, not after.

**Attachments** upload the moment they are picked (`POST /mail/attachments`,
multipart `files[]`) and the campaign keeps only `{fileId, name, size}`, so a
mail scheduled for Friday carries its files without anyone's browser staying
open. The bytes are `FileAsset` rows of kind `mail-attachment`, hash-deduped
like course PDFs and readable by an admin only. Up to five files and **10 MB
together**, because every recipient gets every byte and Resend refuses a
message over 40 MB after base64. PDFs, Office files, images, CSV, text, Markdown and zip
only, and a `.pdf` must carry the `%PDF-` header. Every file is loaded once per
run and sent to everyone; one that has gone missing **fails the run** rather
than sending a mail that says "attached" and isn't. Removing a campaign, or
dropping a file on edit, deletes the stored file unless another campaign (a
Reuse) still points at it, and the scheduler clears unsent uploads older than
a day once an hour.

A scheduled mail can be edited, sent early or cancelled; a sent, failed or
cancelled one is history and can only be reused (which refills the form) or
removed. The per-address failures are kept on the row and listed on the card.

### Jobs

A **Jobs** tab for students and admins ([pages/Jobs.jsx](client/src/pages/Jobs.jsx));
mentors get none. It reads the feed skeo-job-pipeline scrapes every morning,
on the pipeline's **own** Atlas cluster through a second, read-only
connection ([jobsDb.js](server/jobsDb.js), `JOBS_MONGODB_URI`). The LMS still
only touches `lms_*` on its own cluster: the feed is not ours, and hand-posted
openings live in `lms_job_postings` instead, so a bug here cannot damage data
Skeo also reads. Unset, the tab shows hand-posted openings and says the feed
is not connected; nothing else is affected.

**It is 300 jobs, not the feed.** The feed holds ~25,000 live listings; Skeo
shows all of them. Menler shows the 300 that best fit what it teaches, fifty
a page, and every filter narrows *within* the 300 rather than reaching back
into the rest. [utils/jobShortlist.js](server/utils/jobShortlist.js) picks them:

- **Syllabus first.** The pipeline stores four scores per job. Skeo sorts on
  its rankScore, which weights relevance last (0.12) and so ranks an
  entry-level customer-service walk-in above an AI automation role. Menler
  recombines the same four with relevance at 0.45. Nothing is recomputed from
  text, so it can never disagree with the pipeline about a posting.
- **Gates, then exclusions.** Relevance ≥ 30, indiaFit ≥ 40, achievability ≥
  30 and at least one syllabus term matched: ~856 of 25,000 pass, so the 300
  are picked from nearly three times as many. Then out go titles needing a
  foreign language ("Spanish Search Quality Rater"), titles that are only a
  topic ("generative AI"), and non-Indian roles whose location names a place
  (`isTiedAbroad`). That last one mattered most: 61 of the first 300 were
  "remote" with a location of "Portland, OR, US" or "Hong Kong, Singapore,
  Taiwan", which the pipeline scores as remote-unstated. An abroad role now
  counts as open only when its location says "Remote", "Anywhere" or
  "Worldwide" and nothing else; "Remote, US" does not pass.
- **De-duplicated and capped.** The same title at the same employer is one
  job, kept at its best score. At most five per employer, with all unnamed
  employers sharing one cap, because the raw top 300 gave 45 slots to listings
  naming no employer. Those also lose eight points: a student cannot check who
  they would work for, so one should not open the board.

Measured after all of it: 296 of 300 in India, every one with an http(s)
apply link, page one entirely named Indian employers. `npm run test:jobs`
covers every rule without a network or database.

The shortlist is cached for ten minutes: the feed changes once a day, and a
student paging through six pages should see one consistent list. The admin's
hand-posted openings lead page one and **count toward the 300**. Each card
says why it made the list (`rankReasons`), and its Apply button is the
card's `row-link`, so the whole card opens the posting. Only http(s) is ever
rendered as an href or an `<img src>`, and `POST /jobs` refuses any other
apply link: these strings come from eleven third-party sources and a form.

### Grading a submission

A mentor opens a verified submission and presses **Run AI review**. Everything
it produces is **advisory**: nothing writes to `Submission.score`, `.feedback`
or `.status`, and the only button on the panel fills the mentor's own form. The
student is never shown it and is never notified — a verdict comes from their
mentor, not a model. Full reasoning in
[docs/AI-GRADING-RUBRIC.md](docs/AI-GRADING-RUBRIC.md).

**Text and photos are evaluated; nothing else.** Documents, Claude Artifacts,
HTML, PDFs and photos are read. Audio and slide decks are listed in the manifest
for the mentor and never assessed. There are no late penalties: a due date is an
admin fact, not a quality judgement.

**Video is never graded.** Documents, Claude Artifacts, HTML, PDFs and photos
are read; a video is listed in the manifest for the mentor to watch and verify,
and its absence is never held against a student. It is still *required* where a
brief actually asks for one (Week 4, Kickstarter 4.2, P04) — required to submit,
not read by a model. Before this the schema default demanded a video of every
assignment, so a perfect Artifact-and-screenshot folder was rejected as
incomplete.

**One rubric, six criteria, five weightings.** Twenty-seven pieces of work
across the two curricula cannot share one distribution: "AI Audit" is a
hundred-word Discord post and the Generalist capstone is a shipped product.
So [utils/rubric.js](server/utils/rubric.js) fixes six criteria that never
change — brief compliance, evidence of real work, AI craft, reasoning,
artefact quality, outcome and transfer — and an assignment's `rubricClass`
(A Drill · B Artefact · C System · D Creative · E Capstone) says how they are
weighted. A mentor reads the same six rows all term. Weights are asserted to
sum to 100 at import, because a weighting that does not silently rescales every
grade in its class.

**C1 is scored against a list, not against prose.** Every curriculum brief ends
in a `Submit:` line; `scripts/syncCurriculumAssignments.js` splits it into
`Assignment.deliverables` and the rubric checks against that. "Is the Prompt
Cheat Sheet here" is checkable; "is it complete" is an opinion. This is the
largest accuracy gain in the review and it needs no better model. Where a brief
gives prose rather than a list (the four Generalist milestones), **nothing is
derived** — splitting prose produced checklist rows like "or product idea", and
a wrong checklist marks a student down for a deliverable that was never asked
for.

**Arithmetic lives in JS, never in the prompt.** The model returns six 1-5
judgements and nothing else; totals, weights, the band and the letter grade are
derived in `scoreSubmission()`. A criterion whose evidence could not be read
leaves **both sides** of the weighted average rather than scoring zero, and the
mentor is told which and why.

**A failure on our side never costs a student marks.** If the image model
cannot be reached, the criteria that rested on those images are **credited** at
4/5 and labelled "credited, not assessed"
([`CREDITED_SCORE`](server/utils/rubric.js)) rather than scored low or dropped.
Not 5: a silent 5 is indistinguishable from one that was earned, and the mentor
would have no way to know the work was never looked at. Where images were the
*whole* submission (4.4 is "Submit: screenshot of your headline and About
section"), all six are credited.

**Links are checked, and "unreachable" is not "dead".**
[utils/urlCheck.js](server/utils/urlCheck.js) tries every web address in a
submission, which matters because four Class E assignments turn on a working
public URL and nothing used to open them. Only a hard 404, a 410 or a
non-existent domain counts as dead; a 401, 403, 429 or timeout is reported as
"could not be checked, please open it yourself", and the prompt says outright
never to mark a student down for it. Getting that backwards fails students for
our own user agent. Private, loopback and cloud-metadata addresses are refused
before any fetch, because a write-up is untrusted text running on our server.

**Duplicates are measured, never scored.**
[utils/similarity.js](server/utils/similarity.js) keeps a MinHash sketch on
each submission and compares it against the others on the same assignment. A
match raises a red flag naming the other student and the overlap, and moves no
number, because collusion is something a mentor establishes. The assignment
brief's own wording is subtracted from every sketch first, or a cohort all
quoting the same four sentences would read as a cohort all copying each other.

**The weights are a guess until `npm run calibrate` says otherwise.** They came
from reading the two curricula, not from data. Every submission already carries
the mentor's score and the rubric's side by side; the script compares them and
breaks the bias down by rubric class, because a class *is* a weighting and a
class out of line with the rest is a one-line fix.

**One model, one call, no fallback.** Gemini Flash-Lite through Google's
OpenAI-compatible endpoint (`GEMINI_API_KEY`, free key at
aistudio.google.com/apikey), in [utils/aiProvider.js](server/utils/aiProvider.js).
There is no provider abstraction and that is deliberate: it existed for Sarvam,
whose text model `sarvam-105b` is blind and whose only seeing model was a
whitelisted beta the account never got, on a different endpoint. That forced
three calls, two clients and two base URLs. Flash-Lite reads a write-up and its
screenshots in the SAME request, so all of it collapsed. Switching vendors again
is a base URL, a key and a model id, which is cheaper to do when needed than to
carry a second code path nobody exercises.

**Flash-Lite, not Flash**, and it is not only about cost. Google's free tier
rations by REQUESTS per day, roughly 500 for Flash-Lite against roughly 20 for
Flash, and one review is one request; quotas reset at midnight Pacific, which is
12:30 pm IST, and are per *project*, so extra keys in the same project add
nothing. But `npm run test:quality` also found Flash-Lite **grades better here**:
a 64-point gap between real work and fluent filler against full Flash's 45, in
3.6s against 25s. The smaller model was not a compromise.

**The model id is `gemini-3.5-flash-lite`** and the 2.5 ids are already retired
for new keys: Google answers `gemini-2.5-flash-lite` with a 404 naming its
replacement. Expect to move again; that is what `AI_MODEL` is for.

**A Gemini key beginning `AQ.` is not interchangeable with an `AIza` one.**
It authenticates as `Authorization: Bearer` on the OpenAI-compatible endpoint
this code uses, but the NATIVE endpoint refuses it as Bearer and takes it only
as a `?key=` query parameter. Nothing here is affected; anything written against
the native Gemini SDK would be.

**Why the pipeline is one call.** It was three. A separate VISION call, because
the old provider's text model could not see. A separate NARRATIVE call, so the
prose would be written against settled numbers, which re-sent the whole rubric
result as input to produce four sentences, for about a third of the cost of
every review. The prose must not quote a score anyway (totals are computed after
the model replies, and the prompt forbids naming one), so there was nothing to
settle first. One call is three times cheaper, three times faster, triples what
the free tier covers, and has two outcomes instead of eight. `temperature: 0`,
because a grader that varies run to run is one a mentor cannot calibrate
against.

**Before trusting a model, check it can TELL GOOD WORK FROM BAD.**
`npm run test:quality` runs three fixture submissions for one assignment through
the real prompt and the real arithmetic: STRONG (real numbers, quoted prompts, a
reversal), THIN (fluent, complete, and empty of anything only one student could
have written) and COPIED (the brief pasted back). The number that matters is
STRONG minus THIN; anyone catches a pasted brief. Under about 10 points means
the model is pattern-matching "assignment" and returning the average, which
looks like it works and tells a mentor nothing. Every other check in this repo
only proves a model REPLIES.

Two traps that script fell into itself, both fixed, both worth knowing if it is
ever extended. **20/100 is the floor**, six criteria at 1 out of 5, so when both
weak fixtures land there a zero gap between them is the grader agreeing they are
both failing, not a grader that cannot tell them apart; requiring a numeric gap
there reported a good model as marginal. And **"insufficient content" was firing
on work that was merely empty**: the flag now means genuinely too short, roughly
under 75 words, because telling a student who wrote three paragraphs that there
was too little to assess is obviously untrue to them and discredits the rest of
the feedback.

**`allowHtml` is not `requiredDriveTypes: ['html']`.** Six Kickstarter
assignments name a Claude Artifact as the deliverable, and it arrives as an
`.html` file about as often as a PDF export. The two used to be one flag, so
accepting an artifact made the `.html` mandatory and rejected the PDF.

### Classes and attendance

Admins schedule classes per batch — one at a time, or a whole cohort through
**Schedule the whole course** (`POST /sessions/bulk`), which titles them from
the curriculum (`GET /sessions/outline`: a Kickstarter module is a session, a
Generalist week's `S1 · Week N` chapters are its two). `weeks` in the same
response is one title per module, for the Generalist's single four-hour class
per week (6 classes, not 12). The client computes the dates because "Saturdays
7 pm" is a local-timezone fact.

The Home live-class card (`GET /sessions/live`, which the mentor Home now calls
too rather than keeping a second copy of the rule) shows the class that is **on
now** with its Zoom link, else the next class with no link until its window
opens, else the last class with its **recording** only — never a past class's
Zoom link, which on a recurring meeting is the next class's room.

"Live" is a window, not a calendar day. It used to mean "starts today", so a
7 pm class put a green Join button on Home from midnight and left it there
until midnight again — a button that is live all day teaches students it means
nothing in particular. The response carries `opensAt`/`closesAt` so the page
flips at the boundary without a reload, and the localStorage cache is discarded
once its window has passed.

[utils/sessionTime.js](server/utils/sessionTime.js) defines when a class is
"on" — **5 min before start to 5 min after end**, 4 h assumed when there is no
end — and all three sources of **present** use it: the LMS Join button, the Zoom
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
have joined it through the LMS. Removing a session removes its attendance.

[utils/sessionReminders.js](server/utils/sessionReminders.js) mails the cohort
twice per class — about an hour ahead, and as it starts — on a **1-minute**
tick with **no boot run**. Mail is not idempotent like the absence sweep's
upserts, so each reminder is *claimed* with `findOneAndUpdate` on a still-null
`remindedHourAt`/`remindedStartAt` **before** it sends: a crash costs a missed
reminder, never a duplicate blast, and two instances produce one winner. Both
windows are bounded on the late side (45–60 min ahead; 0–10 min after the
start), which is what makes the first tick after a deploy a catch-up rather
than a mailshot about classes that already ran. The arithmetic is exported as
`reminderWindows(now)` and proved in `tests/sessionReminders.test.js`, which
needs no database. Sends go out over **ZeptoMail** — `ZEPTOMAIL_TOKEN`, first
in `utils/email.js`'s order — because Resend's free 100/day is one evening
class; leave the token unset and the sweep declines to run.

[utils/assignmentReminders.js](server/utils/assignmentReminders.js) does the same for
assignments, to every student in the batch: one mail as it **opens** (its
`startDate`, else `createdAt` — but only if it has a start or due date, because
`syncCurriculumAssignments.js` creates a programme's undated set in one go),
and one **24 h before `dueDate`**. `dueReminderFor` stores the date reminded
about, so an extended deadline is reminded again. Rules are pure functions
(`openMailDue`, `dueReminderDue`) proved in `tests/assignmentReminders.test.js`. `npm run test:flows` covers the
takeover, the revoked refresh, and the lease; it signs in with `force: true`
because an automated client taking the account over should say so.

---

