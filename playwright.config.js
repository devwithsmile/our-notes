import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const database = mkdtempSync(join(tmpdir(), "our-notes-browser-"));
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1440, height: 1050 },
    launchOptions:
      process.env.PLAYWRIGHT_CHROME === "1" ? { channel: "chrome" } : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NOTES_FILE: join(database, "notes.json"),
      BLOB_READ_WRITE_TOKEN: "",
      BLOB_STORE_ID: "",
      VERCEL_OIDC_TOKEN: "",
      SETUP_TOKEN:
        "browser-test-only-private-setup-token-at-least-32-characters",
      APP_URL: "",
    },
  },
});
