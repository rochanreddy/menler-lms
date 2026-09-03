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
cd server && npm run test:flows # drives all three roles against a RUNNING server
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

- **Programmes** Kickstarter (53 lessons) · Generalist (115 lessons) — the real
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
closes its sessions and drops its lease. `npm run test:flows` covers the
takeover, the revoked refresh, and the lease; it signs in with `force: true`
because an automated client taking the account over should say so.

---

