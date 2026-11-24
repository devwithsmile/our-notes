"use client";
import { useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  LoaderCircle,
  Music2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

function Fields({ value, onChange, disabled, prefix }) {
  return (
    <>
      <label htmlFor={`${prefix}-name`}>
        Name
        <input
          id={`${prefix}-name`}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          required
          maxLength={160}
          placeholder="Person or group name"
          disabled={disabled}
          autoComplete="off"
        />
      </label>
      <label htmlFor={`${prefix}-song`}>
        Song name
        <input
          id={`${prefix}-song`}
          value={value.song}
          onChange={(e) => onChange({ ...value, song: e.target.value })}
          required
          maxLength={160}
          placeholder="What are they dancing to?"
          disabled={disabled}
          autoComplete="off"
        />
      </label>
    </>
  );
}
const blank = { name: "", song: "" };
export default function SangeetList({
  entries,
  writable,
  loading,
  offline,
  api,
  refresh,
}) {
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const form = useRef(null);
  // Keep an open edit visible even if someone deletes that entry during a refresh.
  const visibleEntries =
    editing && !entries.some((entry) => entry.id === editing.entry.id)
      ? [...entries, editing.entry]
      : entries;
  useEffect(() => {
    function guard(event) {
      if (draft.name || draft.song || editing) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [draft, editing]);
  async function save(method, entry, fields) {
    if (busy || !writable || (method === "POST" && editing)) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api("/sangeet" + (entry ? "/" + entry.id : ""), method, {
        ...fields,
        ...(entry ? { version: entry.version } : {}),
      });
      if (method === "POST") setDraft(blank);
      setEditing(null);
      setDeleting(null);
      await refresh();
      setSaved(method === "DELETE" ? "Entry deleted." : "Saved.");
      if (method === "POST") form.current?.querySelector("input")?.focus();
    } catch (error) {
      setError(error.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="list-card sangeet-card"
      aria-label="Sangeet performances"
    >
      <div className="list-heading">
        <h2>
          Who’s dancing <span>{entries.length}</span>
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
        <form
          ref={form}
          className="sangeet-form"
          onSubmit={(e) => {
            e.preventDefault();
            save("POST", null, draft);
          }}
        >
          <Fields
            value={draft}
            onChange={setDraft}
            disabled={busy || !!editing}
            prefix="new-performer"
          />
          <button
            className="button primary"
            disabled={
              busy || !!editing || !draft.name.trim() || !draft.song.trim()
            }
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Plus size={16} />
            )}
            Add person
          </button>
        </form>
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
          <LoaderCircle className="spin" size={25} />
          <p>Loading the dance list…</p>
        </div>
      ) : visibleEntries.length ? (
        <ul className="sangeet-list">
          {visibleEntries.map((entry) => (
            <li className="sangeet-row" key={entry.id}>
              {editing?.entry.id === entry.id ? (
                <form
                  className="sangeet-form sangeet-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("PUT", editing.entry, {
                      name: editing.name,
                      song: editing.song,
                    });
                  }}
                >
                  <Fields
                    value={editing}
                    onChange={setEditing}
                    disabled={busy || !writable}
                    prefix={`edit-${entry.id}`}
                  />
                  <div className="sangeet-edit-actions">
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        !writable ||
                        !editing.name.trim() ||
                        !editing.song.trim()
                      }
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
                    <Music2 size={19} />
                  </span>
                  <div className="performance-details">
                    <strong>{entry.name}</strong>
                    <span>{entry.song}</span>
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
                              name: entry.name,
                              song: entry.song,
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
            <Music2 size={30} strokeWidth={1.5} />
          </span>
          <h3>Let’s get everyone dancing.</h3>
          <p>
            {writable
              ? "Add a name and their chosen song above to start your sangeet list."
              : "Names and chosen songs will appear here once they’re added."}
          </p>
        </div>
      )}
      <div className="list-footer">
        <span>
          {entries.length}{" "}
          {entries.length === 1 ? "performance" : "performances"} planned
        </span>
        <span>A night to remember</span>
      </div>
    </section>
  );
}
