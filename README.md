# our little corner

A daily check-in app for two: selfie check-ins, food logs, a shared diary, and
mood notes. Originally a Claude artifact, rebuilt here as a normal static site
+ one small API route so it can run on its own on Vercel.

## Deploy it (no GitHub needed)

1. Install [Node.js](https://nodejs.org) if you don't have it.
2. Unzip this folder, open a terminal inside it, and run:
   ```
   npx vercel login
   npx vercel
   ```
   Follow the prompts (link to a new project, accept the defaults). This
   gives you a working preview link — but check-ins won't save yet, because
   there's no database connected.
3. In the [Vercel dashboard](https://vercel.com/dashboard), open your new
   project → **Storage** tab → **Create Database** (or **Marketplace** →
   search **Upstash** → **Redis**) → connect it to this project. This
   automatically adds the env vars the API route needs.
4. (Recommended) Project → **Settings** → **Environment Variables** → add
   `APP_PASSCODE` set to a password only you two know. Without this, anyone
   who finds the URL can read and write your data — it's not indexed or
   linked anywhere, but there's no login wall unless you set this.
5. Redeploy so the function picks up the new env vars:
   ```
   npx vercel --prod
   ```
6. Open the printed `.vercel.app` URL on both your phones. First visit asks
   for the passcode (if you set one) and which of you is checking in — both
   choices are saved per device, not per person account.

## Files

- `index.html` — the whole app (UI + client logic)
- `api/kv.js` — one serverless function; reads/writes whatever key it's
  given in the connected Redis database
- `package.json` — the one dependency (`@upstash/redis`) the API route needs

## Notes

- Photos are stored as compressed base64 inside the day's record, so no file
  storage is needed — just the database.
- Free-tier Redis (Upstash via Vercel Marketplace) comfortably covers a
  two-person daily-use app like this.
- If you ever want to see or delete a day's raw data, it's stored in Redis
  under keys like `day:2026-08-26` and a single `settings` key.
