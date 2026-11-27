"use client";
import { useEffect, useState } from "react";
import {
  CheckCheck,
  ExternalLink,
  Link2,
  LockKeyhole,
  Music2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { songCategories, linkCategories } from "../lib/lists.mjs";

const configurations = {
  songs: {
    title: "Our song collection",
    label: "Song name",
    add: "Add song",
    noun: "songs",
    icon: Music2,
    categories: songCategories,
    empty: "Let’s build our playlist.",
    hint: "Save a song and choose its language.",
  },
  links: {
    title: "Saved links",
    label: "Link name",
    add: "Save link",
    noun: "links",
    icon: Link2,
    categories: linkCategories,
    empty: "All your finds, in one place.",
    hint: "Save outfits, ideas, and anything else for the celebrations.",
  },
  guests: {
    title: "Our guests",
    label: "Guest name",
    add: "Add guest",
    noun: "guests",
    icon: LockKeyhole,
    empty: "The people we want beside us.",
    hint: "Add a guest’s name to start your private list.",
  },
};
function Fields({ kind, value, change, disabled }) {
  const config = configurations[kind];
  return (
    <>
      <label>
        {config.label}
        <input
          value={value.name}
          onChange={(e) => change({ ...value, name: e.target.value })}
          required
          maxLength={160}
          disabled={disabled}
          autoComplete="off"
          placeholder={
            kind === "links" ? "e.g. Wedding outfit ideas" : config.label
          }
        />
      </label>
      {kind === "links" && (
        <label>
          Link URL
          <input
            type="url"
            value={value.url}
            onChange={(e) => change({ ...value, url: e.target.value })}
            required
            maxLength={2048}
            placeholder="https://…"
            disabled={disabled}
            autoComplete="off"
          />
        </label>
      )}
      {config.categories && (
        <label>
          Category
          <select
            value={value.category}
            onChange={(e) => change({ ...value, category: e.target.value })}
            disabled={disabled}
          >
            {config.categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
export default function EntryList({
  kind,
  entries,
  writable,
  loading,
  offline,
  api,
  refresh,
}) {
  const config = configurations[kind];
  const Icon = config.icon;
  const blank = { name: "", url: "", category: config.categories?.[0] || "" };
  const [draft, setDraft] = useState(blank),
    [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("All"),
    [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  let visible = entries.filter(
    (entry) => filter === "All" || entry.category === filter,
  );
  if (editing && !visible.some((entry) => entry.id === editing.entry.id))
    visible = [...visible, editing.entry];
  useEffect(() => {
    const guard = (event) => {
      if (draft.name || draft.url || editing) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [draft, editing]);
  async function save(method, entry, fields) {
    if (busy || !writable || (method === "POST" && editing)) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api(`/${kind}${entry ? "/" + entry.id : ""}`, method, {
        ...fields,
        ...(entry ? { version: entry.version } : {}),
      });
      if (method === "POST") setDraft(blank);
      if (fields?.category && filter !== "All") setFilter(fields.category);
      setEditing(null);
      setDeleting(null);
      await refresh();
      setSaved(method === "DELETE" ? "Deleted." : "Saved.");
    } catch (error) {
      setError(error.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  const invalid = (value) =>
    !value.name.trim() || (kind === "links" && !value.url.trim());
  return (
    <section className="list-card entry-card" aria-label={config.title}>
      <div className="list-heading">
        <h2>
          {config.title}
          <span>{entries.length}</span>
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
      {kind === "guests" && (
        <p className="private-note">
          <LockKeyhole size={15} />
          Only you and approved editors can see this list.
        </p>
      )}
      {writable && (
        <form
          className={`entry-form entry-form-${kind}`}
          onSubmit={(event) => {
            event.preventDefault();
            save("POST", null, draft);
          }}
        >
          <Fields
            kind={kind}
            value={draft}
            change={setDraft}
            disabled={busy || !!editing}
          />
          <button
            className="button primary"
            disabled={busy || !!editing || invalid(draft)}
          >
            <Plus size={16} />
            {busy ? "Saving…" : config.add}
          </button>
        </form>
      )}
      {config.categories && (
        <div
          className="list-filters"
          role="group"
          aria-label={`Filter ${config.noun}`}
        >
          {["All", ...config.categories].map((category) => (
            <button
              key={category}
              className="filter-button"
              aria-pressed={filter === category}
              onClick={() => setFilter(category)}
            >
              {category === "All" ? `All ${config.noun}` : category}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="notice error-notice sangeet-message" role="alert">
          {error}
        </p>
      )}
      <span className="sr-only" role="status">
        {saved}
      </span>
      {loading ? (
        <div className="empty">
          <p>Loading…</p>
        </div>
      ) : visible.length ? (
        <ul className="sangeet-list">
          {visible.map((entry) => (
            <li className="sangeet-row" key={entry.id}>
              {editing?.entry.id === entry.id ? (
                <form
                  className={`entry-form entry-edit entry-form-${kind}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    save("PUT", editing.entry, editing.value);
                  }}
                >
                  <Fields
                    kind={kind}
                    value={editing.value}
                    change={(value) => setEditing({ ...editing, value })}
                    disabled={busy || !writable}
                  />
                  <div className="sangeet-edit-actions">
                    <button
                      className="button primary"
                      disabled={busy || !writable || invalid(editing.value)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="text-button muted"
                      disabled={busy}
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
                <>
                  <span className="song-icon" aria-hidden="true">
                    <Icon size={19} />
                  </span>
                  <div className="performance-details">
                    {kind === "links" ? (
                      <>
                        <a
                          className="saved-link"
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {entry.name}
                          <ExternalLink size={14} />
                        </a>
                        <span className="link-address">{entry.url}</span>
                      </>
                    ) : (
                      <strong>{entry.name}</strong>
                    )}
                    {entry.category && <span>{entry.category}</span>}
                  </div>
                  {writable &&
                    !editing &&
                    (deleting === entry.id ? (
                      <div className="delete-confirm">
                        <span>Delete?</span>
                        <button
                          className="text-button danger"
                          disabled={busy}
                          onClick={() => save("DELETE", entry)}
                        >
                          Yes
                        </button>
                        <button
                          className="text-button muted"
                          disabled={busy}
                          onClick={() => setDeleting(null)}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="task-actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${entry.name}`}
                          disabled={busy}
                          onClick={() => {
                            setEditing({
                              entry,
                              value: {
                                name: entry.name,
                                url: entry.url || "",
                                category: entry.category || "",
                              },
                            });
                            setDeleting(null);
                            setError("");
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button delete-button"
                          aria-label={`Delete ${entry.name}`}
                          disabled={busy}
                          onClick={() => {
                            setDeleting(entry.id);
                            setError("");
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <span className="empty-icon">
            <Icon size={30} strokeWidth={1.5} />
          </span>
          <h3>
            {filter === "All"
              ? config.empty
              : `No ${filter} ${config.noun} yet.`}
          </h3>
          <p>{writable ? config.hint : "Saved entries will appear here."}</p>
        </div>
      )}
      <div className="list-footer">
        <span>
          {visible.length} of {entries.length} {config.noun}
        </span>
        <span>
          {kind === "guests" ? "Private list" : "For our celebrations"}
        </span>
      </div>
    </section>
  );
}
