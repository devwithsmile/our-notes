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

Put these in `.env.local` (never commit it):

```dotenv
MONGODB_URI=mongodb+srv://devwithsmile:<db_password>@cluster0.u0ld7hk.mongodb.net/
MONGO_PASSWORD=your-private-password
MONGODB_DATABASE=our_notes
```

The server replaces `<db_password>` with the URL-encoded `MONGO_PASSWORD` at runtime. The password is never sent to the browser. For isolated local JSON development, set `NOTES_FILE=./data/notes.json` instead.

Open **http://localhost:3000**. A new empty database shows **Set up list**; create the owner account using your private `SETUP_TOKEN`.

## Deploy to Vercel

Set `MONGODB_URI`, sensitive `MONGO_PASSWORD`, `MONGODB_DATABASE=our_notes`, and private `SETUP_TOKEN` in the production environment. Ensure Atlas network access permits the deployment’s outbound connections. Deploy as a Next.js project.

For previews, configure separate variables with `MONGODB_DATABASE=our_notes_preview`. Never point previews or browser tests at the production database. Do not set `NOTES_FILE` on Vercel.

Hosted requests use MongoDB exclusively. Missing credentials or a connection failure returns an error; the app never falls back to Blob or ephemeral local files. Legacy Blob credentials may be retained for recovering old data, but are not used by the hosted app.

MongoDB clients reuse a small connection pool across warm invocations. Data is read fresh for authorization, and saves use atomic revision checks to preserve concurrent changes. The small shared notebook remains limited to 4 MiB.

## Import existing data

The migration does not delete or modify the old Blob store. If Blob is suspended, its data cannot be imported until an export is available. Do not assume an empty MongoDB database contains your old accounts or lists.

To import a private JSON export into an **empty** MongoDB notebook:

```sh
npm run storage:upload -- /path/to/private-export.json
```

This preserves all accounts, approvals, tasks, Sangeet entries, songs, links, and guests. Existing passwords continue working; sessions are cleared. An existing destination notebook is never overwritten. Keep exports private.

## Password recovery and access requests

- **Owner:** **Sign in → Forgot password?**, enter the server’s `SETUP_TOKEN`, and choose a new password. Previous sessions are signed out.
- **Other users:** **Manage access → Reset password**, then share the new password privately. Editing permissions stay the same.
- **Requests:** **Approve** or **Deny** in **Manage access**. Denied users retain public read access, but cannot see the guest list.
- Reset attempts are rate limited. Missing or short setup tokens disable owner recovery.

## Checks

```sh
npm test
npm run build
PLAYWRIGHT_CHROME=1 npm run test:browser
npm run storage:check
```

Browser tests use temporary local data. The MongoDB check uses a uniquely named temporary collection, checks real reads/writes and permissions, then removes that collection. It never writes to the shared production notebook.
