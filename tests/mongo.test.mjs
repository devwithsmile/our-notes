import { test } from "node:test";
import assert from "node:assert/strict";
import { mongoStore, mongoUri } from "../lib/mongo.mjs";
import { emptyState, createStore } from "../lib/store.mjs";
function fakeCollection(initial = null) {
  let document = initial
    ? { _id: "shared", ...structuredClone(initial) }
    : null;
  return {
    async findOne() {
      return structuredClone(document);
    },
    async insertOne(value) {
      if (document)
        throw Object.assign(new Error("duplicate"), { code: 11000 });
      document = structuredClone(value);
      return { acknowledged: true };
    },
    async replaceOne(filter, value) {
      if (document?.revision !== filter.revision) return { matchedCount: 0 };
      document = structuredClone(value);
      return { matchedCount: 1 };
    },
    inspect: () => structuredClone(document),
  };
}
const add = (store, source) =>
  store.update((state) =>
    state.imports.push({ source, imported_at: new Date().toISOString() }),
  );
test("MongoDB safely inserts and retries independent concurrent writes", async () => {
  const collection = fakeCollection();
  const first = mongoStore({ collection, retryDelay: false });
  const second = mongoStore({ collection, retryDelay: false });
  await Promise.all([add(first, "one"), add(second, "two")]);
  await Promise.all([add(first, "three"), add(second, "four")]);
  assert.equal((await first.read()).imports.length, 4);
  assert.equal(collection.inspect().revision, 4);
  assert.equal((await first.read())._id, undefined);
  await first.update(() => "unchanged");
  assert.equal(collection.inspect().revision, 4);
});
test("MongoDB fails closed on corrupt data, conflicts and connection errors", async () => {
  const corrupt = fakeCollection({ ...emptyState(), users: null });
  await assert.rejects(mongoStore({ collection: corrupt }).read(), /invalid/);
  const collection = fakeCollection(emptyState());
  collection.replaceOne = async () => ({ matchedCount: 0 });
  await assert.rejects(
    add(mongoStore({ collection, attempts: 2, retryDelay: false }), "no"),
    /Someone else/,
  );
  assert.equal(collection.inspect().revision, 0);
  collection.findOne = async () => {
    throw new Error("disconnected");
  };
  await assert.rejects(mongoStore({ collection }).read(), /disconnected/);
});
test("MongoDB retries callbacks against the newest authorization state", async () => {
  const collection = fakeCollection(emptyState());
  const replace = collection.replaceOne;
  let first = true;
  collection.replaceOne = async (filter, value) => {
    if (first) {
      first = false;
      await replace(filter, {
        ...emptyState(),
        revision: 1,
        imports: [{ source: "revoked", imported_at: new Date().toISOString() }],
      });
      return { matchedCount: 0 };
    }
    return replace(filter, value);
  };
  await assert.rejects(
    mongoStore({ collection, retryDelay: false }).update((state) => {
      if (state.imports.some((item) => item.source === "revoked"))
        throw new Error("permission revoked");
      state.imports.push({
        source: "edit",
        imported_at: new Date().toISOString(),
      });
    }),
    /permission revoked/,
  );
  assert.deepEqual(
    collection.inspect().imports.map((item) => item.source),
    ["revoked"],
  );
});
test("MongoDB password placeholders are encoded; errors never echo credentials", () => {
  assert.equal(
    mongoUri({
      MONGODB_URI: "mongodb+srv://user:<db_password>@example.com/",
      MONGO_PASSWORD: "a@b:c/#",
    }),
    "mongodb+srv://user:a%40b%3Ac%2F%23@example.com/",
  );
  assert.throws(
    () =>
      mongoUri({
        MONGODB_URI: "mongodb+srv://user:<db_password>@example.com/",
      }),
    /MONGO_PASSWORD/,
  );
});
test("Vercel never falls back to Blob when MongoDB is missing", async () => {
  const saved = {
    VERCEL: process.env.VERCEL,
    MONGODB_URI: process.env.MONGODB_URI,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  };
  try {
    process.env.VERCEL = "1";
    delete process.env.MONGODB_URI;
    process.env.BLOB_READ_WRITE_TOKEN = "legacy-token-present";
    await assert.rejects(createStore({ file: null }), /never falls back/);
  } finally {
    for (const [key, value] of Object.entries(saved))
      value === undefined
        ? delete process.env[key]
        : (process.env[key] = value);
  }
});
