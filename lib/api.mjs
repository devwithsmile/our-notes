import {
  songCategories,
  linkCategories,
  safeLink,
  listEntry,
} from "./lists.mjs";
import { randomBytes, randomUUID } from "node:crypto";
import { getStore, StorageError } from "./store.mjs";
import {
  ApiError,
  digest,
  safeEqual,
  hashPassword,
  verifyPassword,
  field,
  noteFields,
  readJson,
} from "./security.mjs";

const COOKIE = "our_notes_session";
const json = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
const outcome = (data, status = 200, headers = {}) => ({
  data,
  status,
  headers,
});
const publicUser = (user) =>
  user
    ? { id: user.id, name: user.name, username: user.username, role: user.role }
    : null;
const sessionCookie = (token, age, secure) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? "; Secure" : ""}`;
const uuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value || "",
  );
const expires = (ms) => new Date(Date.now() + ms).toISOString();
function currentUser(state, token) {
  const session = state.sessions.find(
    (s) => s.token === token && Date.parse(s.expires_at) > Date.now(),
  );
  return session ? state.users.find((u) => u.id === session.user_id) : null;
}
function createSession(state, id, secure) {
  const token = randomBytes(32).toString("base64url");
  state.sessions.push({
    token: digest(token),
    user_id: id,
    expires_at: expires(7 * 86400000),
  });
  return { "Set-Cookie": sessionCookie(token, 604800, secure) };
}
function limit(state, key, maximum) {
  let entry = state.rateLimits.find((r) => r.key === key);
  if (!entry) {
    entry = { key, count: 1, expires_at: expires(900000) };
    state.rateLimits.push(entry);
  } else entry.count = Math.min(entry.count + 1, maximum + 1);
  if (entry.count > maximum)
    throw new ApiError(
      429,
      "Too many attempts. Please try again in 15 minutes.",
    );
}
function listNotes(state) {
  const names = new Map(state.users.map((u) => [u.id, u.name]));
  return state.notes
    .map((n) => ({
      ...n,
      author: names.get(n.author_id),
      editor: names.get(n.updated_by),
    }))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
}
function asTask(note, state) {
  return {
    id: note.id,
    text: note.title,
    details: note.body,
    completed: note.completed === true,
    version: note.version,
    author: state.users.find((u) => u.id === note.author_id)?.name,
    created_at: note.created_at,
    updated_at: note.updated_at,
  };
}
function readRoute(state, path, token, storage) {
  const user = currentUser(state, token);
  if (path === "/list")
    return {
      user: publicUser(user),
      needsSetup: !state.users.some((u) => u.role === "owner"),
      songs: (state.songs || []).map((entry) => listEntry("songs", entry)),
      links: (state.links || []).map((entry) => listEntry("links", entry)),
      ...(["owner", "writer"].includes(user?.role)
        ? {
            guests: (state.guests || []).map((entry) =>
              listEntry("guests", entry),
            ),
          }
        : {}),
      sangeet: (state.sangeet || []).map(({ id, name, song, version }) => ({
        id,
        name,
        song,
        version,
      })),
      tasks: state.notes
        .map((n) => asTask(n, state))
        .sort(
          (a, b) =>
            Number(a.completed) - Number(b.completed) ||
            Date.parse(a.created_at) - Date.parse(b.created_at),
        ),
      ...(user?.role === "owner"
        ? {
            pendingCount: state.users.filter((u) => u.role === "pending")
              .length,
          }
        : {}),
    };
  if (["/songs", "/links", "/guests"].includes(path)) {
    const kind = path.slice(1);
    if (kind === "guests" && !["owner", "writer"].includes(user?.role))
      throw new ApiError(403, "Only approved editors can view the guest list.");
    return (state[kind] || []).map((entry) => listEntry(kind, entry));
  }
  if (path === "/snapshot")
    return {
      ...readRoute(state, "/me", token, storage),
      notes: listNotes(state),
    };
  if (path === "/me")
    return {
      user: publicUser(user),
      needsSetup: !state.users.some((u) => u.role === "owner"),
      setupConfigured: (process.env.SETUP_TOKEN || "").length >= 32,
      storage,
    };
  if (path === "/notes") return listNotes(state);
  if (path === "/users") {
    if (user?.role !== "owner")
      throw new ApiError(403, "Only the owner can manage writers.");
    return state.users.map((u) => ({
      ...publicUser(u),
      created_at: u.created_at,
    }));
  }
  throw new ApiError(404, "Not found.");
}

async function mutate(
  state,
  { path, method, data, token, secure, address, mutationId },
) {
  // Authorization is re-evaluated on every CAS retry, including sessions, passwords, and roles.
  const now = Date.now();
  state.sessions = state.sessions.filter((s) => Date.parse(s.expires_at) > now);
  state.rateLimits = state.rateLimits.filter(
    (r) => Date.parse(r.expires_at) > now,
  );
  const user = currentUser(state, token);
  if (path === "/recover" && method === "POST") {
    limit(state, "recovery-ip:" + digest(address), 10);
    const secret = process.env.SETUP_TOKEN || "";
    if (secret.length < 32)
      throw new ApiError(
        503,
        "Owner recovery is not configured. Set SETUP_TOKEN on the server.",
      );
    if (
      !safeEqual(
        typeof data.setupToken === "string" ? data.setupToken : "",
        secret,
      )
    )
      throw new ApiError(403, "The setup token is incorrect.");
    const owner = state.users.find((u) => u.role === "owner");
    if (!owner) throw new ApiError(409, "Create your owner account first.");
    const password = field(data, "newPassword", 10, 256, false);
    owner.password = await hashPassword(password);
    state.sessions = state.sessions.filter((s) => s.user_id !== owner.id);
    state.rateLimits = state.rateLimits.filter(
      (r) => r.key !== "auth-user:" + digest(owner.username),
    );
    return outcome({ ok: true }, 200, createSession(state, owner.id, secure));
  }
  if (["/setup", "/register", "/login"].includes(path) && method === "POST") {
    const username = field(data, "username", 3, 64).toLowerCase();
    if (path !== "/login" && !/^[a-z0-9_.-]+$/.test(username))
      throw new ApiError(
        400,
        "Usernames can contain letters, numbers, dots, hyphens, and underscores.",
      );
    const password = field(data, "password", 10, 256, false);
    limit(state, "auth-ip:" + digest(address), 60);
    limit(state, "auth-user:" + digest(username), 15);
    let account;
    if (path === "/login") {
      account = state.users.find((u) => u.username === username);
      if (!(await verifyPassword(password, account?.password)) || !account)
        throw new ApiError(401, "Incorrect username or password.");
    } else {
      const name = field(data, "name", 1, 60);
      const owner = state.users.some((u) => u.role === "owner");
      if (path === "/setup") {
        const secret = process.env.SETUP_TOKEN || "";
        if (secret.length < 32)
          throw new ApiError(
            503,
            "Owner setup needs a private setup key. Run npm run setup:key locally or set SETUP_TOKEN on Vercel.",
          );
        if (
          !safeEqual(
            typeof data.setupToken === "string" ? data.setupToken : "",
            secret,
          )
        )
          throw new ApiError(
            403,
            "The setup key is incorrect. Use the private key from your server configuration.",
          );
        if (owner)
          throw new ApiError(409, "An owner already exists. Sign in instead.");
      } else if (!owner)
        throw new ApiError(403, "The owner needs to set up this list first.");
      if (state.users.some((u) => u.username === username))
        throw new ApiError(409, "That username is already in use.");
      account = {
        id: mutationId,
        name,
        username,
        password: await hashPassword(password),
        role: path === "/setup" ? "owner" : "pending",
        created_at: new Date().toISOString(),
      };
      state.users.push(account);
    }
    return outcome({ ok: true }, 200, createSession(state, account.id, secure));
  }
  if (path === "/logout" && method === "POST") {
    state.sessions = state.sessions.filter((s) => s.token !== token);
    return outcome({ ok: true }, 200, {
      "Set-Cookie": sessionCookie("", 0, secure),
    });
  }
  if (path === "/password" && method === "PUT") {
    if (!user) throw new ApiError(401, "Sign in first.");
    limit(state, "password:" + user.id, 10);
    const current = field(data, "currentPassword", 1, 256, false);
    const next = field(data, "newPassword", 10, 256, false);
    if (!(await verifyPassword(current, user.password)))
      throw new ApiError(403, "Your current password is incorrect.");
    user.password = await hashPassword(next);
    state.sessions = state.sessions.filter((s) => s.user_id !== user.id);
    return outcome({ ok: true }, 200, createSession(state, user.id, secure));
  }
  const id = path.split("/")[2];
  if (path.startsWith("/users")) {
    if (user?.role !== "owner")
      throw new ApiError(403, "Only the owner can manage writers.");
    if (uuid(id) && path === `/users/${id}/password` && method === "PUT") {
      limit(state, "admin-password:" + user.id, 20);
      const target = state.users.find((u) => u.id === id && u.role !== "owner");
      if (!target) throw new ApiError(404, "User not found.");
      const password = field(data, "newPassword", 10, 256, false);
      target.password = await hashPassword(password);
      state.sessions = state.sessions.filter((s) => s.user_id !== target.id);
      state.rateLimits = state.rateLimits.filter(
        (r) => r.key !== "auth-user:" + digest(target.username),
      );
      return outcome({ ok: true });
    }
    if (uuid(id) && path.split("/").length === 3 && method === "PUT") {
      if (!["writer", "pending", "denied"].includes(data.role))
        throw new ApiError(400, "Choose a valid role.");
      const target = state.users.find((u) => u.id === id && u.role !== "owner");
      if (!target) throw new ApiError(404, "Writer not found.");
      target.role = data.role;
      return outcome({ ok: true });
    }
  }
  const kind = path.split("/")[1];
  if (["sangeet", "songs", "links", "guests"].includes(kind)) {
    if (!["writer", "owner"].includes(user?.role))
      throw new ApiError(
        403,
        "You need the owner's permission to edit this list.",
      );
    const fields = () => {
      const values = { name: field(data, "name", 1, 160) };
      if (kind === "sangeet") values.song = field(data, "song", 1, 160);
      if (kind === "songs" || kind === "links") {
        const categories = kind === "songs" ? songCategories : linkCategories;
        if (!categories.includes(data.category))
          throw new ApiError(400, "Choose a valid category.");
        values.category = data.category;
      }
      if (kind === "links") {
        values.url = field(data, "url", 1, 2048);
        if (!safeLink(values.url))
          throw new ApiError(
            400,
            "Enter a valid http or https link without embedded credentials.",
          );
      }
      return values;
    };
    const publicEntry = (entry) => listEntry(kind, entry);
    if (path === `/${kind}` && method === "POST") {
      const entry = {
        id: mutationId,
        ...fields(),
        version: 1,
        author_id: user.id,
        updated_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      (state[kind] ||= []).push(entry);
      return outcome(publicEntry(entry), 201);
    }
    if (
      uuid(id) &&
      path.split("/").length === 3 &&
      ["PUT", "DELETE"].includes(method)
    ) {
      if (!Number.isInteger(data.version) || data.version < 1)
        throw new ApiError(400, "An entry version is required.");
      const entry = (state[kind] || []).find((item) => item.id === id);
      if (!entry)
        throw new ApiError(404, "This entry was deleted on another device.");
      if (entry.version !== data.version)
        throw new ApiError(
          409,
          "This entry changed on another device. Your edit is still here; cancel to see the latest version.",
        );
      if (method === "DELETE") {
        state[kind] = state[kind].filter((item) => item.id !== id);
        return outcome({ id });
      }
      Object.assign(entry, fields(), {
        version: entry.version + 1,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });
      return outcome(publicEntry(entry));
    }
    throw new ApiError(404, "Not found.");
  }
  if (path === "/tasks" || path.startsWith("/tasks/")) {
    if (!["writer", "owner"].includes(user?.role))
      throw new ApiError(
        403,
        "You need the owner's permission to edit this list.",
      );
    if (path === "/tasks" && method === "POST") {
      const text = field(data, "text", 1, 160);
      const task = {
        id: mutationId,
        title: text,
        body: "",
        category: "Everyday",
        pinned: false,
        completed: false,
        author_id: user.id,
        updated_by: user.id,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.notes.push(task);
      return outcome(asTask(task, state), 201);
    }
    if (
      uuid(id) &&
      path.split("/").length === 3 &&
      ["PUT", "DELETE"].includes(method)
    ) {
      if (!Number.isInteger(data.version) || data.version < 1)
        throw new ApiError(400, "A task version is required.");
      const task = state.notes.find((n) => n.id === id);
      if (!task)
        throw new ApiError(404, "This task was deleted on another device.");
      if (task.version !== data.version)
        throw new ApiError(
          409,
          "This task changed on another device. Your edit is still here; cancel to see the latest version.",
        );
      if (method === "DELETE") {
        state.notes = state.notes.filter((n) => n.id !== id);
        return outcome({ id });
      }
      const updates = {};
      if ("text" in data) updates.title = field(data, "text", 1, 160);
      if ("completed" in data) {
        if (typeof data.completed !== "boolean")
          throw new ApiError(400, "Completed must be true or false.");
        updates.completed = data.completed;
      }
      if (!Object.keys(updates).length)
        throw new ApiError(400, "Choose a task change to save.");
      Object.assign(task, updates, {
        version: task.version + 1,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });
      return outcome(asTask(task, state));
    }
    throw new ApiError(404, "Not found.");
  }
  if (path.startsWith("/notes")) {
    if (!["writer", "owner"].includes(user?.role))
      throw new ApiError(403, "Only approved writers can change notes.");
    if (path === "/notes" && method === "POST") {
      const fields = noteFields(data);
      const note = {
        id: mutationId,
        ...fields,
        author_id: user.id,
        updated_by: user.id,
        pinned: data.pinned === true,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.notes.push(note);
      return outcome(note, 201);
    }
    if (
      uuid(id) &&
      path.split("/").length === 3 &&
      ["PUT", "DELETE"].includes(method)
    ) {
      if (!Number.isInteger(data.version) || data.version < 1)
        throw new ApiError(400, "A valid note version is required.");
      const note = state.notes.find((n) => n.id === id);
      if (!note)
        throw new ApiError(
          404,
          "This note has been deleted. Your unsaved text is still here.",
        );
      if (note.version !== data.version)
        throw new ApiError(
          409,
          "A newer version was saved on another device. Your text is safe here. Copy it or save it as a new note before opening the latest version.",
        );
      if (method === "DELETE") {
        state.notes = state.notes.filter((n) => n.id !== id);
        return outcome({ id });
      }
      const fields = noteFields(data);
      Object.assign(note, fields, {
        pinned: data.pinned === true,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        version: note.version + 1,
      });
      return outcome(note);
    }
  }
  throw new ApiError(404, "Not found.");
}

export async function handleApi(request, suppliedStore) {
  try {
    const path =
      new URL(request.url).pathname.replace(/^\/api/, "").replace(/\/$/, "") ||
      "/";
    const method = request.method;
    const cookie =
      request.headers
        .get("cookie")
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${COOKIE}=`))
        ?.slice(COOKIE.length + 1) || "";
    const token = digest(cookie);
    const data = method === "GET" ? {} : await readJson(request);
    const store = suppliedStore || (await getStore());
    if (method === "GET")
      return json(readRoute(await store.read(), path, token, store.kind));
    const context = {
      path,
      method,
      data,
      token,
      secure:
        Boolean(process.env.VERCEL) ||
        new URL(request.url).protocol === "https:",
      address: process.env.VERCEL
        ? request.headers
            .get("x-vercel-forwarded-for")
            ?.split(",")[0]
            ?.trim() || "unknown"
        : "local",
      mutationId: randomUUID(),
    };
    const result = await store.update(async (state) => {
      try {
        return await mutate(state, context);
      } catch (error) {
        // Failed authentication must still persist attempt counters. Other validation happens before mutation.
        if (error instanceof ApiError)
          return outcome({ error: error.message }, error.status);
        throw error;
      }
    });
    return json(result.data, result.status, result.headers);
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    if (error instanceof StorageError)
      return json({ error: error.message }, 503);
    // Do not log raw provider errors: they can contain private URLs or credentials.
    console.error("[Our Notes storage]", error.name || "Error");
    return json(
      {
        error:
          "The notebook could not be saved or loaded. Check your private Blob connection or local JSON file, then try again.",
      },
      503,
    );
  }
}
