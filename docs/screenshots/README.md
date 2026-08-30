# UI verification screenshots

Captured by driving the real app in Chrome (Playwright) against the `seed:full`
fixture — not mockups. Three roles, 1440px desktop and 390px mobile.

`04-mobile-header-fixed.png` and `06-…-BEFORE-FIX.png` are the two halves of one
bug: on mobile, `.learn-progress` kept `flex: 1 1 260px`, and once the container
turned into a column that 260px became a **height**, so the card reserved a
quarter of the screen as blank space. 700px tall before, 130px after.

| Shot | What it proves |
|---|---|
| `02-student-learning-header` | the reworked Learning header — one band, no orphan dropdown |
| `01-student-graded-card` | graded block on green, feedback in the serif, check panel on white |
| `03-student-assignments` | every submission state: READY, NEEDS_FIXES, locked, not-yet-open, overdue |
| `04-student-forum` | the rebuilt board — one name, avatars, relative time, ruled action bar |
| `02-mentor-grade-row-READY` | the check panel on a **sunken** grade row (the contrast regression, fixed) |
| `03-admin-detail-row` | the same panel on the sunken admin `<td>` |
| `08-student-100pct-learning` | the picker DOES appear for a student in two programmes |
| `12-mentor-submissions` | mentor batch workspace: roster, 13 sessions, gradebook |

Regenerate with the scripts in the scratchpad, or re-shoot manually — these are a
record of one verified run, not a test fixture, and they will go stale.
