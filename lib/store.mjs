import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import lockfile from "proper-lockfile";

export const MAX_STORE_BYTES = 4 * 1024 * 1024;
export const emptyState = () => ({
  schemaVersion: 1,
  revision: 0,
  users: [],
  sessions: [],
  notes: [],
  rateLimits: [],
  imports: [],
});
export class StorageError extends Error {}
const isDate = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const isText = (value) => typeof value === "string";

export function validateState(state) {
  const fail = () => {
    throw new StorageError(
      "The notebook JSON is invalid or uses an unsupported format. Restore a valid backup; the existing file has not been replaced.",
    );
  };
  if (
    !state ||
    state.schemaVersion !== 1 ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0
  )
    fail();
  for (const key of ["users", "sessions", "notes", "rateLimits", "imports"])
    if (!Array.isArray(state[key])) fail();
  const ids = new Set(),
    usernames = new Set(),
    notes = new Set(),
    tokens = new Set();
  let owners = 0;
  for (const user of state.users) {
    if (
      !user ||
      !isText(user.id) ||
      !user.id ||
      ids.has(user.id) ||
      !isText(user.name) ||
      !isText(user.username) ||
      usernames.has(user.username) ||
      !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.password) ||
      !["owner", "writer", "pending"].includes(user.role) ||
      !isDate(user.created_at)
    )
      fail();
    ids.add(user.id);
    usernames.add(user.username);
    if (user.role === "owner") owners++;
  }
  if (owners > 1 || (state.users.length && owners !== 1)) fail();
  for (const note of state.notes) {
    if (
      !note ||
      !isText(note.id) ||
      notes.has(note.id) ||
      !isText(note.title) ||
      !isText(note.body) ||
      !["Everyday", "Ideas", "Plans", "Memories"].includes(note.category) ||
      !ids.has(note.author_id) ||
      !ids.has(note.updated_by) ||
      typeof note.pinned !== "boolean" ||
      (note.completed !== undefined && typeof note.completed !== "boolean") ||
      !Number.isSafeInteger(note.version) ||
      note.version < 1 ||
      !isDate(note.created_at) ||
      !isDate(note.updated_at)
    )
      fail();
    notes.add(note.id);
  }
  for (const session of state.sessions) {
    if (
      !session ||
      !/^[a-f0-9]{64}$/.test(session.token) ||
      tokens.has(session.token) ||
      !ids.has(session.user_id) ||
      !isDate(session.expires_at)
    )
      fail();
    tokens.add(session.token);
  }
  for (const limit of state.rateLimits)
    if (
      !limit ||
      !isText(limit.key) ||
      !Number.isSafeInteger(limit.count) ||
      limit.count < 1 ||
      !isDate(limit.expires_at)
    )
      fail();
  for (const item of state.imports)
    if (!item || !isText(item.source) || !isDate(item.imported_at)) fail();
  return state;
}
function decode(text) {
  if (Buffer.byteLength(text) > MAX_STORE_BYTES)
    throw new StorageError(
      "This notebook exceeds the 4 MiB JSON storage limit.",
    );
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new StorageError(
      "The notebook JSON could not be read. Restore a valid backup; the existing file has not been replaced.",
    );
  }
  return validateState(data);
}
function encode(state) {
  validateState(state);
  const text = JSON.stringify(state, null, 2) + "\n";
  if (Buffer.byteLength(text) > MAX_STORE_BYTES)
    throw new StorageError(
      "This notebook has reached the 4 MiB JSON storage limit. Export a backup and remove unneeded notes before adding more.",
    );
  return text;
}

