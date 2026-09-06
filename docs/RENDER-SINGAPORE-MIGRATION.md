# Moving the API to Render Singapore

## Why

Measured 2026-09-06 against the live service:

| Request | Now (US region) | Expected (Singapore) |
| --- | --- | --- |
| `/health`, no DB work | 330 ms | ~100 ms |
| Login, one DB lookup | 820 ms | ~300 ms |

The Render service runs in a US region; the students and the Atlas cluster
(AWS `ap-south-1`, Mumbai) are both in India. Every call crosses the Pacific
twice — once for the request, again for each query the handler makes back to
Mumbai. The student home page fires seven calls at once, which is the ~1s stall.

This is distance, not capacity. The Standard-plan upgrade removed the free
tier's 15-minute idle spin-down (the 30–50s first load) and that part is done;
no plan buys a shorter cable. **Render cannot change a service's region**, so
the fix is a new service and a cutover.

## Before you start

Have the **old service's Environment tab open in another window** — you are
copying seven secrets out of it. Nothing here is written down in the repo.

Check the old service's Node version too (Settings → Build, or the first lines
of a build log). If the new service picks a different major, set `NODE_VERSION`
on it to match rather than discovering the difference at runtime.

## 1. Create the service

[render.yaml](../render.yaml) is committed so the region, plan, health check
path and root directory are not hand-entered.

1. Render Dashboard → **New** → **Blueprint**.
2. Pick the `rochanreddy/menler-lms` repo, branch `main`.
3. Render reads `render.yaml` and offers one service, `menler-lms-sg`, in
   Singapore. It will prompt for the seven `sync: false` values.
4. Paste each from the old service, **unchanged**:

   `MONGODB_URI` · `JWT_SECRET` · `RESEND_API_KEY` · `MAIL_FROM` ·
   `SMTP_FROM` · `GOOGLE_DRIVE_API_KEY` · `VDOCIPHER_API_SECRET`

   `JWT_SECRET` matters most: a different value invalidates every token and
   device-session row in flight, logging everyone out the moment you cut over.

Do **not** add `PORT`. Render injects it; `index.js` only falls back to 4100 for
local dev, and setting it fights the platform's port detection.

## 2. Let Atlas accept the new service

The Singapore service has **different outbound IPs** from the old one. If
Atlas → Network Access is restricted to specific addresses rather than
`0.0.0.0/0`, the new service cannot reach Mongo and will sit failing its health
check with `{"ok":false,"db":0}`.

Render shows the addresses under the new service's **Connect → Outbound**. Add
them in Atlas before you expect a green deploy.

## 3. Verify before touching the frontend

The new service is live and serving the same database while the old one still
takes all real traffic — so test it properly here, not after the cutover.

```bash
NEW=https://menler-lms-sg.onrender.com

# Expect {"ok":true,"db":1} and a total well under the old 330ms.
curl -s -w '\ntotal=%{time_total}\n' $NEW/health

# Expect 401 with a JSON body — proves Mongo is readable, not just that the
# process booted. Expect ~300ms against the old service's ~820ms.
curl -s -o /dev/null -w 'login ttfb=%{time_starttransfer} code=%{http_code}\n' \
  -X POST -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"x"}' \
  $NEW/api/lms/auth/login
```

If `/health` returns `503` / `db:0`, it is step 2 — Atlas is refusing the
connection, not a code problem.

## 4. Cut the frontend over

In Vercel → the LMS project → Settings → Environment Variables, change

```
VITE_API_URL = https://menler-lms-sg.onrender.com/api/lms
```

**Keep the `/api/lms` suffix.** `client/src/api.js` appends route paths directly
to this value; without it every call 404s.

Vite bakes env vars in at build time, so **the change does nothing until you
redeploy** the frontend. Deployments → ⋯ → Redeploy.

CORS needs no change: `https://app.menler.in` is hardcoded in the allowlist in
[server/index.js](../server/index.js) alongside `LMS_APP_URL`.

## 5. Confirm, then retire the old service

Sign in on the real site as a student and click through Home, Learning and
Forum. Watch the new service's log stream while you do — every request logs one
JSON line with `path`, `status` and `ms`, so you can see the handler timings
directly.

Once that is clean, **suspend** the old service for a day rather than deleting
it, so a rollback is one click (point `VITE_API_URL` back and redeploy). Delete
it after — two Standard services bill twice.

## Still to come

The Atlas cluster is a free **M0**, which is shared and CPU-throttled. If pages
still feel heavy after this move, a paid tier — kept in Mumbai — is the next
step. Do the region move first; it is the larger win by far.
