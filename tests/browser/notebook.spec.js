import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const key = "browser-test-only-private-setup-token-at-least-32-characters";

test("two people can share notes; visitors read; desktop and mobile layouts work", async ({
  page,
  browser,
}) => {
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Every story starts with a note." }),
  ).toBeVisible();
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/desktop-empty.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Set up our space" }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Alex");
  await page.getByLabel("Username", { exact: true }).fill("alex");
  await page
    .getByLabel("Password", { exact: true })
    .fill("alex-browser-password");
  await page.getByLabel("Private setup key").fill(key);
  await page.getByRole("button", { name: "Create our notebook" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByLabel("Note title", { exact: true })
    .fill("Our slow Sunday ritual");
  await page
    .getByLabel("Your note", { exact: true })
    .fill(
      "Coffee before the world wakes up.\n\nA walk with no destination, a book we keep passing back and forth, and nowhere else we need to be.",
    );
  await page.getByRole("button", { name: "Pin note", exact: true }).click();
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Our slow Sunday ritual" }),
  ).toBeVisible();

  const partnerContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const partner = await partnerContext.newPage();
  partner.on("pageerror", (error) => consoleErrors.push(error.message));
  await partner.goto("http://localhost:3100");
  await partner.getByRole("button", { name: /Make yourself at home/ }).click();
  await partner
    .getByRole("button", { name: "Request access", exact: true })
    .click();
  await partner.getByLabel("Your name", { exact: true }).fill("Jamie");
  await partner.getByLabel("Username", { exact: true }).fill("jamie");
  await partner
    .getByLabel("Password", { exact: true })
    .fill("jamie-browser-password");
  await partner.getByRole("button", { name: "Request writing access" }).click();
  await expect(partner.getByText("Your seat is saved.")).toBeVisible();
  await page.getByRole("button", { name: "Our circle", exact: true }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Revoke", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(partner.getByText("Your seat is saved.")).not.toBeVisible({
    timeout: 12000,
  });
  await partner.getByRole("button", { name: "New note", exact: true }).click();
  await partner
    .getByLabel("Note title", { exact: true })
    .fill("A tiny cabin, somewhere green");
  await partner.getByLabel("Collection", { exact: true }).selectOption("Plans");
  await partner
    .getByLabel("Your note", { exact: true })
    .fill(
      "For our next little escape:\n- A cabin by the trees\n- No alarms\n- That pasta recipe we’ve been meaning to try",
    );
  await partner.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A tiny cabin, somewhere green" }),
  ).toBeVisible({ timeout: 12000 });

  const samples = [
    [
      "Things we should make together",
      "Ideas",
      "A playlist for long drives. A photo book of the ordinary days. A very ambitious Sunday breakfast.",
    ],
    [
      "That evening by the water",
      "Memories",
      "The sky was doing that impossible pink thing. We stayed until the lights came on, talking about everything and nothing.",
    ],
    [
      "A few good things lately",
      "Everyday",
      "The plant has a new leaf. We finally found our favorite bakery. The evenings are getting a little longer.",
    ],
  ];
  for (const [title, category, body] of samples) {
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await page.getByLabel("Note title", { exact: true }).fill(title);
    await page.getByLabel("Collection", { exact: true }).selectOption(category);
    await page.getByLabel("Your note", { exact: true }).fill(body);
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await page.screenshot({
    path: "test-results/screenshots/desktop-notes.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Everyday.*Our slow Sunday ritual/ })
    .click();
  await page.screenshot({ path: "test-results/screenshots/editor.png" });
  await page
    .getByLabel("Your note", { exact: true })
    .fill("My unsaved version");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByText("You have unsaved changes. Discard them?"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep writing", exact: true }).click();
  await expect(page.getByLabel("Your note", { exact: true })).toHaveValue(
    "My unsaved version",
  );

  // Both people open the same version. The second save must preserve the unsaved draft.
  await partner.reload();
  await partner
    .getByRole("button", { name: /Everyday.*Our slow Sunday ritual/ })
    .click();
  await partner
    .getByLabel("Your note", { exact: true })
    .fill("Partner saved a different version");
  await partner.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(partner.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByText(/A newer version was saved on another device/),
  ).toBeVisible();
  await expect(page.getByLabel("Your note", { exact: true })).toHaveValue(
    "My unsaved version",
  );
  await page
    .getByRole("button", { name: "Save as new note", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Our slow Sunday ritual" }),
  ).toHaveCount(2);

  await page.getByRole("searchbox", { name: "Search notes" }).fill("cabin");
  await expect(
    page.getByRole("heading", { name: "A tiny cabin, somewhere green" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A few good things lately" }),
  ).not.toBeVisible();
  await page.getByRole("searchbox", { name: "Search notes" }).fill("");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".list-view")).toBeVisible();
  await page.getByRole("button", { name: "Grid view", exact: true }).click();

  const visitorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const visitor = await visitorContext.newPage();
  visitor.on("pageerror", (error) => consoleErrors.push(error.message));
  await visitor.goto("http://localhost:3100");
  await expect(
    visitor.getByRole("heading", { name: "A tiny cabin, somewhere green" }),
  ).toBeVisible();
  expect(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await visitor.screenshot({
    path: "test-results/screenshots/mobile-notes.png",
    fullPage: true,
  });
  await visitor
    .getByRole("button", { name: /Plans.*A tiny cabin, somewhere green/ })
    .click();
  await expect(visitor.getByRole("dialog")).toBeVisible();
  await expect(visitor.getByRole("button", { name: "Save note" })).toHaveCount(
    0,
  );
  await visitor.getByRole("button", { name: "Close dialog" }).click();
  await visitor.getByRole("button", { name: "Open navigation" }).click();
  await visitor
    .getByRole("navigation", { name: "Notebook navigation" })
    .getByRole("button", { name: /^Memories/ })
    .click();
  await expect(
    visitor.getByRole("heading", { name: "That evening by the water" }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: "Close navigation" }),
  ).toHaveCount(0);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await visitorContext.close();
  await partnerContext.close();
  expect(consoleErrors).toEqual([]);
});