function localStore(file) {
  const path = resolve(file);
  async function read() {
    try {
      return decode(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return emptyState();
      throw error;
    }
  }
  return {
    kind: "local",
    read,
    async update(change) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      let compromised;
      const release = await lockfile
        .lock(path, {
          realpath: false,
          stale: 20000,
          update: 5000,
          retries: {
            retries: 50,
            minTimeout: 20,
            maxTimeout: 100,
            factor: 1.2,
          },
          onCompromised: (error) => {
            compromised = error;
          },
        })
        .catch(() => {
          throw new StorageError(
            "The local notebook is busy. Please try saving again.",
          );
        });
      const temp = `${path}.${randomUUID()}.tmp`;
      try {
        const state = await read();
        const before = JSON.stringify(state);
        const result = await change(state);
        if (JSON.stringify(state) === before) return result;
        state.revision++;
        const text = encode(state);
        const handle = await open(temp, "wx", 0o600);
        try {
          await handle.writeFile(text);
          await handle.sync();
        } finally {
          await handle.close();
        }
        if (compromised) throw compromised;
        await rename(temp, path); // Readers see either the old complete file or the new complete file.
        return result;
      } finally {
        await unlink(temp).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
        await release();
      }
    },
  };
}

export function blobStore({ sdk, pathname, attempts = 6, retryDelay = true }) {
  async function snapshot() {
    const response = await sdk.get(pathname, {
      access: "private",
      useCache: false,
      // Compressed responses carry weak ETags that cannot satisfy ifMatch writes.
      headers: { "Accept-Encoding": "identity" },
      abortSignal: AbortSignal.timeout(8000),
    });
    if (response === null) return { state: emptyState(), etag: null };
    if (response.statusCode !== 200 || !response.stream || !response.blob.etag)
      throw new StorageError(
        "The private notebook could not be read. Please try again.",
      );
    if (response.blob.size > MAX_STORE_BYTES)
      throw new StorageError(
        "This notebook exceeds the 4 MiB JSON storage limit.",
      );
    const text = await new Response(response.stream).text();
    return { state: decode(text), etag: response.blob.etag };
  }
  return {
    kind: "cloud",
    async read() {
      return (await snapshot()).state;
    },
    async update(change) {
      // Callbacks can run more than once: no external side effects are allowed inside them.
      for (let attempt = 0; attempt < attempts; attempt++) {
        const { state, etag } = await snapshot();
        const before = JSON.stringify(state);
        const result = await change(state);
        if (JSON.stringify(state) === before) return result;
        state.revision++;
        const body = encode(state);
        try {
          await sdk.put(pathname, body, {
            access: "private",
            contentType: "application/json",
            addRandomSuffix: false,
            cacheControlMaxAge: 60,
            ...(etag
              ? { allowOverwrite: true, ifMatch: etag }
              : { allowOverwrite: false }),
            abortSignal: AbortSignal.timeout(8000),
          });
          return result;
        } catch (error) {
          const conflict = error instanceof sdk.BlobPreconditionFailedError;
          const firstWriteRace =
            !etag &&
            error instanceof sdk.BlobError &&
            /already exists/i.test(error.message);
          if (!conflict && !firstWriteRace) throw error;
          if (retryDelay)
            await delay(Math.min(40 * 2 ** attempt, 500) + Math.random() * 50);
        }
      }
      throw new StorageError(
        "Someone else is saving right now. Your changes have not been saved; please try again.",
      );
    },
  };
}

export async function createStore({ file = process.env.NOTES_FILE, sdk } = {}) {
  if (file && process.env.VERCEL)
    throw new StorageError(
      "NOTES_FILE cannot be used on Vercel. Connect a private Blob store instead.",
    );
  if (
    !file &&
    (sdk ||
      process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN))
  ) {
    const pathname =
      process.env.NOTES_BLOB_PATH ||
      `our-notes/${process.env.VERCEL_ENV === "preview" ? "preview" : "production"}/notebook.json`;
    return blobStore({ sdk: sdk || (await import("@vercel/blob")), pathname });
  }
  if (process.env.VERCEL)
    throw new StorageError(
      "Connect a private Vercel Blob store and set BLOB_READ_WRITE_TOKEN (or connect BLOB_STORE_ID with Vercel OIDC), then redeploy.",
    );
  return localStore(file || "./data/notes.json");
}

export function getStore() {
  // Cache the adapter, never the data. Every read uses the file or Blob origin.
  if (!globalThis.__ourNotesJsonStore)
    globalThis.__ourNotesJsonStore = createStore().catch((error) => {
      globalThis.__ourNotesJsonStore = undefined;
      throw error;
    });
  return globalThis.__ourNotesJsonStore;
}
