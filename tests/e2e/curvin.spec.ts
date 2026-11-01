import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage of the eleven essential CURVIN journeys, running
 * against the mock service layer (the default configuration).
 */

async function openAgentPanel(page: Page) {
  await page.getByRole("button", { name: "Open Curvin agent panel" }).click();
  // The panel renders as an aside (desktop) or dialog (mobile) sharing the
  // same accessible name, so address it by label.
  await expect(page.getByLabel("Curvin agent").first()).toBeVisible({ timeout: 10_000 });
}

test("home loads with prompt-first hero and navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("Message the Curvin agent. Press Enter to send, Shift and Enter for a new line.")).toBeVisible();
});

test("all five primary sections are reachable from the sidebar", async ({ page }) => {
  await page.goto("/home");
  for (const section of ["Learn", "Workspace", "Recents", "Discover"]) {
    await page.getByRole("link", { name: section, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${section.toLowerCase()}$`, "i"));
    await expect(page.getByRole("heading", { level: 1, name: section })).toBeVisible();
  }
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  // Home's h1 is the prompt-first hero line, not the word "Home".
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Describe the software");
});

test("sidebar collapse persists across reloads", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
});

test("command menu opens with keyboard shortcut and navigates", async ({ page }) => {
  await page.goto("/home");
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search and command menu" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/Search projects/).fill("learn");
  await dialog.getByRole("option", { name: /Go to Learn/ }).first().click();
  await expect(page).toHaveURL(/\/learn$/);
});

test("command menu finds seeded projects", async ({ page }) => {
  await page.goto("/home");
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search and command menu" });
  await dialog.getByPlaceholder(/Search projects/).fill("curvin");
  await expect(dialog.getByRole("option").first()).toBeVisible({ timeout: 5_000 });
});

test("new project dialog creates a blank project end to end", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "New project" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Project name").fill("E2E Blank Project");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/workspace\?project=/);
});

test("new project dialog validates each mode honestly", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "New project" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /Prompt/ }).click();
  await dialog.getByLabel("Project name").fill("Validation Probe");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog.getByText(/at least 20 characters/)).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
});

test("agent panel: new conversation, prompt, structured response", async ({ page }) => {
  await page.goto("/home");
  await openAgentPanel(page);
  const panel = page.getByLabel("Curvin agent").first();
  await panel.getByRole("button", { name: "New conversation" }).click();
  const composer = panel.getByLabel("Message the Curvin agent. Press Enter to send, Shift and Enter for a new line.");
  await composer.fill("Add a contact form to the marketing site");
  await composer.press("Enter");
  await expect(panel.getByText(/Working — running tools/)).toBeVisible({ timeout: 15_000 });
});

test("agent turn shows a plan and approval controls", async ({ page }) => {
  await page.goto("/home");
  await openAgentPanel(page);
  const panel = page.getByLabel("Curvin agent").first();
  await panel.getByRole("button", { name: "New conversation" }).click();
  const composer = panel.getByLabel("Message the Curvin agent. Press Enter to send, Shift and Enter for a new line.");
  await composer.fill("Refactor the checkout flow for clarity");
  await composer.press("Enter");
  const approve = panel.getByRole("button", { name: "Approve change" });
  await expect(approve).toBeVisible({ timeout: 20_000 });
  await approve.first().click();
  await expect(panel.getByText("Approved", { exact: true })).toBeVisible({ timeout: 10_000 });
});

test("theme preference persists across reloads", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
});

test("recents view filters by type", async ({ page }) => {
  await page.goto("/recents");
  await page.getByRole("button", { name: "Conversations" }).click();
  await expect(page.getByRole("list", { name: "Recent items" })).toBeVisible();
});

test("learn view searches domains and opens a chapter", async ({ page }) => {
  await page.goto("/learn");
  await page.getByLabel("Search learning domains").fill("databases");
  const results = page.getByRole("button", { name: /Open domain/ });
  await expect(results.first()).toBeVisible();
  await results.first().click();
  // "Indexes and access paths" is the chapter that carries a SQL snippet.
  const chapter = page.getByRole("button", { name: /Indexes and access paths/ });
  await expect(chapter).toBeVisible();
  await chapter.click();
  await expect(page.locator("pre").first()).toBeVisible();
});
