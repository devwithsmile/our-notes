import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const key = "browser-test-only-private-setup-token-at-least-32-characters";

test("simple shared checklist works for owner, approved partner, and public reader", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Our to-do list." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Set up list", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Alex");
  await page.getByLabel("Username", { exact: true }).fill("alex");
  await page.getByLabel("Password", { exact: true }).fill("alex-test-password");
  await page.getByLabel("Owner setup key").fill(key);
  await page
    .getByRole("button", { name: "Create your owner account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  for (const task of [
    "Pick up groceries",
    "Book the weekend train tickets",
    "Water the plants",
  ]) {
    await page
      .getByRole("textbox", { name: "New task", exact: true })
      .fill(task);
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(page.getByText(task, { exact: true })).toBeVisible();
  }
  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  await partner.goto("http://localhost:3100");
  await expect(
    partner.getByRole("checkbox", { name: "Mark Pick up groceries as done" }),
  ).toBeDisabled();
  await expect(partner.getByRole("textbox", { name: "New task" })).toHaveCount(
    0,
  );
  await partner
    .getByRole("button", { name: "Request access", exact: true })
    .click();
  await partner.getByLabel("Your name", { exact: true }).fill("Jamie");
  await partner.getByLabel("Username", { exact: true }).fill("jamie");
  await partner
    .getByLabel("Password", { exact: true })
    .fill("jamie-test-password");
  await partner
    .getByRole("button", { name: "Request editing access", exact: true })
    .click();
  await expect(
    partner.getByText("Your editing request is waiting for approval."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Manage access/ }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove access", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(partner.getByRole("textbox", { name: "New task" })).toBeVisible({
    timeout: 12000,
  });
  await partner
    .getByRole("checkbox", { name: "Mark Pick up groceries as done" })
    .check();
  await expect(
    page.getByRole("checkbox", { name: "Mark Pick up groceries as not done" }),
  ).toBeChecked({ timeout: 12000 });
  await partner
    .getByRole("textbox", { name: "New task" })
    .fill("Choose a movie for tonight");
  await partner.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByText("Choose a movie for tonight", { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await page
    .getByRole("button", { name: "Edit Water the plants", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Edit task", exact: true })
    .fill("Water the balcony plants");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Water the balcony plants", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Sangeet", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Alex & Jamie");
  await page
    .getByRole("textbox", { name: "Song name", exact: true })
    .fill("Kala Chashma");
  await page.getByRole("tab", { name: "To-do list", exact: true }).click();
  await expect(
    page.getByText("Water the balcony plants", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Sangeet", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Song name", exact: true }),
  ).toHaveValue("Kala Chashma");
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await expect(page.getByText("Kala Chashma", { exact: true })).toBeVisible();
  await partner.getByRole("tab", { name: "Sangeet", exact: true }).click();
  await expect(partner.getByText("Kala Chashma", { exact: true })).toBeVisible({
    timeout: 12000,
  });
  await partner
    .getByRole("button", { name: "Edit Alex & Jamie", exact: true })
    .click();
  await partner
    .locator(".sangeet-edit")
    .getByRole("textbox", { name: "Song name", exact: true })
    .fill("London Thumakda");
  await partner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("London Thumakda", { exact: true })).toBeVisible({
    timeout: 12000,
  });
  // New sections: categorized songs and links, and an editor-only guest list.
  await expect(page.getByRole("tab").nth(2)).toHaveText("Links");
  await page.getByRole("tab", { name: "Song list", exact: true }).click();
  for (const category of ["Hindi", "Marathi", "Bhojpuri"]) {
    await page
      .getByRole("textbox", { name: "Song name", exact: true })
      .fill(`${category} favourite`);
    await page
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption(category);
    await page.getByRole("button", { name: "Add song", exact: true }).click();
    await expect(
      page.getByText(`${category} favourite`, { exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Marathi", exact: true }).click();
  await expect(
    page.getByText("Marathi favourite", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Hindi favourite", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Bhojpuri", exact: true }).click();
  await expect(
    page.getByText("Bhojpuri favourite", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hindi", exact: true }).click();
  await expect(
    page.getByText("Hindi favourite", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All songs", exact: true }).click();
  await page.getByRole("tab", { name: "Links", exact: true }).click();
  await page
    .getByLabel("Link name", { exact: true })
    .fill("Haldi outfit ideas");
  await page
    .getByLabel("Link URL", { exact: true })
    .fill("https://example.com/outfits");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Haldi");
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Haldi outfit ideas" }),
  ).toHaveAttribute("href", "https://example.com/outfits");
  await page.getByRole("button", { name: "Wedding", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Haldi outfit ideas" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Haldi", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Haldi outfit ideas" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Guest list", exact: true }).click();
  await page
    .getByLabel("Guest name", { exact: true })
    .fill("Private wedding guest");
  await page.getByRole("button", { name: "Add guest", exact: true }).click();
  await expect(
    page.getByText("Private wedding guest", { exact: true }),
  ).toBeVisible();
  await partner.getByRole("tab", { name: "Guest list", exact: true }).click();
  await expect(
    partner.getByText("Private wedding guest", { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await page
    .getByRole("button", { name: "Edit Private wedding guest", exact: true })
    .click();
  await page
    .locator(".entry-edit")
    .getByLabel("Guest name", { exact: true })
    .fill("Private wedding guest updated");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    partner.getByText("Private wedding guest updated", { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await page
    .getByRole("textbox", { name: "Guest name", exact: true })
    .fill("Aasish");
  await page
    .getByRole("button", { name: "Add accompanying guest", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add accompanying guest", exact: true })
    .click();
  await page.getByRole("button", { name: "Add guest", exact: true }).click();
  await expect(page.getByText("Aasish + 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Our guests 4 people", exact: true }),
  ).toBeVisible();
  await expect(
    partner.getByRole("heading", { name: "Our guests 4 people", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await page.getByRole("button", { name: "Edit Aasish", exact: true }).click();
  await page
    .locator(".entry-edit")
    .getByRole("button", { name: "Add accompanying guest", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Aasish + 3", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Our guests 5 people", exact: true }),
  ).toBeVisible();
  await mkdir("test-results/screenshots", { recursive: true });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const tab of ["Links", "Song list", "Guest list"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await page.screenshot({
        path: `test-results/screenshots/new-${tab.replaceAll(" ", "-")}-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.getByRole("tab", { name: "Sangeet", exact: true }).click();
  await page.getByRole("tab", { name: "Guest list", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete Aasish", exact: true })
    .click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Our guests 1 person", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Sangeet", exact: true }).click();
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto("http://localhost:3100");
  await publicPage.getByRole("tab", { name: "Sangeet", exact: true }).click();
  await expect(
    publicPage.getByText("London Thumakda", { exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByRole("button", { name: "Add person", exact: true }),
  ).toHaveCount(0);
  await expect(
    publicPage.getByRole("button", { name: "Edit Alex & Jamie", exact: true }),
  ).toHaveCount(0);
  await expect(
    publicPage.getByRole("tab", { name: "Guest list", exact: true }),
  ).toHaveCount(0);
  expect(
    (await publicPage.request.get("http://localhost:3100/api/guests")).status(),
  ).toBe(403);
  const publicData = await (
    await publicPage.request.get("http://localhost:3100/api/list")
  ).json();
  expect(publicData).not.toHaveProperty("guests");
  expect(JSON.stringify(publicData)).not.toContain("Private wedding guest");
  await publicPage.getByRole("tab", { name: "Song list", exact: true }).click();
  await expect(
    publicPage.getByText("Marathi favourite", { exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByRole("button", { name: "Add song", exact: true }),
  ).toHaveCount(0);
  await publicPage.getByRole("tab", { name: "Links", exact: true }).click();
  await expect(
    publicPage.getByRole("link", { name: "Haldi outfit ideas" }),
  ).toBeVisible();
  await expect(
    publicPage.getByRole("button", { name: "Save link", exact: true }),
  ).toHaveCount(0);
  await publicContext.close();
  await mkdir("test-results/screenshots", { recursive: true });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `test-results/screenshots/sangeet-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("tab", { name: "Sangeet", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "To-do list", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Guest list", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Sangeet", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete Alex & Jamie", exact: true })
    .click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page.getByText("London Thumakda", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("tab", { name: "To-do list", exact: true }).click();
  await partner.getByRole("tab", { name: "To-do list", exact: true }).click();
  await mkdir("test-results/screenshots", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/screenshots/simple-todos-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/screenshots/simple-todos-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", {
      name: "Delete Water the balcony plants",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(
    page.getByText("Water the balcony plants", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Manage access/ }).click();
  await partner.getByRole("tab", { name: "Guest list", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove access", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(partner.getByRole("textbox", { name: "New task" })).toHaveCount(
    0,
    { timeout: 12000 },
  );
  await expect(
    partner.getByRole("checkbox", {
      name: "Mark Choose a movie for tonight as done",
    }),
  ).toBeDisabled();
  await expect(
    partner.getByRole("tab", { name: "Guest list", exact: true }),
  ).toHaveCount(0);
  await expect(
    partner.getByText("Private wedding guest updated", { exact: true }),
  ).toHaveCount(0);
  expect(
    (await partner.request.get("http://localhost:3100/api/guests")).status(),
  ).toBe(403);
  for (const width of [375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await partner.getByRole("tab", { name: "Sangeet", exact: true }).click();
  await expect(
    partner.getByRole("button", { name: "Add person", exact: true }),
  ).toHaveCount(0);
  // Owner recovery works while signed out, without knowing the old password.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Setup token", { exact: true }).fill("incorrect-token");
  await page
    .getByLabel("New password", { exact: true })
    .fill("recovered-owner-password");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("different-password");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "The passwords do not match.",
  );
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("recovered-owner-password");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "The setup token is incorrect.",
  );
  await page.getByLabel("Setup token", { exact: true }).fill(key);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/screenshots/owner-recovery.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: /Manage access/ }).click();
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(page.getByText(/@jamie · Access denied/)).toBeVisible();
  await expect(
    partner.getByText(
      "Your editing request was denied. You can still view everything.",
    ),
  ).toBeVisible({ timeout: 12000 });
  await page.screenshot({
    path: "test-results/screenshots/manage-access.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Reset password for Jamie", exact: true })
    .click();
  await page
    .getByLabel("New password", { exact: true })
    .fill("reset-partner-password");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("reset-partner-password");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "Password reset for Jamie.",
  );
  await expect(
    partner.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await partner.getByRole("button", { name: "Sign in", exact: true }).click();
  await partner.getByLabel("Username", { exact: true }).fill("jamie");
  await partner
    .getByLabel("Password", { exact: true })
    .fill("reset-partner-password");
  await partner
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(partner.getByRole("dialog")).not.toBeVisible();
  await expect(
    partner.getByText(
      "Your editing request was denied. You can still view everything.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    partner.getByRole("button", { name: "Add person", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await partnerContext.close();
  expect(errors).toEqual([]);
});
