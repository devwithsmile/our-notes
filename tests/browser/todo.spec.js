import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const key = "browser-test-only-private-setup-token-at-least-32-characters";

test("simple shared checklist works for owner, approved partner, and public reader", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
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
    page.getByRole("tab", { name: "Sangeet", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
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
