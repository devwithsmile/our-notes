import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { BlobError, BlobPreconditionFailedError } from "@vercel/blob";
import { createStore, blobStore, emptyState } from "../lib/store.mjs";
import { handleApi } from "../lib/api.mjs";
const run = promisify(execFile);

function fakeBlob(initial = null) {
  let text = initial ? JSON.stringify(initial) : null;
  let version = 1;
  const sdk = {
    BlobError,
    BlobPreconditionFailedError,
    reads: 0,
    writes: 0,
    conflicts: 0,
    beforePut: null,
    inspect: () => (text === null ? null : JSON.parse(text)),
    replace: (value) => {
      text = value;
      version++;
    },
    async get(path, options) {
      assert.equal(path, "test/notebook.json");
      assert.equal(options.access, "private");
      assert.equal(
        options.useCache,
        false,
        "stale CDN reads must never be used for authorization or writes",
      );
      sdk.reads++;
      const snapshot = text,
        etag = String(version);
      await delay(2);
      return snapshot === null
        ? null
        : {
            statusCode: 200,
            stream: new Response(snapshot).body,
            blob: { etag, size: Buffer.byteLength(snapshot) },
          };
    },
    async put(path, body, options) {
      assert.equal(path, "test/notebook.json");
      assert.equal(options.access, "private");
      assert.equal(options.addRandomSuffix, false);
      assert.equal(options.contentType, "application/json");
      await delay(2);
      if (sdk.beforePut) {
        const callback = sdk.beforePut;
        sdk.beforePut = null;
        callback();
      }
      if (text !== null && options.allowOverwrite === false) {
        sdk.conflicts++;
        throw new BlobError("This blob already exists");
      }
      if (text !== null) {
        assert.equal(
          typeof options.ifMatch,
          "string",
          "overwrites must always be conditional",
        );
        if (options.ifMatch !== String(version)) {
          sdk.conflicts++;
          throw new BlobPreconditionFailedError();
        }
      } else
        assert.equal(
          options.allowOverwrite,
          false,
          "initial creation must not overwrite a competing first write",
        );
      text = body;
      version++;
      sdk.writes++;
      return { etag: String(version) };
    },
  };
  return sdk;
}
const cloud = (sdk) =>
  blobStore({ sdk, pathname: "test/notebook.json", retryDelay: false });
const importRecord = (source) => ({
  source,
  imported_at: new Date().toISOString(),
});

test("local JSON is durable, private, and atomically updated across separate processes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "notes-json-"));
  const file = join(dir, "notebook.json");
  try {
    const first = await createStore({ file });
    await first.update((s) =>
      s.rateLimits.push({
        key: "counter",
        count: 1,
        expires_at: new Date(Date.now() + 900000).toISOString(),
      }),
    );
    await Promise.all(
      Array.from({ length: 4 }, () =>
        run(process.execPath, ["tests/fixtures/json-writer.mjs", file]),
      ),
    );
    const reopened = await createStore({ file });
    assert.equal((await reopened.read()).rateLimits[0].count, 49);
    const disk = JSON.parse(await readFile(file, "utf8"));
    assert.equal(disk.schemaVersion, 1);
    assert.equal(disk.revision, 49);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const before = await readFile(file, "utf8");
    await assert.rejects(
      first.update((s) => {
        s.notes.push({ invalid: true });
        throw new Error("Stop");
      }),
      /Stop/,
    );
    assert.equal(await readFile(file, "utf8"), before);
    await writeFile(file, "{damaged");
    await assert.rejects(
      first.update((s) => s.imports.push(importRecord("bad"))),
      /could not be read/,
    );
    assert.equal(await readFile(file, "utf8"), "{damaged");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Blob first-write races and concurrent updates preserve both changes", async () => {
  const sdk = fakeBlob();
  const a = cloud(sdk),
    b = cloud(sdk);
  await Promise.all([
    a.update((s) => s.imports.push(importRecord("first"))),
    b.update((s) => s.imports.push(importRecord("second"))),
  ]);
  assert.equal(sdk.inspect().imports.length, 2);
  assert.ok(sdk.conflicts > 0);
  await Promise.all([
    a.update((s) => s.imports.push(importRecord("third"))),
    b.update((s) => s.imports.push(importRecord("fourth"))),
  ]);
  assert.equal(sdk.inspect().imports.length, 4);
  assert.equal(sdk.inspect().revision, 4);
  const reads = sdk.reads,
    writes = sdk.writes;
  await a.read();
  await a.read();
  assert.equal(sdk.reads, reads + 2);
  assert.equal(sdk.writes, writes, "polling never writes to storage");
});

