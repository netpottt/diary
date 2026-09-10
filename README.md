# our little corner

A daily check-in app for two: selfie check-ins, food logs, a shared diary, and
mood notes. A static site plus one small API route, deployable on Vercel.

## Why nothing was saving before

The old README told you to connect **Upstash Redis**, but `api/kv.js` is
written against **MongoDB** and reads `process.env.MONGODB_URI`. That variable
was never set, so every read and write returned a 500 and the app quietly fell
back to defaults. Follow the steps below and it will save.

## 1. Create the database (5 minutes, free)

1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas) and create a
   free **M0** cluster.
2. **Database Access** → *Add New Database User*. Pick a username and password.
   Avoid `@ : / ?` and `#` in the password, or you'll have to URL-encode them.
3. **Network Access** → *Add IP Address* → **Allow access from anywhere**
   (`0.0.0.0/0`). Vercel's functions don't have fixed IPs, so without this every
   request times out. This is the step people usually miss.
4. **Database** → *Connect* → *Drivers* → copy the connection string. It looks
   like `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`.
   Replace `<password>` with the real password.

## 2. Deploy

```
npx vercel login
npx vercel
```

Follow the prompts (link to a new project, accept the defaults).

## 3. Add the environment variables

Vercel dashboard → your project → **Settings** → **Environment Variables**:

| Name | Value | Required |
|---|---|---|
| `MONGODB_URI` | the connection string from step 1 | **yes** |
| `MONGODB_DB` | `ourlittlecorner` | no (this is the default) |
| `APP_PASSCODE` | a password only you two know | strongly recommended |

Without `APP_PASSCODE` anyone who finds the URL can read and write your data.
It isn't indexed or linked anywhere, but there's no login wall unless you set it.

Then redeploy so the function picks up the variables:

```
npx vercel --prod
```

## 4. Check it worked

Open `https://YOUR-APP.vercel.app/api/kv?key=settings` in a browser.

- `{"error":"not found"}` → **working.** The database is connected and simply
  empty. (With a passcode set you'll see `unauthorized` instead — also fine.)
- `{"error":"MONGODB_URI is not set..."}` → the variable is missing, or you
  didn't redeploy after adding it.
- Anything about authentication or a timeout → wrong password, or you skipped
  the `0.0.0.0/0` network access step.

## 5. First run

Open the URL on both phones. Each of you enters the passcode, picks a side, and
**one of you** fills in settings: names, the day you meet, and the shared time
zone.

A red banner appears at the top of the app whenever it can't reach the database,
so a silent failure like the original one can't happen again.

## China / Thailand notes

**Time zone.** China is UTC+8, Thailand is UTC+7. Both phones must have the
*same* value in the "our shared day starts in" setting, or you'd each be writing
to a different `day:` record and would never see each other. Pick one and stick
to it:

- `Asia/Shanghai` — a new day starts at midnight in China, 11pm in Thailand
- `Asia/Bangkok` — a new day starts at 1am in China, midnight in Thailand

Either works. Changing it later doesn't move old entries, so decide once.

**Google Fonts.** The original `index.html` loaded three fonts from
`fonts.googleapis.com`, which isn't reachable from mainland China — the page
would stall on load and then fall back to system fonts. The fonts are now served
from the `fonts/` folder in this project, so nothing external is fetched.

**The `.vercel.app` domain.** Vercel's default preview domains are frequently
unreachable from mainland China. If the app loads for her in Thailand but not
for you, that's the cause, not a bug in the code. Attach your own domain in
Vercel → Settings → Domains and use that instead. A cheap `.com` is enough; you
don't need ICP filing for personal use since the site isn't hosted in China.
This is the one thing I can't fix from inside the code.

## How the live sync works

Vercel's serverless functions can't hold a websocket open, so there's no true
push. Instead, each phone asks the server one question every few seconds: *has
anything changed?* The answer is one revision number per record — about 30
bytes. Only when a number actually moves does the phone download the record
itself, photos and all (roughly 60 KB with a selfie in it).

That's what makes a fast cadence affordable. In practice her check-in shows up
on your screen in about 1–3 seconds.

The cadence adapts, in `index.html`:

```js
const CHECK_ACTIVE_MS = 3000;    // while you're actively using it
const CHECK_IDLE_MS   = 25000;   // after a couple of minutes of nothing
const IDLE_AFTER_MS   = 120000;  // how long until "idle" kicks in
```

Checking stops entirely when the app is in the background, and resumes the
instant you bring it forward, so opening the app never shows you stale data.

**Cost:** 3-second checks work out to roughly 1,200 requests per hour per
person. Vercel's Hobby plan includes 1,000,000 function invocations per month,
so even with both of you in the app several hours a day you'd use a fraction of
it. If you ever want to be more conservative, raise `CHECK_ACTIVE_MS` to 5000 —
the difference is barely noticeable.

## Files

- `index.html` — the whole app (UI + client logic)
- `api/kv.js` — one serverless function; reads and writes records in MongoDB
- `fonts/` — the three fonts, self-hosted so China can load them
- `package.json` — the one dependency (`mongodb`)

## Notes

- Photos are compressed and stored as base64 inside the day's record, so no file
  storage is needed. A day with six photos is roughly 300–400 KB.
- Data lives under keys like `day:2026-09-10` and a single `settings` key, in
  the `kv` collection.
- Writes are **partial**: each phone only ever updates its own half of a day
  record. Two people saving at the same time can't overwrite each other.
- Every record carries a `rev` counter that increments on write. That's what
  the change-check endpoint (`/api/kv?meta=...`) reads.
