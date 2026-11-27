// Uses an isolated temporary collection; never writes to the shared notebook.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { mongoUri, mongoStore } from "../lib/mongo.mjs";
import { handleApi } from "../lib/api.mjs";
const client = new MongoClient(mongoUri(), {
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 3,
});
let collection;
try {
  await client.connect();
  collection = client
    .db(process.env.MONGODB_DATABASE || "our_notes")
    .collection("verification_" + randomUUID().replaceAll("-", ""));
  const stores = [mongoStore({ collection }), mongoStore({ collection })];
  process.env.SETUP_TOKEN = randomUUID() + randomUUID();
  function browser(store) {
    let cookie = "";
    return async (path, method = "GET", data) => {
      const response = await handleApi(
        new Request("https://example.test/api" + path, {
          method,
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "X-Notes-Request": "1",
            Origin: "https://example.test",
          },
          ...(method === "GET" ? {} : { body: JSON.stringify(data || {}) }),
        }),
        store,
      );
      if (response.headers.has("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      return { status: response.status, data: await response.json() };
    };
  }
  delete process.env.APP_URL;
  const owner = browser(stores[0]),
    partner = browser(stores[1]),
    visitor = browser(stores[1]);
  assert.equal(
    (
      await owner("/setup", "POST", {
        name: "Test owner",
        username: "testowner",
        password: randomUUID(),
        setupToken: process.env.SETUP_TOKEN,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await partner("/register", "POST", {
        name: "Test partner",
        username: "testpartner",
        password: randomUUID(),
      })
    ).status,
    200,
  );
  const id = (await partner("/me")).data.user.id;
  assert.equal(
    (await owner(`/users/${id}`, "PUT", { role: "writer" })).status,
    200,
  );
  const writes = await Promise.all([
    owner("/tasks", "POST", { text: "First" }),
    partner("/tasks", "POST", { text: "Second" }),
  ]);
  assert.ok(writes.every((result) => result.status === 201));
  assert.equal((await visitor("/list")).data.tasks.length, 2);
  assert.equal(
    (await owner("/guests", "POST", { name: "Private test guest" })).status,
    201,
  );
  assert.ok(!("guests" in (await visitor("/list")).data));
  assert.equal((await visitor("/guests")).status, 403);
  assert.equal((await partner("/guests")).data.length, 1);
  await owner(`/users/${id}`, "PUT", { role: "denied" });
  assert.equal((await partner("/guests")).status, 403);
  console.log(
    "Live MongoDB checks passed: concurrent saves, shared reads, access approval and private guests.",
  );
} catch (error) {
  console.error(
    "MongoDB verification failed:",
    error.name,
    "Check Atlas access and database settings.",
  );
  process.exitCode = 1;
} finally {
  if (collection) {
    await collection.drop().catch((error) => {
      if (error.code !== 26) {
        console.error("Temporary verification collection cleanup failed.");
        process.exitCode = 1;
      }
    });
  }
  await client.close();
}
