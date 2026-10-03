import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map(({ target }) => target),
    })),
  ).toEqual([]);
}

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
}

test("local login has no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Cappy Hub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Admin" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("Dashboard has no detectable accessibility violations", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("new Event form has no detectable accessibility violations", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/events/new");
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save event" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("new Task form has no detectable accessibility violations", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/tasks/new");
  await expect(page.getByRole("heading", { name: "New task" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create task" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("open Event cancellation dialog has no detectable accessibility violations", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/events/-2011");
  await expect(
    page.getByRole("heading", { name: "Mock: Officer Meeting" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel event" }).click();

  const dialog = page.getByRole("dialog", { name: "Cancel Event?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(
    "This changes the Event’s status to cancelled. Existing Event history and eligibility rules stay in effect.",
  );
  await expectNoAxeViolations(page);

  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
