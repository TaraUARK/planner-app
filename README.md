# Planner

A personal planner that installs like an app on iPhone and Mac. Data is stored on each device and syncs through Supabase. The full design is in `../PLANNER_SPEC.md`.

- **Live app:** https://tarauark.github.io/planner-app/
- **Code:** this folder (public GitHub repo `planner-app`; contains no secrets)

## Installing the app
- **iPhone:** open the live app link in **Safari** → Share button → **Add to Home Screen**. Open it from the home screen and sign in once (the installed app keeps its own sign-in, separate from Safari).
- **Mac (macOS Ventura):** open the link in **Google Chrome** → ⋮ menu → **Cast, save and share → Install page as app**. (Safari on Ventura can't install web apps; on macOS 14+ Safari's File → Add to Dock also works.)

## Deploying an update
Every push to the `main` branch builds, tests and publishes the app automatically (GitHub → Actions tab shows progress, ~2 minutes).

```bash
git add -A
git commit -m "Describe the change"
git push
```

## Getting a device onto the newest version
The installed app keeps a copy of itself so it opens instantly and works offline. When a new version is published, a banner appears: **"A new version is available — Reload."** Tap **Reload**.
- Check which version a device is running in **Settings → About this device → App version**.
- If a device seems stuck on an old version: fully close the app and reopen it (the banner should appear). Last resort: delete the app from the home screen / Chrome and install it again. That's safe because your data is on the server; just sign in again.

## Developing on this Mac
```bash
npm install      # once
npm run dev      # local test copy at http://localhost:5173/planner-app/
npm test         # automated tests
```
The local `.env` file holds the Supabase URL and **publishable** key (safe to publish). Never put the **secret** key (`sb_secret_…`) in this repo.

## Database
`supabase/schema.sql` creates every table with Row Level Security (only the signed-in owner can read/write). It is safe to run again after changes.

## Backups and restoring
Added in stage 7.
