import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, emptyState } from "../lib/store.mjs";
import { handleApi } from "../lib/api.mjs";
import { digest, hashPassword } from "../lib/security.mjs";

process.env.SETUP_TOKEN =
  "test-only-private-owner-setup-token-at-least-32-characters";
const credentials = {
  name: "Owner",
  username: "owner",
  password: "owner-test-password",
  setupToken: process.env.SETUP_TOKEN,
};
const partnerCredentials = {
  name: "Partner",
  username: "partner",
  password: "partner-test-password",
};
const draft = {
  title: "A weekend together",
  body: "Coffee, a long walk, and no plans.",
  category: "Plans",
};
let db, folder;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "our-notes-api-"));
  db = await createStore({ file: join(folder, "notes.json") });
});
after(async () => {
  await rm(folder, { recursive: true, force: true });
});
async function clear() {
  await db.update((state) => Object.assign(state, emptyState()));
}
function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async call(path, method = "GET", data, extraHeaders = {}) {
      const request = new Request(`http://localhost:3000/api${path}`, {
        method,
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-Notes-Request": "1",
          Origin: "http://localhost:3000",
          ...extraHeaders,
        },
        body: method === "GET" ? undefined : JSON.stringify(data || {}),
      });
      const response = await handleApi(request, db);
      if (response.headers.has("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      return {
        status: response.status,
        data: await response.json(),
        headers: response.headers,
      };
    },
  };
}
async function approvedPair() {
  const owner = client(),
    partner = client();
  assert.equal((await owner.call("/setup", "POST", credentials)).status, 200);
  assert.equal(
    (await partner.call("/register", "POST", partnerCredentials)).status,
    200,
  );
  const {
    data: { user },
  } = await partner.call("/me");
  assert.equal(
    (await owner.call(`/users/${user.id}`, "PUT", { role: "writer" })).status,
    200,
  );
  return { owner, partner, user };
}

test("independent clients: public reading, pending approval, shared writes, immediate revocation", async () => {
  await clear();
  const visitor = client();
  assert.deepEqual((await visitor.call("/notes")).data, []);
  assert.equal((await visitor.call("/notes", "POST", draft)).status, 403);
  assert.equal(
    (await visitor.call("/register", "POST", partnerCredentials)).status,
    403,
  );
  const owner = client(),
    partner = client();
  assert.equal((await owner.call("/setup", "POST", credentials)).status, 200);
  assert.equal(
    (await partner.call("/register", "POST", partnerCredentials)).status,
    200,
  );
  const {
    data: { user },
  } = await partner.call("/me");
  assert.equal(user.role, "pending");
  assert.equal((await partner.call("/notes", "POST", draft)).status, 403);
  assert.equal((await partner.call("/users")).status, 403);
  assert.equal(
    (await partner.call(`/users/${user.id}`, "PUT", { role: "writer" })).status,
    403,
  );
  assert.equal(
    (await owner.call(`/users/${user.id}`, "PUT", { role: "writer" })).status,
    200,
  );
  const created = await partner.call("/notes", "POST", draft);
  assert.equal(created.status, 201);
  const id = created.data.id;
  const read = await visitor.call("/notes");
  assert.equal(read.data[0].author, "Partner");
  assert.equal(read.data[0].body, draft.body);
  assert.equal(read.headers.get("cache-control"), "no-store");
  assert.equal(
    (
      await owner.call(`/notes/${id}`, "PUT", {
        ...draft,
        version: 1,
        pinned: true,
      })
    ).status,
    200,
  );
  assert.equal((await partner.call("/notes")).data[0].editor, "Owner");
  assert.equal(
    (await owner.call(`/users/${user.id}`, "PUT", { role: "pending" })).status,
    200,
  );
  assert.equal((await partner.call("/notes", "POST", draft)).status, 403);
  assert.equal(
    (await partner.call(`/notes/${id}`, "PUT", { ...draft, version: 2 }))
      .status,
    403,
  );
  assert.equal(
    (await partner.call(`/notes/${id}`, "DELETE", { version: 2 })).status,
    403,
  );
  assert.equal((await partner.call("/notes")).status, 200);
  assert.equal(
    (await owner.call(`/notes/${id}`, "DELETE", { version: 2 })).status,
    200,
  );
  assert.equal((await visitor.call("/notes")).data.length, 0);
});

