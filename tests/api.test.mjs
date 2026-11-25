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

test("shared tasks: public read, approval, complete, edit, conflict, revoke, delete", async () => {
  await clear();
  const visitor = client();
  assert.equal(
    (await visitor.call("/tasks", "POST", { text: "Buy milk" })).status,
    403,
  );
  const { owner, partner, user } = await approvedPair();
  const task = await owner.call("/tasks", "POST", { text: "Buy milk" });
  assert.equal(task.status, 201);
  assert.equal(task.data.completed, false);
  const id = task.data.id;
  const publicList = (await visitor.call("/list")).data;
  assert.equal(publicList.user, null);
  assert.equal(publicList.tasks[0].text, "Buy milk");
  assert.equal("pendingCount" in publicList, false);
  assert.equal(
    (await partner.call(`/tasks/${id}`, "PUT", { version: 1, completed: true }))
      .status,
    200,
  );
  assert.equal((await visitor.call("/list")).data.tasks[0].completed, true);
  assert.equal(
    (
      await partner.call(`/tasks/${id}`, "PUT", {
        version: 1,
        text: "Stale edit",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await owner.call(`/tasks/${id}`, "PUT", {
        version: 2,
        completed: "false",
      })
    ).status,
    400,
  );
  assert.equal(
    (await owner.call(`/tasks/${id}`, "PUT", { version: 2, text: "" })).status,
    400,
  );
  assert.equal(
    (
      await owner.call(`/tasks/${id}`, "PUT", {
        version: 2,
        text: "Buy oat milk",
      })
    ).status,
    200,
  );
  assert.equal(
    (await visitor.call("/list")).data.tasks[0].text,
    "Buy oat milk",
  );
  await owner.call(`/users/${user.id}`, "PUT", { role: "pending" });
  assert.equal((await owner.call("/list")).data.pendingCount, 1);
  assert.equal(
    (
      await partner.call(`/tasks/${id}`, "PUT", {
        version: 3,
        completed: false,
      })
    ).status,
    403,
  );
  assert.equal(
    (await partner.call(`/tasks/${id}`, "DELETE", { version: 3 })).status,
    403,
  );
  assert.equal(
    (await owner.call(`/tasks/${id}`, "DELETE", { version: 3 })).status,
    200,
  );
  assert.equal((await visitor.call("/list")).data.tasks.length, 0);
});

test("existing notes remain readable as tasks with their original details", async () => {
  await clear();
  const owner = client();
  await owner.call("/setup", "POST", credentials);
  await owner.call("/notes", "POST", draft);
  const list = (await owner.call("/list")).data;
  assert.equal(list.tasks[0].text, draft.title);
  assert.equal(list.tasks[0].details, draft.body);
  assert.equal(list.tasks[0].completed, false);
  await owner.call("/tasks/" + list.tasks[0].id, "PUT", {
    version: 1,
    completed: true,
  });
  assert.equal((await owner.call("/list")).data.tasks[0].details, draft.body);
});

test("sangeet: legacy JSON, public read, approvals, validation, concurrent edits and separate tasks", async () => {
  await clear();
  const { owner, partner, user } = await approvedPair();
  const visitor = client();
  const pending = client();
  await pending.call("/register", "POST", {
    name: "Guest",
    username: "guest",
    password: "guest-test-password",
  });
  await owner.call("/tasks", "POST", { text: "Buy wedding outfits" });
  // Existing deployed notebooks predate this collection.
  await db.update((state) => {
    delete state.sangeet;
  });
  assert.deepEqual((await visitor.call("/list")).data.sangeet, []);
  const draft = { name: "Alex & Jamie", song: "Kala Chashma" };
  for (const reader of [visitor, pending])
    assert.equal((await reader.call("/sangeet", "POST", draft)).status, 403);
  for (const invalid of [
    { name: "", song: "Song" },
    { name: "Alex", song: "  " },
    { name: "Alex", song: "x".repeat(161) },
  ])
    assert.equal((await owner.call("/sangeet", "POST", invalid)).status, 400);
  const created = await partner.call("/sangeet", "POST", draft);
  assert.equal(created.status, 201);
  const { id, version } = created.data;
  const list = (await visitor.call("/list")).data;
  assert.deepEqual(list.sangeet, [{ id, ...draft, version }]);
  assert.equal(list.tasks.length, 1);
  assert.equal(list.tasks[0].text, "Buy wedding outfits");
  for (const reader of [visitor, pending]) {
    assert.equal(
      (await reader.call(`/sangeet/${id}`, "PUT", { ...draft, version }))
        .status,
      403,
    );
    assert.equal(
      (await reader.call(`/sangeet/${id}`, "DELETE", { version })).status,
      403,
    );
  }
  const changes = await Promise.all([
    owner.call(`/sangeet/${id}`, "PUT", {
      ...draft,
      song: "London Thumakda",
      version,
    }),
    partner.call(`/sangeet/${id}`, "PUT", {
      ...draft,
      song: "Gallan Goodiyaan",
      version,
    }),
  ]);
  assert.deepEqual(changes.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await owner.call(`/sangeet/${id}`, "DELETE", { version })).status,
    409,
  );
  await owner.call(`/users/${user.id}`, "PUT", { role: "pending" });
  assert.equal(
    (await partner.call(`/sangeet/${id}`, "PUT", { ...draft, version: 2 }))
      .status,
    403,
  );
  assert.equal(
    (await owner.call(`/sangeet/${id}`, "DELETE", { version: 2 })).status,
    200,
  );
  assert.equal((await visitor.call("/list")).data.tasks.length, 1);
  assert.deepEqual((await visitor.call("/list")).data.sangeet, []);
});

test("owner recovery requires setup token, revokes old sessions, preserves data and signs in", async () => {
  await clear();
  const { owner, partner } = await approvedPair();
  await owner.call("/tasks", "POST", { text: "Keep this task" });
  const recovery = client();
  const next = "new-owner-password";
  assert.equal(
    (
      await recovery.call("/recover", "POST", {
        setupToken: "wrong",
        newPassword: next,
      })
    ).status,
    403,
  );
  assert.equal((await owner.call("/me")).data.user.role, "owner");
  assert.equal(
    (
      await recovery.call("/recover", "POST", {
        setupToken: credentials.setupToken,
        newPassword: "short",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await recovery.call(
        "/recover",
        "POST",
        { setupToken: credentials.setupToken, newPassword: next },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  const secret = process.env.SETUP_TOKEN;
  try {
    delete process.env.SETUP_TOKEN;
    assert.equal(
      (
        await recovery.call("/recover", "POST", {
          setupToken: "",
          newPassword: next,
        })
      ).status,
      503,
    );
  } finally {
    process.env.SETUP_TOKEN = secret;
  }
  const result = await recovery.call("/recover", "POST", {
    setupToken: credentials.setupToken,
    newPassword: next,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { ok: true });
  assert.equal((await recovery.call("/me")).data.user.role, "owner");
  assert.equal((await owner.call("/me")).data.user, null);
  assert.equal(
    (await owner.call("/tasks", "POST", { text: "Stale session" })).status,
    403,
  );
  assert.equal((await partner.call("/me")).data.user.role, "writer");
  assert.equal(
    (await recovery.call("/list")).data.tasks[0].text,
    "Keep this task",
  );
  const login = client();
  assert.equal((await login.call("/login", "POST", credentials)).status, 401);
  assert.equal(
    (await login.call("/login", "POST", { ...credentials, password: next }))
      .status,
    200,
  );
  assert.ok(!(await db.read()).users.some((u) => u.password === next));
});

test("owner recovery attempts are limited and persist across clients", async () => {
  await clear();
  await client().call("/setup", "POST", credentials);
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await client().call("/recover", "POST", {
          setupToken: "wrong",
          newPassword: "new-test-password",
        })
      ).status,
      403,
    );
  assert.equal(
    (
      await client().call("/recover", "POST", {
        setupToken: credentials.setupToken,
        newPassword: "new-test-password",
      })
    ).status,
    429,
  );
});

test("owner resets others without granting access; denial removes pending badge and blocks edits", async () => {
  await clear();
  const { owner, partner, user } = await approvedPair();
  const visitor = client();
  const ownerId = (await owner.call("/me")).data.user.id;
  const path = `/users/${user.id}/password`;
  const newPassword = "partner-reset-password";
  for (const reader of [visitor, partner]) {
    assert.equal((await reader.call(path, "PUT", { newPassword })).status, 403);
    assert.equal(
      (await reader.call(`/users/${user.id}`, "PUT", { role: "denied" }))
        .status,
      403,
    );
  }
  assert.equal(
    (await owner.call(`/users/${ownerId}/password`, "PUT", { newPassword }))
      .status,
    404,
  );
  assert.equal(
    (await owner.call(`/users/${ownerId}`, "PUT", { role: "denied" })).status,
    404,
  );
  assert.equal(
    (await owner.call(path, "PUT", { newPassword: "short" })).status,
    400,
  );
  assert.equal((await partner.call("/me")).data.user.role, "writer");
  assert.equal((await owner.call(path, "PUT", { newPassword })).status, 200);
  assert.equal((await partner.call("/me")).data.user, null);
  assert.equal(
    (await partner.call("/login", "POST", partnerCredentials)).status,
    401,
  );
  assert.equal(
    (
      await partner.call("/login", "POST", {
        ...partnerCredentials,
        password: newPassword,
      })
    ).status,
    200,
  );
  assert.equal((await partner.call("/me")).data.user.role, "writer");
  await owner.call(`/users/${user.id}`, "PUT", { role: "pending" });
  assert.equal((await owner.call("/list")).data.pendingCount, 1);
  assert.equal(
    (await owner.call(`/users/${user.id}`, "PUT", { role: "denied" })).status,
    200,
  );
  assert.equal((await owner.call("/list")).data.pendingCount, 0);
  assert.equal((await partner.call("/me")).data.user.role, "denied");
  assert.equal((await partner.call("/list")).status, 200);
  assert.equal(
    (await partner.call("/tasks", "POST", { text: "No" })).status,
    403,
  );
  assert.equal(
    (await partner.call("/sangeet", "POST", { name: "No", song: "No" })).status,
    403,
  );
  assert.equal((await owner.call(path, "PUT", { newPassword })).status, 200);
  await partner.call("/login", "POST", {
    ...partnerCredentials,
    password: newPassword,
  });
  assert.equal((await partner.call("/me")).data.user.role, "denied");
  assert.equal(
    (await owner.call(`/users/${user.id}`, "PUT", { role: "writer" })).status,
    200,
  );
  assert.equal(
    (await partner.call("/tasks", "POST", { text: "Allowed again" })).status,
    201,
  );
});
