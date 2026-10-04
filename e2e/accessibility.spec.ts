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

test("Event and Task forms preview the same long weekly schedule", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();

  for (const form of [
    {
      path: "/events/new",
      dateLabel: "Date (El Paso)",
      submitLabel: "Save event",
    },
    { path: "/tasks/new", dateLabel: "Due date", submitLabel: "Create task" },
  ]) {
    await page.goto(form.path);
    await page
      .getByRole("combobox", { name: "Repeat", exact: true })
      .selectOption("weekly");
    await page.getByRole("spinbutton", { name: "Repeat interval" }).fill("15");
    await page.getByRole("checkbox", { name: "Tue", exact: true }).check();
    await page.locator('input[name="recurrence_count"]').fill("10");
    const firstDate = page.getByLabel(form.dateLabel);
    await firstDate.fill("2026-10-06");

    await expect(page.getByText("weeks", { exact: true })).toBeVisible();
    const preview = page.getByRole("region", { name: "Schedule preview" });
    await expect(preview).toContainText("Oct 6, 2026");
    await expect(preview).toContainText("Jan 19, 2027");
    await expect(preview).toContainText("Showing the first 5 dates of 10.");
    await expect(preview).toContainText("Last occurrence: May 8, 2029");
    await expect(
      page.getByRole("button", { name: form.submitLabel, exact: true }),
    ).toBeVisible();
    await firstDate.fill("2026-10-13");
    await expect(preview).toContainText("Oct 13, 2026");
    await expect(preview).toContainText("Jan 26, 2027");
    await expect(preview).toContainText("Last occurrence: May 15, 2029");
    await expectNoAxeViolations(page);
  }
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
