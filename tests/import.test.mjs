import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../lib/store.mjs";
import { hashPassword, verifyPassword } from "../lib/security.mjs";
const run = promisify(execFile);

test("legacy import preserves notes and passwords without changing the original file", async () => {
  const folder = await mkdtemp(join(tmpdir(), "our-notes-import-"));
  const source = join(folder, "original.sqlite3");
  const target = join(folder, "notes.json");
  const sqlite = new DatabaseSync(source);
  sqlite.exec(`CREATE TABLE users(id INTEGER, name TEXT, username TEXT, password TEXT, role TEXT);
    CREATE TABLE notes(id INTEGER,title TEXT,body TEXT,category TEXT,author_id INTEGER,updated_by INTEGER,pinned INTEGER,version INTEGER,created REAL,updated REAL);`);
  sqlite
    .prepare("INSERT INTO users VALUES(1,?,?,?,?)")
    .run(
      "Original owner",
      "original",
      await hashPassword("original-password"),
      "owner",
    );
  sqlite
    .prepare("INSERT INTO notes VALUES(1,?,?,?,?,?,?,?,?,?)")
    .run(
      "Keep this memory",
      "Still here.",
      "Memories",
      1,
      1,
      1,
      3,
      1700000000,
      1700000500,
    );
  sqlite.close();
  try {
    const env = {
      ...process.env,
      NOTES_FILE: target,
      BLOB_READ_WRITE_TOKEN: "",
    };
    const result = await run(
      process.execPath,
      ["scripts/import-sqlite.mjs", source],
      { env },
    );
    assert.match(result.stdout, /Imported 1 accounts and 1 notes/);
    process.env.NOTES_FILE = target;
    const db = await createStore();
    const [user] = (await db.read()).users;
    const [note] = (await db.read()).notes;
    assert.equal(
      await verifyPassword("original-password", user.password),
      true,
    );
    assert.equal(note.author_id, user.id);
    assert.equal(note.title, "Keep this memory");
    assert.equal(note.pinned, true);
    assert.equal(note.version, 3);
    const original = new DatabaseSync(source, { readOnly: true });
    assert.equal(
      original.prepare("SELECT body FROM notes").get().body,
      "Still here.",
    );
    original.close();
    await assert.rejects(
      run(process.execPath, ["scripts/import-sqlite.mjs", source], { env }),
      /empty destination notebook/,
    );
  } finally {
    delete process.env.NOTES_FILE;
    await rm(folder, { recursive: true, force: true });
  }
});
