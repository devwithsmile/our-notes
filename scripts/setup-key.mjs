import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const path = ".env.local";
const existing = await readFile(path, "utf8").catch(() => "");
if (/^SETUP_TOKEN=.+/m.test(existing)) {
  console.log(
    "A SETUP_TOKEN already exists in .env.local. Use it in the owner setup form.",
  );
} else {
  const token = randomBytes(32).toString("hex");
  const text = existing.replace(/^SETUP_TOKEN=.*\n?/m, "");
  await writeFile(path, `${text}\nSETUP_TOKEN=${token}\n`, { mode: 0o600 });
  console.log(
    "Private setup key saved as SETUP_TOKEN in .env.local. Copy it into the owner setup form. Restart the dev server if it is already running.",
  );
}
