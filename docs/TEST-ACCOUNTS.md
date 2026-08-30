# Test accounts

> **Local test fixtures only.** These are seeded accounts on the dev database,
> not real credentials. Do not reuse this password anywhere real, and do not
> point this file at a production cluster.

_Generated 2026-08-30 09:31 by `node scripts/dumpAccounts.mjs` — regenerate after any seed change._

## The password

| Who | Password |
|---|---|
| Every seeded mentor and student | `Test@1234` |
| Admin (kept separate, set by `npm run seed`) | `ChangeMe123!` |

The **Name** column in the tables below is a display name, not a credential.
Every table repeats the password so a row can be read straight across without
scrolling back up here.

## Where things run

| | URL |
|---|---|
| App | http://localhost:5174 |
| API | http://localhost:4100/api/lms |

```bash
cd server && npm run dev        # :4100
cd client && npm run dev        # :5174
cd server && npm run seed:full  # rebuild this whole world
cd server && npm run test:flows # 85 API assertions across all three roles
```

## Admin

| Email | Password | Name |
|---|---|---|
| `admin@menler.in` | `ChangeMe123!` | Menler Admin |

## Batches (this fixture)

| Batch | Programme | Lessons | Mentors | Students | Runs |
|---|---|---|---|---|---|
| Generalist · Jul 2026 | Generalist | 24 | 4 | 10 | 2026-07-05 → 2026-10-11 |
| Kickstarter · Jul 2026 | Kickstarter | 53 | 3 | 10 | 2026-07-05 → 2026-10-11 |

## Mentors (this fixture)

Access is granted at two levels and they are not the same thing: programme-level
lets a mentor SEE the curriculum, batch-level lets them GRADE. Both are set here.

| Email | Password | Name | Batches they teach |
|---|---|---|---|
| `imran.qureshi@menler.in` | `Test@1234` | Imran Qureshi | Kickstarter · Jul 2026 · Generalist · Jul 2026 |
| `priya.nambiar@menler.in` | `Test@1234` | Priya Nambiar | Kickstarter · Jul 2026 · Generalist · Jul 2026 |
| `rahul.verma@menler.in` | `Test@1234` | Rahul Verma | Kickstarter · Jul 2026 · Generalist · Jul 2026 |
| `sneha.kulkarni@menler.in` | `Test@1234` | Sneha Kulkarni | Generalist · Jul 2026 |

## Students (this fixture)

Every one of them has real history: submissions, at least one graded submission with
mentor feedback, quiz attempts, attendance and partial lesson progress.

| Email | Password | Name | Batches | Progress | Subs (graded) | Quizzes | Attendance |
|---|---|---|---|---|---|---|---|
| `aarav.sharma@student.menler.in` | `Test@1234` | Aarav Sharma | Kickstarter | Kick 19% | 3 (2) | 2 | 4/8 |
| `aditya.rao@student.menler.in` | `Test@1234` | Aditya Rao | Generalist | Gene 58% | 5 (4) | 3 | 6/8 |
| `ananya.iyer@student.menler.in` | `Test@1234` | Ananya Iyer | Kickstarter | Kick 70% | 4 (3) | 3 | 5/8 |
| `arjun.mehta@student.menler.in` | `Test@1234` | Arjun Mehta | Kickstarter | Kick 72% | 4 (3) | 3 | 8/8 |
| `dev.malhotra@student.menler.in` | `Test@1234` | Dev Malhotra | Kickstarter + Generalist | Kick 79% · Gene 58% | 10 (8) | 6 | 15/16 |
| `diya.patel@student.menler.in` | `Test@1234` | Diya Patel | Kickstarter | Kick 34% | 4 (3) | 3 | 3/8 |
| `isha.nair@student.menler.in` | `Test@1234` | Isha Nair | Kickstarter | Kick 60% | 3 (2) | 3 | 8/8 |
| `kabir.singh@student.menler.in` | `Test@1234` | Kabir Singh | Generalist | Gene 17% | 3 (2) | 2 | 1/8 |
| `kavya.menon@student.menler.in` | `Test@1234` | Kavya Menon | Kickstarter + Generalist | Kick 58% · Gene 58% | 9 (7) | 6 | 14/16 |
| `meera.joshi@student.menler.in` | `Test@1234` | Meera Joshi | Generalist | Gene 46% | 5 (3) | 3 | 7/8 |
| `nisha.bhatt@student.menler.in` | `Test@1234` | Nisha Bhatt | Generalist | Gene 67% | 3 (2) | 3 | 5/8 |
| `rohan.desai@student.menler.in` | `Test@1234` | Rohan Desai | Generalist | Gene 63% | 4 (3) | 3 | 6/8 |
| `sara.khan@student.menler.in` | `Test@1234` | Sara Khan | Generalist | Gene 33% | 4 (3) | 3 | 1/8 |
| `tanvi.shetty@student.menler.in` | `Test@1234` | Tanvi Shetty | Kickstarter + Generalist | Kick 62% · Gene 75% | 8 (6) | 6 | 12/16 |
| `vihaan.reddy@student.menler.in` | `Test@1234` | Vihaan Reddy | Kickstarter | Kick 49% | 4 (3) | 3 | 4/8 |
| `yash.chauhan@student.menler.in` | `Test@1234` | Yash Chauhan | Kickstarter + Generalist | Kick 100% · Gene 100% | 9 (8) | 6 | 14/16 |

## Who to log in as, for what

| Email | Why this one |
|---|---|
| `aarav.sharma@student.menler.in` | only 19% done, 50% attendance — the at-risk panel |
| `dev.malhotra@student.menler.in` | enrolled in BOTH batches — merged lists, per-programme progress |
| `kabir.singh@student.menler.in` | only 17% done, 13% attendance — the at-risk panel |
| `kavya.menon@student.menler.in` | enrolled in BOTH batches — merged lists, per-programme progress |
| `tanvi.shetty@student.menler.in` | enrolled in BOTH batches — merged lists, per-programme progress |
| `yash.chauhan@student.menler.in` | at 100% — the certificate path |
| `yash.chauhan@student.menler.in` | enrolled in BOTH batches — merged lists, per-programme progress |
| `imran.qureshi@menler.in` | teaches both programmes — batch switching, full grading queue |
| `sneha.kulkarni@menler.in` | teaches ONE programme — use to check the other batch is genuinely refused |

## Other accounts in this database

Not created by `seed:full` and **not covered by the password above** — left in
place because deleting accounts is not the job of this script. Ignore them
when cross-checking — they are older `seed:demo` fixtures and real local signups.

Stale batches: `Demo — Kickstarter · Jul 2026`

| Email | Role | Note |
|---|---|---|
| `mentor@menler.in` | mentor | old `seed:demo` fixture |
| `aarav@demo.menler.in` | student | old `seed:demo` fixture |
| `ananya@demo.menler.in` | student | old `seed:demo` fixture |
| `arjun@demo.menler.in` | student | old `seed:demo` fixture |
| `diya@demo.menler.in` | student | old `seed:demo` fixture |
| `vihaan@demo.menler.in` | student | old `seed:demo` fixture |
| `mithreshuttarwarmmvi@gmail.com` | student | real local account — left alone |

## Edge cases already in the data

These are pinned by the seed, not random, so they are there on every run:

- An assignment that has **not opened yet**, and one that is **overdue and never submitted**.
- Submissions sitting in **`NEEDS_FIXES`** and **`PENDING_CHECK`**, not just `READY`.
- **Graded and locked** submissions — the student cannot edit until a mentor unlocks.
- One student per batch who **never sat the exam**.
- Past sessions with **recordings**, one class **today**, and future ones with **no link yet**.

