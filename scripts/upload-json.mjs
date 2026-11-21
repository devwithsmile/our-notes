// Copy a local notebook to an EMPTY private Blob notebook. Never overwrite hosted accounts/notes.
import { readFile } from "node:fs/promises";
import { createStore, validateState } from "../lib/store.mjs";
if (
  !process.env.BLOB_READ_WRITE_TOKEN &&
  !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)
)
  throw new Error(
    "Set BLOB_READ_WRITE_TOKEN for your private Blob store first.",
  );
const source = process.argv[2] || "./data/notes.json";
const imported = validateState(JSON.parse(await readFile(source, "utf8")));
if (!imported.users.length)
  throw new Error("The source notebook has no accounts to upload.");
const store = await createStore({
  file: null,
  sdk: await import("@vercel/blob"),
});
await store.update((state) => {
  if (state.users.length || state.notes.length)
    throw new Error(
      "The hosted notebook is not empty. No data has been replaced.",
    );
  state.users = structuredClone(imported.users);
  state.notes = structuredClone(imported.notes);
  state.imports = [
    ...imported.imports,
    { source: "local-json-upload", imported_at: new Date().toISOString() },
  ];
  state.sessions = [];
  state.rateLimits = [];
});
console.log(
  "Notebook copied to private Vercel Blob. Sign in with your existing account. Local JSON has not been changed.",
);
