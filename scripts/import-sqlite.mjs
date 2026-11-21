// Non-destructive migration from the original Python app into the configured JSON store.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createStore } from "../lib/store.mjs";
const source = process.argv[2] || "data/notes.sqlite3";
if (!existsSync(source)) throw new Error(`No SQLite database at ${source}`);
const old = new DatabaseSync(source, { readOnly: true });
try {
  const users = old.prepare("SELECT * FROM users").all();
  const notes = old.prepare("SELECT * FROM notes").all();
  if (!users.length)
    console.log("The original notebook is empty. Nothing to import.");
  else {
    const store = await createStore();
    await store.update((state) => {
      if (state.users.length || state.notes.length)
        throw new Error(
          "Import requires an empty destination notebook. Existing data has not been changed.",
        );
      const ids = new Map(users.map((u) => [u.id, randomUUID()]));
      state.users = users.map((u) => ({
        id: ids.get(u.id),
        name: u.name,
        username: u.username,
        password: u.password,
        role: u.role,
        created_at: new Date().toISOString(),
      }));
      state.notes = notes.map((n) => ({
        id: randomUUID(),
        title: n.title,
        body: n.body,
        category: n.category,
        author_id: ids.get(n.author_id),
        updated_by: ids.get(n.updated_by),
        pinned: Boolean(n.pinned),
        version: n.version,
        created_at: new Date(n.created * 1000).toISOString(),
        updated_at: new Date(n.updated * 1000).toISOString(),
      }));
      state.imports.push({ source, imported_at: new Date().toISOString() });
    });
    console.log(
      `Imported ${users.length} accounts and ${notes.length} notes into JSON. Existing passwords still work. Sign in again on each device.`,
    );
  }
} finally {
  old.close();
}
