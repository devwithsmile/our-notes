"use client";
import SectionTabs, { sections } from "./SectionTabs";
import SangeetList from "./SangeetList";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  ClipboardList,
  Copy,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";

async function api(path, method = "GET", data) {
  const response = await fetch("/api" + path, {
    method,
    cache: "no-store",
    headers:
      method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-Notes-Request": "1" },
    body: method === "GET" ? undefined : JSON.stringify(data || {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Please try again.");
    error.status = response.status;
    throw error;
  }
  return result;
}
function Dialog({ title, children, close }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="dialog-header">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Close">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function SignIn({ setup, initialMode, close, done }) {
  const [mode, setMode] = useState(setup ? "setup" : initialMode || "login");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const titles = {
    setup: "Create your owner account",
    login: "Sign in",
    register: "Request editing access",
  };
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        "/" + mode,
        "POST",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      await done();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={titles[mode]} close={() => !busy && close()}>
      <p className="dialog-description">
        {mode === "setup"
          ? "You’ll decide who can edit this list."
          : mode === "register"
            ? "The owner will approve your request. Until then, you can view everything."
            : "Sign in to edit the shared list."}
      </p>
      <form onSubmit={submit}>
        {mode !== "login" && (
          <label>
            Your name
            <input name="name" required maxLength={60} autoComplete="name" />
          </label>
        )}
        <label>
          Username
          <input
            name="username"
            required
            minLength={3}
            maxLength={64}
            autoComplete="username"
            autoCapitalize="none"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            required
            minLength={10}
            maxLength={256}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            placeholder="At least 10 characters"
          />
        </label>
        {mode === "setup" && (
          <label>
            Owner setup key
            <input
              name="setupToken"
              type="password"
              required
              autoComplete="off"
            />
            <small>
              One-time key from your .env.local file or Vercel settings.
            </small>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy && <LoaderCircle size={17} className="spin" />}
          {titles[mode]}
        </button>
      </form>
      {!setup && (
        <button
          className="text-button auth-switch"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "Need permission? Request access"
            : "Already have an account? Sign in"}
        </button>
      )}
    </Dialog>
  );
}
function Access({ close, updated }) {
  const [people, setPeople] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    try {
      setPeople(await api("/users"));
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);
  async function change(person) {
    setBusy(person.id);
    setError("");
    try {
      await api("/users/" + person.id, "PUT", {
        role: person.role === "writer" ? "pending" : "writer",
      });
      await load();
      updated();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Dialog title="Who can edit?" close={close}>
      <p className="dialog-description">
        Everyone can view the list. You choose who can make changes.
      </p>
      {!people && !error && <p className="muted">Loading people…</p>}
      {people?.map((person) => (
        <div className="person" key={person.id}>
          <span className="avatar">
            {person.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{person.name}</strong>
            <small>
              @{person.username} ·{" "}
              {person.role === "owner"
                ? "You · Owner"
                : person.role === "writer"
                  ? "Can edit"
                  : "Waiting for approval"}
            </small>
          </div>
          {person.role !== "owner" && (
            <button
              className={`button ${person.role === "pending" ? "primary" : "secondary"}`}
              onClick={() => change(person)}
              disabled={busy === person.id}
            >
              {busy === person.id
                ? "Saving…"
                : person.role === "writer"
                  ? "Remove access"
                  : "Approve"}
            </button>
          )}
        </div>
      ))}
      {people?.length === 1 && (
        <p className="invite-help">
          Share the list’s link. Your partner can sign in and request editing
          access here.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
export default function TodoList() {
  const [data, setData] = useState({
    user: null,
    tasks: [],
    sangeet: [],
    needsSetup: false,
    pendingCount: 0,
  });
  const [loading, setLoading] = useState(true),
    [offline, setOffline] = useState(false);
  const [error, setError] = useState(""),
    [modal, setModal] = useState(null),
    [text, setText] = useState("");
  const [busy, setBusy] = useState(null),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null);
  const [activeSection, setActiveSection] = useState("tasks");
  const section = sections.find((item) => item.id === activeSection);
  const [toast, setToast] = useState("");
  const timer = useRef(null),
    addInput = useRef(null),
    requestId = useRef(0);
  const writable = ["owner", "writer"].includes(data.user?.role);
  const remaining = data.tasks.filter((t) => !t.completed).length;
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await api("/list");
      if (id === requestId.current) {
        setData(next);
        setOffline(false);
      }
    } catch {
      if (id === requestId.current) setOffline(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const visibleRefresh = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = setInterval(visibleRefresh, 5000);
    document.addEventListener("visibilitychange", visibleRefresh);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", visibleRefresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  useEffect(() => {
    const guard = (e) => {
      if (text.trim() || (editing && editing.text !== editing.task.text)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [text, editing]);
  function notify(message) {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3000);
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(location.origin);
      notify("Link copied. Share it with your partner.");
    } catch {
      setError("Share this link: " + location.origin);
    }
  }
  async function add(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy("new");
    setError("");
    try {
      const added = await api("/tasks", "POST", { text });
      setData((d) => ({
        ...d,
        tasks: [...d.tasks.filter((t) => t.id !== added.id), added],
      }));
      setText("");
      await refresh();
      addInput.current?.focus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  async function update(task, changes, method = "PUT") {
    setBusy(task.id);
    setError("");
    const toggling = typeof changes.completed === "boolean";
    if (toggling)
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === task.id ? { ...t, completed: changes.completed } : t,
        ),
      }));
    try {
      const changed = await api("/tasks/" + task.id, method, {
        ...changes,
        version: task.version,
      });
      setData((d) => ({
        ...d,
        tasks:
          method === "DELETE"
            ? d.tasks.filter((t) => t.id !== task.id)
            : d.tasks.map((t) => (t.id === task.id ? changed : t)),
      }));
      setEditing(null);
      setDeleting(null);
      await refresh();
    } catch (e) {
      if (toggling)
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) =>
            t.id === task.id && t.version === task.version
              ? { ...t, completed: task.completed }
              : t,
          ),
        }));
      setError(e.message);
      await refresh();
    } finally {
      setBusy(null);
    }
  }
  async function signOut() {
    try {
      await api("/logout", "POST");
      setModal(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  const sorted = [...data.tasks].sort(
    (a, b) =>
      Number(a.completed) - Number(b.completed) ||
      Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Check size={22} strokeWidth={2.5} />
          </span>
          together<span className="brand-period">.</span>
        </a>
        <div className="top-actions">
          <button className="button secondary share-button" onClick={share}>
            <Copy size={16} />
            <span>Share list</span>
          </button>
          {data.user ? (
            <>
              <span className="signed-in">{data.user.name}</span>
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={signOut}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            !data.needsSetup && (
              <button
                className="button primary"
                disabled={loading || offline}
                onClick={() => setModal("auth")}
              >
                Sign in
              </button>
            )
          )}
        </div>
      </header>
      <main>
        <SectionTabs active={activeSection} onChange={setActiveSection} />
        <section className="intro">
          <span className="eyebrow">A LITTLE LESS TO REMEMBER</span>
          <h1>
            {section.title}
            <span>.</span>
          </h1>
          <p>{section.description}</p>
        </section>
        <div className="access-bar">
          <span>
            <Users size={17} />
            {data.needsSetup
              ? "Set up your list to get started."
              : data.user?.role === "pending"
                ? "Your editing request is waiting for approval."
                : writable
                  ? "You can edit this list."
                  : "Everyone can view. Editing is by permission."}
          </span>
          {data.needsSetup ? (
            <button className="text-button" onClick={() => setModal("auth")}>
              Set up list
            </button>
          ) : data.user?.role === "owner" ? (
            <button className="text-button" onClick={() => setModal("access")}>
              Manage access
              {data.pendingCount > 0 && (
                <b className="request-count">{data.pendingCount}</b>
              )}
            </button>
          ) : (
            !data.user && (
              <button
                className="text-button"
                onClick={() => setModal("request")}
              >
                Request access
              </button>
            )
          )}
        </div>
        {offline && (
          <div className="notice" role="alert">
            <span>
              Can’t connect right now. Your unsaved text is still here.
            </span>
            <button className="text-button" onClick={refresh}>
              Try again
            </button>
          </div>
        )}
        {error && (
          <div className="notice error-notice" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div
          id="panel-tasks"
          role="tabpanel"
          aria-labelledby="tab-tasks"
          hidden={activeSection !== "tasks"}
          tabIndex={0}
        >
          <section className="list-card" aria-label="Shared tasks">
            <div className="list-heading">
              <h2>
                Things to do <span>{remaining}</span>
              </h2>
              <span className="sync-status">
                {loading ? (
                  "Loading…"
                ) : offline ? (
                  "Offline"
                ) : (
                  <>
                    <CheckCheck size={15} />
                    Synced
                  </>
                )}
              </span>
            </div>
            {writable && (
              <form className="add-task" onSubmit={add}>
                <Plus size={21} />
                <label className="sr-only" htmlFor="new-task">
                  New task
                </label>
                <input
                  id="new-task"
                  ref={addInput}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={160}
                  placeholder="What needs to get done?"
                  disabled={busy === "new"}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="button primary"
                  disabled={!text.trim() || !!busy}
                >
                  {busy === "new" ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    "Add task"
                  )}
                </button>
              </form>
            )}
            {loading ? (
              <div className="empty">
                <LoaderCircle className="spin" size={25} />
                <p>Loading your shared list…</p>
              </div>
            ) : sorted.length ? (
              <ul className="task-list">
                {sorted.map((task) => (
                  <li
                    className={`task-row ${task.completed ? "completed" : ""}`}
                    key={task.id}
                  >
                    <label className="task-check">
                      <input
                        type="checkbox"
                        aria-label={`Mark ${task.text} as ${task.completed ? "not done" : "done"}`}
                        checked={task.completed}
                        disabled={!writable || !!busy || !!editing}
                        onChange={() =>
                          update(task, { completed: !task.completed })
                        }
                      />
                      <span aria-hidden="true">
                        {task.completed && (
                          <Check size={15} strokeWidth={2.5} />
                        )}
                      </span>
                    </label>
                    {editing?.task.id === task.id ? (
                      <form
                        className="edit-task"
                        onSubmit={(e) => {
                          e.preventDefault();
                          update(editing.task, { text: editing.text });
                        }}
                      >
                        <label className="sr-only" htmlFor={"edit-" + task.id}>
                          Edit task
                        </label>
                        <input
                          id={"edit-" + task.id}
                          value={editing.text}
                          maxLength={160}
                          autoFocus
                          onChange={(e) =>
                            setEditing({ ...editing, text: e.target.value })
                          }
                        />
                        <div>
                          <button
                            className="text-button"
                            type="submit"
                            disabled={
                              !!busy || !writable || !editing.text.trim()
                            }
                          >
                            Save
                          </button>
                          <button
                            className="text-button muted"
                            type="button"
                            disabled={!!busy}
                            onClick={() => {
                              setEditing(null);
                              setError("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="task-content">
                        <span className="task-title">{task.text}</span>
                        {task.details && (
                          <p className="task-details">{task.details}</p>
                        )}
                        <small>Added by {task.author}</small>
                      </div>
                    )}
                    {writable &&
                      !editing &&
                      (deleting === task.id ? (
                        <div className="delete-confirm">
                          <span>Delete?</span>
                          <button
                            className="text-button danger"
                            disabled={!!busy}
                            onClick={() => update(task, {}, "DELETE")}
                          >
                            Yes
                          </button>
                          <button
                            className="text-button muted"
                            onClick={() => setDeleting(null)}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="task-actions">
                          <button
                            className="icon-button"
                            aria-label={`Edit ${task.text}`}
                            disabled={!!busy}
                            onClick={() => {
                              setEditing({ task, text: task.text });
                              setDeleting(null);
                              setError("");
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button delete-button"
                            aria-label={`Delete ${task.text}`}
                            disabled={!!busy}
                            onClick={() => setDeleting(task.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">
                <span className="empty-icon">
                  <ClipboardList size={30} strokeWidth={1.5} />
                </span>
                <h3>A fresh start.</h3>
                <p>
                  {writable
                    ? "Add your first task above. You’ll both see it here."
                    : "No tasks yet. Anything added to this list will appear here."}
                </p>
              </div>
            )}
            <div className="list-footer">
              <span>
                {remaining} {remaining === 1 ? "task" : "tasks"} left
              </span>
              <span>{data.tasks.length - remaining} completed</span>
            </div>
          </section>
        </div>
        <div
          id="panel-sangeet"
          role="tabpanel"
          aria-labelledby="tab-sangeet"
          hidden={activeSection !== "sangeet"}
          tabIndex={0}
        >
          <SangeetList
            entries={data.sangeet || []}
            writable={writable}
            loading={loading}
            offline={offline}
            api={api}
            refresh={refresh}
          />
        </div>
        <p className="page-footer">
          Together, wherever you are. Changes appear automatically.
        </p>
      </main>
      {["auth", "request"].includes(modal) && (
        <SignIn
          initialMode={modal === "request" ? "register" : "login"}
          setup={data.needsSetup}
          close={() => setModal(null)}
          done={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}
      {modal === "access" && (
        <Access close={() => setModal(null)} updated={refresh} />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