test("Blob rejects corrupt data, never replaces it, and limits retry exhaustion", async () => {
  const sdk = fakeBlob();
  sdk.replace("{not valid JSON");
  await assert.rejects(
    cloud(sdk).update((s) => s.imports.push(importRecord("test"))),
    /could not be read/,
  );
  assert.equal(sdk.writes, 0);
  sdk.replace(JSON.stringify(emptyState()));
  sdk.put = async () => {
    throw new BlobPreconditionFailedError();
  };
  await assert.rejects(
    cloud(sdk).update((s) => s.imports.push(importRecord("test"))),
    /Someone else is saving/,
  );
  assert.equal(sdk.inspect().imports.length, 0);
  const fail = fakeBlob();
  fail.get = async () => {
    throw new BlobError("Service unavailable");
  };
  await assert.rejects(
    cloud(fail).update((s) => s.imports.push(importRecord("test"))),
    /Service unavailable/,
  );
  assert.equal(fail.writes, 0);
});

function client(store) {
  let cookie = "";
  return async (path, method = "GET", data = {}) => {
    const res = await handleApi(
      new Request("http://localhost:3000/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Notes-Request": "1",
          Cookie: cookie,
        },
        body: method === "GET" ? undefined : JSON.stringify(data),
      }),
      store,
    );
    if (res.headers.has("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    return { status: res.status, data: await res.json() };
  };
}

test("independent cloud instances enforce edit conflicts and recheck revocation on a CAS retry", async () => {
  process.env.SETUP_TOKEN =
    "cloud-test-private-setup-key-at-least-32-characters";
  const sdk = fakeBlob();
  const owner = client(cloud(sdk)),
    partner = client(cloud(sdk)),
    visitor = client(cloud(sdk));
  assert.equal(
    (
      await owner("/setup", "POST", {
        name: "Owner",
        username: "owner",
        password: "owner-password",
        setupToken: process.env.SETUP_TOKEN,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await partner("/register", "POST", {
        name: "Partner",
        username: "partner",
        password: "partner-password",
      })
    ).status,
    200,
  );
  const user = (await partner("/me")).data.user;
  await owner("/users/" + user.id, "PUT", { role: "writer" });
  const input = {
    title: "Shared thought",
    body: "Original",
    category: "Everyday",
  };
  const note = (await owner("/notes", "POST", input)).data;
  const results = await Promise.all([
    owner("/notes/" + note.id, "PUT", { ...input, body: "One", version: 1 }),
    partner("/notes/" + note.id, "PUT", { ...input, body: "Two", version: 1 }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const current = (await visitor("/notes")).data[0];
  assert.equal(current.version, 2);
  assert.equal((await visitor("/me")).data.user, null);
  assert.equal((await visitor("/users")).status, 403);
  assert.ok(
    !JSON.stringify((await visitor("/notes")).data).includes("password"),
  );
  sdk.beforePut = () => {
    const external = sdk.inspect();
    external.users.find((u) => u.id === user.id).role = "pending";
    external.revision++;
    sdk.replace(JSON.stringify(external));
  };
  assert.equal(
    (
      await partner("/notes/" + note.id, "PUT", {
        ...input,
        body: "Must not save",
        version: 2,
      })
    ).status,
    403,
  );
  assert.equal((await visitor("/notes")).data[0].body, current.body);
  assert.equal((await partner("/me")).data.user.role, "pending");
  delete process.env.SETUP_TOKEN;
});
