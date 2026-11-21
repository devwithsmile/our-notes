"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Feather,
  FolderOpen,
  Globe2,
  Heart,
  LayoutGrid,
  List,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Pin,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Trash2,
  Users,
  WifiOff,
  X,
} from "lucide-react";

const collections = [
  { name: "Everyday", subtitle: "The little things", color: "sage" },
  { name: "Ideas", subtitle: "A spark worth keeping", color: "peach" },
  { name: "Plans", subtitle: "Things to look forward to", color: "blue" },
  { name: "Memories", subtitle: "Keep the good parts", color: "lilac" },
];
const colors = Object.fromEntries(collections.map((c) => [c.name, c.color]));
const initials = (name) =>
  name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "?";
const canWrite = (user) => ["owner", "writer"].includes(user?.role);
const dateLabel = (date) =>
  new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

async function api(path, method = "GET", data) {
  const res = await fetch(`/api${path}`, {
    method,
    cache: "no-store",
    headers:
      method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-Notes-Request": "1" },
    body: method === "GET" ? undefined : JSON.stringify(data || {}),
  });
  const result = await res.json();
  if (!res.ok) {
    const error = new Error(result.error || "Something went wrong. Try again.");
    error.status = res.status;
    throw error;
  }
  return result;
}

function Modal({ title, children, onClose, wide = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""} ${className}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <div className="modal-title-wrap">
          <span className="small-logo">
            <Feather size={17} />
          </span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function AuthModal({ mode: initialMode, session, onClose, onDone }) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setup = mode === "setup";
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/${mode}`,
        "POST",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      await onDone(mode);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        setup
          ? "Make this space yours"
          : mode === "register"
            ? "A seat at the table"
            : "Welcome home"
      }
      onClose={() => !busy && onClose()}
    >
      <div className="auth-art">
        <BookOpen size={38} strokeWidth={1.2} />
        <span className="art-star star-one">✳</span>
        <span className="art-star star-two">✳</span>
      </div>
      <p className="modal-intro">
        {setup
          ? "One shared notebook. A world of little things. Create your owner account to get started."
          : mode === "register"
            ? "Ask to be part of this notebook. Once the owner approves you, you can write here too."
            : "Your thoughts have a place here. Sign in to pick up where you left off."}
      </p>
      <form onSubmit={submit}>
        {mode !== "login" && (
          <label>
            Your name
            <input
              name="name"
              placeholder="What should we call you?"
              required
              maxLength={60}
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Username
          <input
            name="username"
            placeholder="your.username"
            required
            minLength={3}
            maxLength={64}
            pattern="[A-Za-z0-9_.\-]+"
            autoComplete="username"
            autoCapitalize="none"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            placeholder="At least 10 characters"
            required
            minLength={10}
            maxLength={256}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
        </label>
        {setup && (
          <>
            <label>
              Private setup key
              <input
                type="password"
                name="setupToken"
                required
                autoComplete="off"
                placeholder="Your SETUP_TOKEN"
              />
            </label>
            <p className="field-help">
              Use the SETUP_TOKEN from your server settings.{" "}
              {session.setupConfigured ? (
                "This key is only needed once."
              ) : (
                <>
                  For local setup, run <code>npm run setup:key</code> and
                  restart the app.
                </>
              )}
            </p>
          </>
        )}
        <p className="form-error" role="alert">
          {error}
        </p>
        <button
          className="button primary full-width"
          type="submit"
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <LockKeyhole size={16} />
          )}
          {setup
            ? "Create our notebook"
            : mode === "register"
              ? "Request writing access"
              : "Sign in"}
        </button>
      </form>
      {!setup && (
        <p className="auth-switch">
          {mode === "login"
            ? "New to this notebook?"
            : "Already part of the story?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Request access" : "Sign in"}
          </button>
        </p>
      )}
      <div className="privacy-footnote">
        <Globe2 size={14} /> Anyone can read. Only approved people can write.
      </div>
    </Modal>
  );
}

function NoteEditor({ note, category, user, onClose, onSaved, notify }) {
  const original = useMemo(
    () => ({
      title: note?.title || "",
      body: note?.body || "",
      category: note?.category || category || "Everyday",
      pinned: note?.pinned || false,
    }),
    [note, category],
  );
  const [draft, setDraft] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const [writable] = useState(() => canWrite(user));
  const change = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setConfirmDiscard(false);
  };
  useEffect(() => {
    const guard = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  async function save(e, asCopy = false) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await api(
        note && !asCopy ? `/notes/${note.id}` : "/notes",
        note && !asCopy ? "PUT" : "POST",
        { ...draft, version: note?.version },
      );
      onSaved(saved);
      notify(asCopy ? "Saved as a separate note." : "Your note is saved.");
    } catch (e) {
      setError(e.message);
      setConflict([409, 404].includes(e.status));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/notes/${note.id}`, "DELETE", { version: note.version });
      onSaved();
      notify("Note deleted.");
    } catch (e) {
      setError(e.message);
      setConflict([409, 404].includes(e.status));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }
  async function copyText() {
    try {
      await navigator.clipboard.writeText(`${draft.title}\n\n${draft.body}`);
      notify("Your text is copied.");
    } catch {
      setError(
        "Clipboard access is unavailable. Select the text and copy it manually.",
      );
    }
  }
  return (
    <Modal
      title={
        writable
          ? note
            ? "A thought, continued"
            : "A fresh page"
          : "From our notebook"
      }
      onClose={() => {
        if (busy) return;
        if (dirty) setConfirmDiscard(true);
        else onClose();
      }}
      wide
      className="editor-modal"
    >
      {!writable ? (
        <article className={`reading-view ${colors[note.category]}`}>
          <span className={`collection-tag ${colors[note.category]}`}>
            <span className="collection-dot" />
            {note.category}
          </span>
          <h2>{note.title}</h2>
          <div className="reading-byline">
            <span className="avatar small">{initials(note.author)}</span>By{" "}
            {note.author}
            <span>·</span>
            {dateLabel(note.updated_at)}
          </div>
          <div className="reading-body">
            {note.body || "A thought waiting to unfold."}
          </div>
          <div className="reading-footer">
            <Globe2 size={15} />
            Open to read<span>{wordCount(note.body)} words</span>
          </div>
        </article>
      ) : (
        <form onSubmit={save} className="editor-form">
          <div className="editor-meta">
            <label className="sr-only" htmlFor="note-category">
              Collection
            </label>
            <div className="select-wrap">
              <select
                id="note-category"
                value={draft.category}
                onChange={(e) => change("category", e.target.value)}
              >
                {collections.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
            <button
              type="button"
              className={`pin-toggle ${draft.pinned ? "is-pinned" : ""}`}
              onClick={() => change("pinned", !draft.pinned)}
              aria-pressed={draft.pinned}
            >
              <Pin size={16} />
              {draft.pinned ? "Pinned" : "Pin note"}
            </button>
          </div>
          <label className="sr-only" htmlFor="note-title">
            Note title
          </label>
          <input
            id="note-title"
            className="editor-title"
            value={draft.title}
            onChange={(e) => change("title", e.target.value)}
            required
            maxLength={160}
            placeholder="Give this thought a name…"
            autoFocus
          />
          <label className="sr-only" htmlFor="note-body">
            Your note
          </label>
          <textarea
            id="note-body"
            className="editor-body"
            value={draft.body}
            onChange={(e) => change("body", e.target.value)}
            maxLength={100000}
            placeholder="A passing thought. A plan for the weekend. Something you don’t want to forget.\n\nThere’s room for it all here."
          />
          <div className="editor-details">
            <span>
              {note
                ? `Written by ${note.author} · Edited by ${note.editor}`
                : `Writing as ${user?.name || "a signed-out account"}`}
            </span>
            <span>{wordCount(draft.body)} words</span>
          </div>
          {error && (
            <div className="conflict-message" role="alert">
              <p>{error}</p>
              {conflict && (
                <div className="inline-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={copyText}
                  >
                    <Copy size={15} />
                    Copy my text
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || !draft.title.trim()}
                    onClick={() => save(null, true)}
                  >
                    Save as new note
                  </button>
                </div>
              )}
            </div>
          )}
          {confirmDiscard && (
            <div className="confirm-bar" role="alert">
              <span>You have unsaved changes. Discard them?</span>
              <button type="button" onClick={() => setConfirmDiscard(false)}>
                Keep writing
              </button>
              <button type="button" className="danger-text" onClick={onClose}>
                Discard
              </button>
            </div>
          )}
          {confirmDelete && (
            <div className="confirm-bar" role="alert">
              <span>Delete this note for everyone?</span>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
              >
                Keep note
              </button>
              <button
                type="button"
                className="danger-text"
                onClick={remove}
                disabled={busy}
              >
                Yes, delete
              </button>
            </div>
          )}
          <div className="editor-footer">
            <div>
              {note ? (
                <button
                  type="button"
                  className="icon-button delete-button"
                  aria-label="Delete note"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                >
                  <Trash2 size={18} />
                </button>
              ) : (
                <span className="editor-note">
                  <Globe2 size={14} />
                  Visible to everyone
                </span>
              )}
            </div>
            <div className="inline-actions">
              <span className="save-status">
                {dirty
                  ? "Unsaved changes"
                  : note
                    ? "Up to date"
                    : "Make it yours"}
              </span>
              <button
                type="submit"
                className="button primary"
                disabled={busy || !draft.title.trim()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Check size={17} />
                )}
                Save note
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

function PeopleModal({ onClose, notify }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const load = useCallback(
    () =>
      api("/users")
        .then(setPeople)
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);
  async function update(person) {
    setBusy(person.id);
    setError("");
    try {
      await api(`/users/${person.id}`, "PUT", {
        role: person.role === "writer" ? "pending" : "writer",
      });
      await load();
      notify(
        person.role === "writer"
          ? "Writing access revoked."
          : `${person.name} can now write.`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  async function invite() {
    try {
      await navigator.clipboard.writeText(location.origin);
      notify("Notebook link copied. Share it with your partner.");
    } catch {
      setError(`Share this address: ${location.origin}`);
    }
  }
  return (
    <Modal title="Our circle" onClose={onClose}>
      <p className="modal-intro">
        A shared space, with people you choose. Approved writers can add, edit,
        and delete notes together.
      </p>
      <div className="invite-card">
        <span className="invite-icon">
          <Users size={22} />
        </span>
        <div>
          <strong>Better with your people</strong>
          <p>Share the link. They request access. You approve.</p>
        </div>
        <button
          className="icon-button"
          onClick={invite}
          aria-label="Copy invitation link"
        >
          <Copy size={19} />
        </button>
      </div>
      <div className="people-heading">
        PEOPLE IN THIS NOTEBOOK <span>{people?.length || 0}</span>
      </div>
      {!people && !error && (
        <div className="loading-row">
          <LoaderCircle className="spin" size={18} />
          Loading your circle…
        </div>
      )}
      {people?.map((person) => (
        <div className="person-row" key={person.id}>
          <span
            className={`avatar ${person.role === "owner" ? "owner-avatar" : ""}`}
          >
            {initials(person.name)}
          </span>
          <div className="person-name">
            <strong>{person.name}</strong>
            <span>
              @{person.username} ·{" "}
              {person.role === "pending"
                ? "Awaiting approval"
                : person.role === "owner"
                  ? "Notebook owner"
                  : "Approved writer"}
            </span>
          </div>
          {person.role === "owner" ? (
            <ShieldCheck size={20} className="owner-shield" />
          ) : (
            <button
              className={`button small-button ${person.role === "pending" ? "primary" : "secondary"}`}
              disabled={busy === person.id}
              onClick={() => update(person)}
            >
              {busy === person.id ? (
                <LoaderCircle className="spin" size={14} />
              ) : person.role === "pending" ? (
                "Approve"
              ) : (
                "Revoke"
              )}
            </button>
          )}
        </div>
      ))}
      <p className="form-error" role="alert">
        {error}
      </p>
      <div className="privacy-footnote">
        <Globe2 size={14} /> Reading is open to anyone with the link.
      </div>
    </Modal>
  );
}

function AccountModal({ user, onClose, onSignOut, notify }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function changePassword(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      await api("/password", "PUT", Object.fromEntries(new FormData(form)));
      form.reset();
      notify("Password updated. Other devices have been signed out.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Your little corner" onClose={onClose}>
      <div className="account-profile">
        <span className="avatar big-avatar">{initials(user.name)}</span>
        <div>
          <h3>{user.name}</h3>
          <p>
            @{user.username} ·{" "}
            {user.role === "pending" ? "Awaiting approval" : user.role}
          </p>
        </div>
      </div>
      <h3 className="small-heading">Change your password</h3>
      <form onSubmit={changePassword}>
        <label>
          Current password
          <input
            type="password"
            name="currentPassword"
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          New password
          <input
            type="password"
            name="newPassword"
            required
            minLength={10}
            maxLength={256}
            autoComplete="new-password"
            placeholder="At least 10 characters"
          />
        </label>
        <p className="form-error" role="alert">
          {error}
        </p>
        <div className="account-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onSignOut}
            disabled={busy}
          >
            <LogOut size={16} />
            Sign out
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={15} />}Update password
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Notebook() {
  const [session, setSession] = useState({ user: null, needsSetup: false });
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sync, setSync] = useState("loading");
  const [filter, setFilter] = useState("All notes");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState("grid");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const searchRef = useRef(null);
  const toastTimer = useRef();
  const fetching = useRef(false);
  const notify = useCallback((message) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  }, []);
  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const { notes: list, ...state } = await api("/snapshot");
      setSession(state);
      setNotes(list);
      setLoadError("");
      setSync("synced");
    } catch (e) {
      setLoadError(e.message);
      setSync("offline");
    } finally {
      setLoading(false);
      fetching.current = false;
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 5000);
    const offline = () => setSync("offline");
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      clearTimeout(toastTimer.current);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  useEffect(() => {
    const key = (e) => {
      if (
        e.key === "/" &&
        !modal &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal]);
  function selectFilter(name) {
    setFilter(name);
    setMobileNav(false);
  }
  function startNote() {
    if (canWrite(session.user)) setModal({ type: "note", note: null });
    else if (session.user)
      notify("Your writing request is waiting for the owner’s approval.");
    else setModal({ type: session.needsSetup ? "setup" : "login" });
  }
  const filtered = useMemo(
    () =>
      notes
        .filter(
          (n) =>
            (filter === "All notes" ||
              (filter === "Pinned" ? n.pinned : n.category === filter)) &&
            `${n.title} ${n.body} ${n.author}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            (sort === "title"
              ? a.title.localeCompare(b.title)
              : new Date(b[sort === "created" ? "created_at" : "updated_at"]) -
                new Date(a[sort === "created" ? "created_at" : "updated_at"])),
        ),
    [notes, filter, query, sort],
  );
  const authors = [...new Set(notes.map((n) => n.author))];
  const pending = session.user?.role === "pending";
  const collection = collections.find((c) => c.name === filter);
  async function signedIn(mode) {
    setModal(null);
    await refresh();
    notify(
      mode === "register"
        ? "Your request is with the owner. Make yourself at home."
        : "Welcome to your little space.",
    );
  }
  async function signOut() {
    try {
      await api("/logout", "POST");
      setModal(null);
      await refresh();
      notify("You’re signed out.");
    } catch (e) {
      notify(e.message);
    }
  }

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <a className="brand" href="/" aria-label="Our Notes home">
          <span className="brand-mark">
            n<span>.</span>
          </span>
          <span>our notes</span>
          <span className="brand-flower" aria-hidden="true">
            ✳
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Heart size={20} strokeWidth={1.5} />
          </span>
          <div>
            <strong>Our little space</strong>
            <span>A shared notebook</span>
          </div>
          <ChevronDown size={14} className="workspace-chevron" />
        </div>
        <div className="nav-section-label">YOUR LIBRARY</div>
        <nav className="library-nav" aria-label="Notebook navigation">
          <button
            className={`nav-item ${filter === "All notes" ? "active" : ""}`}
            onClick={() => selectFilter("All notes")}
          >
            <BookOpen size={19} />
            <span>All notes</span>
            <span className="nav-count">{notes.length}</span>
          </button>
          <button
            className={`nav-item ${filter === "Pinned" ? "active" : ""}`}
            onClick={() => selectFilter("Pinned")}
          >
            <Pin size={18} />
            <span>Pinned</span>
            {notes.some((n) => n.pinned) && (
              <span className="nav-count">
                {notes.filter((n) => n.pinned).length}
              </span>
            )}
          </button>
          <div className="nav-section-label collections-label">
            COLLECTIONS <FolderOpen size={13} />
          </div>
          {collections.map((c) => (
            <button
              key={c.name}
              className={`nav-item ${filter === c.name ? "active" : ""}`}
              onClick={() => selectFilter(c.name)}
            >
              <span className={`nav-dot ${c.color}`} />
              <span>{c.name}</span>
              <span className="collection-count">
                {notes.filter((n) => n.category === c.name).length || ""}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-quote">
            <Sprout size={27} strokeWidth={1.3} />
            <p>
              Little thoughts.
              <br />A life together.
            </p>
            <span>A place for all of it.</span>
          </div>
          {session.user?.role === "owner" && (
            <button
              className="nav-item manage-people"
              onClick={() => setModal({ type: "people" })}
            >
              <Users size={18} />
              <span>Our circle</span>
              <Settings2 size={14} />
            </button>
          )}
          <div className="sharing-note">
            <span className="sharing-icon">
              <Globe2 size={18} />
            </span>
            <div>
              <strong>Open to read, yours to write.</strong>
              <span>A notebook with a trusted circle.</span>
            </div>
          </div>
          <button
            className="account-button"
            onClick={() =>
              setModal({
                type: session.user
                  ? "account"
                  : session.needsSetup
                    ? "setup"
                    : "login",
              })
            }
          >
            <span className={`avatar ${session.user ? "owner-avatar" : ""}`}>
              {session.user ? initials(session.user.name) : <Users size={17} />}
            </span>
            <span className="account-text">
              <strong>{session.user?.name || "Make yourself at home"}</strong>
              <span>
                {session.user
                  ? pending
                    ? "Awaiting approval"
                    : session.user.role === "owner"
                      ? "Notebook owner"
                      : "Approved writer"
                  : "Sign in to start writing"}
              </span>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Our little space</span>
            <ChevronRight size={13} />
            <strong>{filter}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`sync-status ${sync}`}
              title={
                sync === "synced"
                  ? "Checks for saved changes every 5 seconds"
                  : "Waiting for a connection"
              }
            >
              {sync === "offline" ? (
                <WifiOff size={14} />
              ) : sync === "loading" ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <CheckCheck size={15} />
              )}
              <span>
                {sync === "offline"
                  ? "Connection lost"
                  : sync === "loading"
                    ? "Connecting"
                    : "Up to date"}
              </span>
            </span>
            <span className="public-pill">
              <Globe2 size={13} />
              Public reading
            </span>
          </div>
        </header>
        <div className="page-content">
          <section className="page-intro">
            <div>
              <p className="eyebrow">
                <span className="eyebrow-line" />
                LIFE, IN LITTLE NOTES
              </p>
              <h1>
                {filter === "All notes" ? (
                  <>
                    A little space for <em>us.</em>
                  </>
                ) : filter === "Pinned" ? (
                  <>
                    Keep the good ones <em>close.</em>
                  </>
                ) : (
                  <>
                    {filter}
                    <em>.</em>
                  </>
                )}
              </h1>
              <p className="page-subtitle">
                {collection
                  ? collection.subtitle + ". Give them a place to stay."
                  : filter === "Pinned"
                    ? "The thoughts you want to come back to, all in one place."
                    : "Thoughts to keep. Plans to make. Moments to remember."}
              </p>
            </div>
            <button
              className="button primary new-note-button"
              onClick={startNote}
              disabled={loading}
            >
              <Plus size={19} />
              New note
            </button>
          </section>
          {session.needsSetup && (
            <div className="welcome-banner">
              <div className="banner-icon">
                <Sparkles size={21} />
              </div>
              <div>
                <strong>A fresh notebook, waiting for you.</strong>
                <p>
                  Create your owner account, then invite someone to fill these
                  pages with you.
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => setModal({ type: "setup" })}
              >
                Set up our space
              </button>
            </div>
          )}
          {pending && (
            <div className="welcome-banner">
              <span className="banner-icon">
                <Heart size={21} />
              </span>
              <div>
                <strong>Your seat is saved.</strong>
                <p>
                  The owner will approve your writing access. Until then, enjoy
                  the notebook.
                </p>
              </div>
              <span className="status-label">Request pending</span>
            </div>
          )}
          {loadError && (
            <div className="connection-banner" role="alert">
              <WifiOff size={18} />
              <span>
                {notes.length
                  ? "Connection interrupted. Showing the last saved notes. Your open draft is safe."
                  : loadError}
              </span>
              <button onClick={refresh}>Try again</button>
            </div>
          )}
          <div className="toolbar">
            <label className="search-field">
              <Search size={18} />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a thought, a plan, a memory…"
                aria-label="Search notes"
              />
              <kbd>/</kbd>
            </label>
            <div className="sort-select">
              <label htmlFor="sort" className="sr-only">
                Sort notes
              </label>
              <select
                id="sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="updated">Last updated</option>
                <option value="created">Newest first</option>
                <option value="title">Title A–Z</option>
              </select>
              <ChevronDown size={14} />
            </div>
            <div className="view-switch" aria-label="Note layout">
              <button
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                className={view === "grid" ? "selected" : ""}
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={17} />
              </button>
              <button
                aria-label="List view"
                aria-pressed={view === "list"}
                className={view === "list" ? "selected" : ""}
                onClick={() => setView("list")}
              >
                <List size={19} />
              </button>
            </div>
          </div>
          <div className="notes-heading">
            <h2>
              {query ? "Search results" : filter}
              <span>{filtered.length}</span>
            </h2>
            <div className="notes-heading-right">
              {authors.length > 0 && (
                <div
                  className="author-stack"
                  aria-label={`Written by ${authors.join(", ")}`}
                >
                  {authors.slice(0, 3).map((a) => (
                    <span key={a} title={a}>
                      {initials(a)}
                    </span>
                  ))}
                </div>
              )}
              <span>A few words go a long way.</span>
            </div>
          </div>
          {loading ? (
            <div className="notes-grid" aria-label="Loading notes">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="skeleton-card" key={i}>
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : filtered.length ? (
            <div className={`notes-grid ${view === "list" ? "list-view" : ""}`}>
              {filtered.map((note) => (
                <button
                  key={note.id}
                  className={`note-card ${colors[note.category]}`}
                  onClick={() => setModal({ type: "note", note })}
                >
                  <div className="card-top">
                    <span className={`collection-tag ${colors[note.category]}`}>
                      <span className="collection-dot" />
                      {note.category}
                    </span>
                    <span className="card-pin">
                      {note.pinned && <Pin size={15} aria-label="Pinned" />}
                    </span>
                  </div>
                  <h3>{note.title}</h3>
                  <p className="card-excerpt">
                    {note.body || "A thought waiting to unfold…"}
                  </p>
                  <div className="card-bottom">
                    <span className="card-author">
                      <span className="avatar tiny-avatar">
                        {initials(note.author)}
                      </span>
                      {note.author}
                    </span>
                    <time dateTime={note.updated_at}>
                      {dateLabel(note.updated_at)}
                    </time>
                  </div>
                </button>
              ))}
              {!query && canWrite(session.user) && (
                <button className="new-note-card" onClick={startNote}>
                  <span>
                    <Plus size={24} strokeWidth={1.4} />
                  </span>
                  <strong>Room for one more thought</strong>
                  <p>Big ideas. Little things. Anything.</p>
                </button>
              )}
            </div>
          ) : (
            !loadError && (
              <section className="empty-state">
                <div className="empty-illustration" aria-hidden="true">
                  <div className="illustration-leaf">
                    <Sprout size={45} strokeWidth={1.2} />
                  </div>
                  <div className="illustration-paper paper-back" />
                  <div className="illustration-paper paper-front">
                    <Heart size={24} strokeWidth={1.2} />
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="illustration-spark">✳</span>
                </div>
                <p className="eyebrow">
                  {query
                    ? "LET’S LOOK AGAIN"
                    : filter === "Pinned"
                      ? "YOUR FAVORITES LIVE HERE"
                      : "THE BEGINNING OF SOMETHING GOOD"}
                </p>
                <h2>
                  {query
                    ? "That thought isn’t here yet."
                    : filter === "Pinned"
                      ? "Some notes deserve a little pin."
                      : notes.length
                        ? "A little room for something new."
                        : "Every story starts with a note."}
                </h2>
                <p>
                  {query
                    ? "Try a different word, an author’s name, or another collection."
                    : filter === "Pinned"
                      ? "Pin a note in the editor, and it’ll be right here when you need it."
                      : "A passing thought, a weekend plan, a little something for each other.\nGive it a place to stay."}
                </p>
                {query ? (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery("");
                      setFilter("All notes");
                    }}
                  >
                    Clear search & filters
                  </button>
                ) : filter === "Pinned" ? (
                  <button
                    className="button secondary"
                    onClick={() => selectFilter("All notes")}
                  >
                    Explore all notes
                  </button>
                ) : (
                  <button className="button primary" onClick={startNote}>
                    <Feather size={17} />
                    Write our first note
                  </button>
                )}
                <div className="empty-bottom">
                  <span>
                    <Globe2 size={14} />
                    Open to read
                  </span>
                  <span>
                    <ShieldCheck size={14} />
                    Written by your circle
                  </span>
                  <span>
                    <Heart size={14} />
                    Made for sharing
                  </span>
                </div>
              </section>
            )
          )}
          {!loading &&
            !notes.length &&
            !query &&
            filter === "All notes" &&
            !loadError && (
              <div className="collection-prompts">
                {collections.map((c) => (
                  <button
                    key={c.name}
                    className={`collection-prompt ${c.color}`}
                    onClick={() => selectFilter(c.name)}
                  >
                    <span className={`nav-dot ${c.color}`} />
                    <div>
                      <strong>{c.name}</strong>
                      <p>{c.subtitle}</p>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            )}
          <footer className="page-footer">
            <span>
              Made for the things you don’t want to forget.
              <Heart size={12} />
            </span>
            <button onClick={() => setModal({ type: "about" })}>
              <CircleHelp size={14} />
              How this space works
            </button>
          </footer>
        </div>
      </main>
      {modal && ["login", "register", "setup"].includes(modal.type) && (
        <AuthModal
          mode={modal.type}
          session={session}
          onClose={() => setModal(null)}
          onDone={signedIn}
        />
      )}
      {modal?.type === "note" && (
        <NoteEditor
          note={modal.note}
          category={collection?.name}
          user={session.user}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
          notify={notify}
        />
      )}
      {modal?.type === "people" && (
        <PeopleModal onClose={() => setModal(null)} notify={notify} />
      )}
      {modal?.type === "account" && session.user && (
        <AccountModal
          user={session.user}
          onClose={() => setModal(null)}
          onSignOut={signOut}
          notify={notify}
        />
      )}
      {modal?.type === "about" && (
        <Modal
          title="One notebook. Different places."
          onClose={() => setModal(null)}
        >
          <div className="about-illustration">
            <BookOpen size={38} strokeWidth={1.2} />
            <Heart size={20} />
          </div>
          <p className="modal-intro">
            Your shared corner of the internet, wherever you both happen to be.
          </p>
          <div className="about-step">
            <Globe2 size={21} />
            <div>
              <h3>Same link, different devices</h3>
              <p>
                Open the same deployed notebook URL on any computer or phone.
                All your notes live in one shared notebook.
              </p>
            </div>
          </div>
          <div className="about-step">
            <Users size={21} />
            <div>
              <h3>Your people, your permission</h3>
              <p>
                Anyone can read. Create an account to request writing access.
                The owner approves people in Our circle.
              </p>
            </div>
          </div>
          <div className="about-step">
            <CheckCheck size={21} />
            <div>
              <h3>Saved here, seen there</h3>
              <p>
                Save a note and it appears on the other device within about 5
                seconds while the notebook is open. If you edit the same note,
                we’ll help you keep both versions.
              </p>
            </div>
          </div>
          <div className="privacy-footnote">
            <LockKeyhole size={14} />
            {session.storage === "cloud"
              ? "This notebook uses a private JSON storage on Vercel."
              : "This notebook currently runs on a local JSON file."}
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
