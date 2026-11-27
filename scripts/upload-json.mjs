// Import a private JSON export into an EMPTY MongoDB notebook. Never overwrite data.
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
import { mongoUri } from "../lib/mongo.mjs";
import { validateState, MAX_STORE_BYTES } from "../lib/store.mjs";
const client = new MongoClient(mongoUri(), { serverSelectionTimeoutMS: 10000 });
try {
  const source = process.argv[2] || "./data/notes.json";
  const raw = await readFile(source, "utf8");
  if (Buffer.byteLength(raw) > MAX_STORE_BYTES)
    throw new Error("Source exceeds notebook size limit.");
  const imported = validateState(JSON.parse(raw));
  if (!imported.users.length)
    throw new Error("Source has no accounts to import.");
  delete imported._id;
  imported.sessions = [];
  imported.rateLimits = [];
  imported.imports.push({
    source: "json-to-mongodb",
    imported_at: new Date().toISOString(),
  });
  if (Buffer.byteLength(JSON.stringify(imported)) > MAX_STORE_BYTES)
    throw new Error("Source exceeds notebook size limit.");
  await client.connect();
  await client
    .db(process.env.MONGODB_DATABASE || "our_notes")
    .collection("notebooks")
    .insertOne({ _id: "shared", ...imported });
  console.log(
    "Imported all accounts and lists into MongoDB. Existing passwords work; sign in again. Source file unchanged.",
  );
} catch (error) {
  console.error(
    error.code === 11000
      ? "MongoDB already contains a notebook. Nothing was overwritten."
      : "Import failed. Check the JSON export and MongoDB connection. Credentials are not logged.",
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
