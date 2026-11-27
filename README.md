# Together — shared wedding lists

Shared wedding tabs with editing limited to you and people you approve. The guest list is visible only to approved editors; other tabs are publicly readable.

- **To-do list:** add a task, mark it done, rename it, or delete it.
- **Sangeet:** add each person or group and their chosen song; edit or delete entries.
- **Links** (third tab): save a name and URL under Mehndi, Haldi, Sangeet, or Wedding; filter by event.
- **Song list:** save song names under Hindi, Marathi, or Bhojpuri; filter by language.
- **Guest list:** add, edit, or delete guest names. Only the owner and approved editors can view it. It is omitted from public API responses and disappears when editing access is removed.
- Switch tabs without losing unfinished entries.
- Share the same link with your partner.
- They choose **Request access**. You approve them under **Manage access**.
- Saved changes appear on other devices automatically, usually within 5 seconds.

Future sections use the same tab navigation in `components/SectionTabs.js`.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm install
npm run setup:key
npm run dev
```

Open **http://localhost:3000** and select **Set up list**. Create your owner account using the private `SETUP_TOKEN` in `.env.local`. After setup, you just sign in normally.

Tasks, Sangeet entries, songs, links, guests, and accounts are saved in `data/notes.json`. The existing filename is retained so earlier data is not lost. Previous notes appear as tasks with their text preserved. The data file and `.env.local` are excluded from Git.

On the same Wi-Fi, your partner can open `http://YOUR-COMPUTER-LAN-IP:3000` while your computer and the app are running. To use it from anywhere, deploy to Vercel.

## Deploy to Vercel

1. Import this GitHub repository as a **Next.js** project.
2. Create/connect a **private Vercel Blob store** from the project's Storage tab.
3. Add `BLOB_READ_WRITE_TOKEN` and `SETUP_TOKEN` to the project's environment variables. The setup token can be copied from your local `.env.local`. Never use a `NEXT_PUBLIC_` prefix for secrets.
4. Deploy, open the URL, and set up your owner account.
5. Share the URL with your partner and approve their request to edit.

Vercel stores the JSON in private Blob storage because deployment files cannot persist edits. No SQL database is needed. See [.env.example](.env.example) for optional configuration. Keep preview and production stores separate. Do not set `NOTES_FILE` on Vercel.

To copy an existing local list to an **empty** hosted store, put the Blob token in `.env.local`, then run `npm run storage:upload`. Existing hosted data is never overwritten. If you want local development to keep using a local file despite that token, set `NOTES_FILE=./data/notes.json`.

## Password recovery and access requests

- **Owner:** open **Sign in → Forgot password?**, enter the server’s `SETUP_TOKEN`, and choose and confirm a new password. This signs you in and signs out previous owner sessions. The token stays private; it also serves as the owner recovery key.
- **Other users:** the owner opens **Manage access → Reset password** next to the person, chooses a new password, and shares it privately. Existing sessions are signed out; editing permissions do not change.
- **Requests:** choose **Approve** or **Deny** in **Manage access**. Denied users can still read the lists and see their denied status. They no longer count as pending; the owner can approve them later.
- Recovery attempts are rate limited. Missing or short server setup tokens disable owner recovery.

## Data and permissions

Permission checks happen on the server. Removing someone's editing access takes effect on their next change. Readers never receive password hashes or session records. Passwords are hashed, and accounts use secure session cookies on Vercel.

Simultaneous saves cannot silently overwrite each other. If the same task or Sangeet entry changes on another device, your edit stays in the input so you can copy it or cancel to see the latest version. Local writes are locked and atomic; Blob writes use version checks.

For a local backup, stop the app and copy `data/notes.json`. For a hosted backup, download the private JSON through your Vercel dashboard. Keep backups private. The shared JSON file has a 4 MiB size limit and is intended for a small list. Blob operations count toward your Vercel usage.

## Checks

```sh
npm test
npm run build
PLAYWRIGHT_CHROME=1 npm run test:browser
```

Browser tests use Chrome and temporary data. If Chrome is unavailable, run `npx playwright install chromium`, then `npm run test:browser`.