test("simultaneous edits: exactly one wins; losing client can save a separate copy", async () => {
  await clear();
  const { owner, partner } = await approvedPair();
  const { data: note } = await owner.call("/notes", "POST", draft);
  const results = await Promise.all([
    owner.call(`/notes/${note.id}`, "PUT", {
      ...draft,
      title: "Owner version",
      version: 1,
    }),
    partner.call(`/notes/${note.id}`, "PUT", {
      ...draft,
      title: "Partner version",
      version: 1,
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const saved = (await owner.call("/notes")).data[0];
  assert.equal(saved.version, 2);
  assert.equal(
    (await owner.call(`/notes/${note.id}`, "DELETE", { version: 1 })).status,
    409,
  );
  assert.equal(
    (
      await partner.call("/notes", "POST", {
        ...draft,
        title: "My preserved copy",
      })
    ).status,
    201,
  );
  assert.equal((await owner.call("/notes")).data.length, 2);
});

test("owner bootstrap is secret-protected and only one owner can exist", async () => {
  await clear();
  const one = client(),
    two = client();
  assert.equal(
    (await one.call("/setup", "POST", { ...credentials, setupToken: "wrong" }))
      .status,
    403,
  );
  const result = await Promise.all([
    one.call("/setup", "POST", credentials),
    two.call("/setup", "POST", { ...credentials, username: "owner2" }),
  ]);
  assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await db.read()).users.filter((u) => u.role === "owner").length,
    1,
  );
  assert.equal((await one.call("/setup", "POST", credentials)).status, 409);
});

test("request validation, CSRF defenses, safe text, owner role immutability", async () => {
  await clear();
  const { owner } = await approvedPair();
  assert.equal(
    (
      await owner.call("/notes", "POST", draft, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await owner.call("/notes", "POST", draft, { "X-Notes-Request": "" }))
      .status,
    403,
  );
  assert.equal(
    (
      await owner.call("/notes", "POST", draft, {
        "Sec-Fetch-Site": "cross-site",
      })
    ).status,
    403,
  );
  assert.equal(
    (await owner.call("/notes", "POST", { ...draft, title: "" })).status,
    400,
  );
  assert.equal(
    (await owner.call("/notes", "POST", { ...draft, category: "Bad category" }))
      .status,
    400,
  );
  assert.equal(
    (await owner.call("/notes", "POST", { ...draft, body: "x".repeat(450001) }))
      .status,
    413,
  );
  const scriptText = '<script>alert("not executable")</script>';
  const { data: note } = await owner.call("/notes", "POST", {
    ...draft,
    body: scriptText,
  });
  assert.equal(note.body, scriptText);
  assert.equal(
    (await owner.call(`/notes/${note.id}`, "PUT", { ...draft, version: "1" }))
      .status,
    400,
  );
  const {
    data: { user },
  } = await owner.call("/me");
  assert.equal(
    (await owner.call(`/users/${user.id}`, "PUT", { role: "pending" })).status,
    404,
  );
  assert.equal(
    (await owner.call("/notes/not-a-uuid", "DELETE", { version: 1 })).status,
    404,
  );
  assert.equal(
    (
      await owner.call("/notes", "POST", draft, {
        Cookie: "our_notes_session=forged",
      })
    ).status,
    403,
  );
});

test("password hashing, cookie flags, expiry, password change and session invalidation", async () => {
  await clear();
  const owner = client(),
    otherDevice = client();
  const response = await owner.call("/setup", "POST", credentials);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  const [stored] = (await db.read()).users;
  assert.notEqual(stored.password, credentials.password);
  assert.match(stored.password, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(
    (await otherDevice.call("/login", "POST", credentials)).status,
    200,
  );
  assert.equal(
    (
      await owner.call("/password", "PUT", {
        currentPassword: "wrong",
        newPassword: "replacement-password",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await owner.call("/password", "PUT", {
        currentPassword: credentials.password,
        newPassword: "replacement-password",
      })
    ).status,
    200,
  );
  assert.equal((await otherDevice.call("/me")).data.user, null);
  assert.equal((await owner.call("/me")).data.user.role, "owner");
  assert.equal(
    (await otherDevice.call("/login", "POST", credentials)).status,
    401,
  );
  assert.equal(
    (
      await otherDevice.call("/login", "POST", {
        ...credentials,
        password: "replacement-password",
      })
    ).status,
    200,
  );
  await owner.call("/logout", "POST");
  assert.equal((await owner.call("/me")).data.user, null);
  await db.update((state) => {
    for (const s of state.sessions) s.expires_at = new Date(0).toISOString();
  });
  assert.equal((await otherDevice.call("/me")).data.user, null);
});

test("rate limits are persisted and enforced across independent clients", async () => {
  await clear();
  const owner = client();
  await owner.call("/setup", "POST", credentials);
  for (let i = 0; i < 14; i++)
    assert.equal(
      (
        await client().call("/login", "POST", {
          ...credentials,
          password: "incorrect-password",
        })
      ).status,
      401,
    );
  assert.equal(
    (await client().call("/login", "POST", credentials)).status,
    429,
  );
});

test("Vercel cannot silently fall back to ephemeral local storage", async () => {
  process.env.VERCEL = "1";
  try {
    await assert.rejects(
      createStore({ file: "/tmp/notes.json" }),
      /cannot be used on Vercel/,
    );
    await assert.rejects(createStore(), /private Vercel Blob store/);
  } finally {
    delete process.env.VERCEL;
  }
});

test("same-origin checks use the browser-facing Host, not Next’s internal bind address", async () => {
  await clear();
  const request = new Request("http://0.0.0.0:3000/api/setup", {
    method: "POST",
    headers: {
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      "X-Notes-Request": "1",
    },
    body: JSON.stringify(credentials),
  });
  assert.equal((await handleApi(request, db)).status, 200);
});

test("Vercel sessions are secure and setup fails closed without a private key", async () => {
  await clear();
  const secret = process.env.SETUP_TOKEN;
  process.env.SETUP_TOKEN = "";
  assert.equal(
    (await client().call("/setup", "POST", credentials)).status,
    503,
  );
  process.env.SETUP_TOKEN = secret;
  process.env.VERCEL = "1";
  try {
    const response = await client().call("/setup", "POST", credentials);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /; Secure/);
  } finally {
    delete process.env.VERCEL;
  }
});

test("combined refresh exposes notes and safe profile fields, never private JSON records", async () => {
  await clear();
  const owner = client(),
    visitor = client();
  await owner.call("/setup", "POST", credentials);
  await owner.call("/notes", "POST", draft);
  const authenticated = await owner.call("/snapshot");
  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.data.user.role, "owner");
  assert.deepEqual(Object.keys(authenticated.data.user).sort(), [
    "id",
    "name",
    "role",
    "username",
  ]);
  const publicSnapshot = await visitor.call("/snapshot");
  assert.equal(publicSnapshot.data.user, null);
  assert.equal(publicSnapshot.data.notes[0].title, draft.title);
  assert.equal(publicSnapshot.data.needsSetup, false);
  assert.equal(publicSnapshot.headers.get("cache-control"), "no-store");
  for (const key of ["users", "sessions", "rateLimits", "imports"])
    assert.equal(key in publicSnapshot.data, false);
  assert.ok(
    !JSON.stringify(publicSnapshot.data).includes(
      (await db.read()).users[0].password,
    ),
  );
});
