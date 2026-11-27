import { MongoClient } from "mongodb";
import { setTimeout as delay } from "node:timers/promises";
import {
  emptyState,
  validateState,
  StorageError,
  MAX_STORE_BYTES,
} from "./store.mjs";

export function mongoUri(env = process.env) {
  const template = env.MONGODB_URI;
  if (!template) throw new StorageError("Set MONGODB_URI to connect MongoDB.");
  if (!/^mongodb(?:\+srv)?:\/\//.test(template))
    throw new StorageError("MONGODB_URI must be a MongoDB connection URL.");
  if (template.includes("<db_password>")) {
    if (!env.MONGO_PASSWORD)
      throw new StorageError("Set MONGO_PASSWORD to connect MongoDB.");
    return template.replace(
      "<db_password>",
      encodeURIComponent(env.MONGO_PASSWORD),
    );
  }
  return template;
}
export async function mongoCollection() {
  // Reuse a small pool across warm Vercel invocations, never cache account data.
  if (!globalThis.__ourNotesMongoClient) {
    const client = new MongoClient(mongoUri(), {
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60000,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      waitQueueTimeoutMS: 10000,
      retryWrites: true,
    });
    globalThis.__ourNotesMongoClient = client.connect().catch(async () => {
      globalThis.__ourNotesMongoClient = undefined;
      await client.close().catch(() => {});
      throw new StorageError(
        "Cannot connect to MongoDB. Check database credentials and Atlas network access.",
      );
    });
  }
  const client = await globalThis.__ourNotesMongoClient;
  const database =
    process.env.MONGODB_DATABASE ||
    (process.env.VERCEL_ENV === "preview" ? "our_notes_preview" : "our_notes");
  return client.db(database).collection("notebooks");
}
export function mongoStore({
  collection,
  id = "shared",
  attempts = 10,
  retryDelay = true,
}) {
  async function snapshot() {
    const document = await collection.findOne({ _id: id });
    if (!document) return { state: emptyState(), exists: false };
    const { _id, ...state } = document;
    return { state: validateState(state), exists: true };
  }
  return {
    kind: "mongodb",
    async read() {
      return (await snapshot()).state;
    },
    async update(change) {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const { state, exists } = await snapshot();
        const before = JSON.stringify(state),
          revision = state.revision;
        const result = await change(state);
        if (JSON.stringify(state) === before) return result;
        state.revision = revision + 1;
        validateState(state);
        if (Buffer.byteLength(JSON.stringify(state)) > MAX_STORE_BYTES)
          throw new StorageError(
            "This notebook exceeds the 4 MiB limit. Export a backup before removing old entries.",
          );
        const document = { _id: id, ...state };
        if (exists) {
          const saved = await collection.replaceOne(
            { _id: id, revision },
            document,
          );
          if (saved.matchedCount === 1) return result;
        } else {
          try {
            await collection.insertOne(document);
            return result;
          } catch (error) {
            if (error.code !== 11000) throw error;
          }
        }
        if (retryDelay)
          await delay(Math.min(30 * 2 ** attempt, 300) + Math.random() * 30);
      }
      throw new StorageError(
        "Someone else is saving right now. Your changes have not been saved; please try again.",
      );
    },
  };
}
