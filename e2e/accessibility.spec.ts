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
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

async function signInAsOfficer(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Officer", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
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

test("Points layout has no detectable accessibility violations", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/points");
  await expect(
    page.getByRole("heading", { name: "Officer totals" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Point history" }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test("Add transaction dialog is accessible and restores focus after Escape", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/points");
  const trigger = page.getByRole("button", { name: "Add transaction" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('select[name="officer_id"]')).toBeFocused();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("older Event search preserves the Event already selected", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/points");
  await page.getByRole("button", { name: "Add transaction" }).click();
  const eventSelect = page.getByLabel("Event (optional)");
  await expect(eventSelect.locator("option").nth(1)).toBeAttached();
  const selectedOption = eventSelect.locator("option").nth(1);
  const selectedEventId = await selectedOption.getAttribute("value");
  const optionCount = await eventSelect.locator("option").count();
  await eventSelect.selectOption(selectedEventId ?? "");
  await page.getByLabel("Search older events").fill("zzzz-no-match");
  await page.getByRole("button", { name: "Search events" }).click();
  await expect(eventSelect).toHaveValue(selectedEventId ?? "");
  await expect(eventSelect.locator("option")).toHaveCount(optionCount);
});

test("server validation keeps the transaction dialog open and retains values", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/points");
  await page.getByRole("button", { name: "Add transaction" }).click();
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  const officer = dialog.locator('select[name="officer_id"]');
  const points = dialog.locator('input[name="points"]');
  const reason = dialog.locator('input[name="reason"]');
  const awardType = dialog.locator('select[name="award_type"]');
  const event = dialog.locator('select[name="event_id"]');
  await officer.selectOption({ index: 1 });
  await points.fill("0");
  await reason.fill("Validation check; no transaction should be written");
  await awardType.selectOption("correction");
  await event.selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeVisible();
  await expect(officer).toHaveAttribute("aria-invalid", "true");
  await expect(points).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText("Select an officer").first()).toBeVisible();
  await expect(
    dialog
      .getByText("Enter a nonzero positive or negative point value")
      .first(),
  ).toBeVisible();
  await expect(points).toHaveValue("0");
  await expect(officer).not.toHaveValue("");
  await expect(reason).toHaveValue(
    "Validation check; no transaction should be written",
  );
  await expect(awardType).toHaveValue("correction");
  await expect(event).not.toHaveValue("");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/ui-reference/admin/points/206-add-transaction-validation-1440-dark.png",
  });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeVisible();
  await expect(points).toHaveValue("0");
  await expect(officer).not.toHaveValue("");
  await page.screenshot({
    path: "docs/ui-reference/admin/points/206-add-transaction-validation-1440-light.png",
  });
});

test("Officer Points remains read-only", async ({ page }) => {
  await signInAsOfficer(page);
  await page.goto("/points");
  await expect(
    page.getByRole("heading", { name: "Officer totals" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Point history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add transaction" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save rate" })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test("protected navigation is separate from the page landmark and can be skipped", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const main = page.getByRole("main");
  const skipLink = page.getByRole("link", { name: "Skip to content" });

  await expect(main).toHaveCount(1);
  await expect(
    main.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  await skipLink.press("Enter");
  await expect(main).toBeFocused();
});

test("reversed date ranges expose associated validation errors", async ({
  page,
}) => {
  await signInAsAdmin(page);

  for (const testCase of [
    {
      path: "/points",
      fromLabel: "From activity date",
      toLabel: "To activity date",
      errorId: "point-history-date-error",
    },
    {
      path: "/system-log",
      fromLabel: "From date",
      toLabel: "To date",
      errorId: "system-log-date-error",
    },
  ]) {
    await page.goto(`${testCase.path}?from=2026-10-09&to=2026-10-01`);
    const error = page.getByRole("alert").filter({
      hasText: "Choose a From date on or before the To date.",
    });
    await expect(error).toBeVisible();

    for (const label of [testCase.fromLabel, testCase.toLabel]) {
      const input = page.getByLabel(label);
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expect(input).toHaveAttribute("aria-describedby", testCase.errorId);
    }
  }
});

test("Events keeps its quiet branch text readable in both themes", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/events");
  await expect(
    page.locator("span.text-subtle:visible", { hasText: "None" }).first(),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectNoAxeViolations(page);
});

test("new Event form has no detectable accessibility violations", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/events/new");
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create event", exact: true }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test("new Task form has no detectable accessibility violations", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/tasks/new");
  await expect(page.getByRole("heading", { name: "New task" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create task" })).toBeVisible();
  await expect(
    page.getByText(/Optional context: search and select any number of Events/),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test("Task detail completion controls are labeled and keyboard operable", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/tasks/-8002");
  await expect(
    page.getByRole("heading", { name: "Write LinkedIn recap" }),
  ).toBeVisible();
  const completion = page.getByRole("checkbox", {
    name: "Completed for Local President",
    exact: true,
  });
  await expect(completion).toBeVisible();
  await expect(completion).toBeChecked();
  await completion.focus();
  await page.keyboard.press("Space");
  await expect(completion).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(completion).toBeChecked();
  await expectNoAxeViolations(page);

  for (const width of [1920, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole("region", { name: "Task details" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Officers" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("Task list stays concise and accessible at desktop widths", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/tasks");

  const taskLink = page.getByRole("link", {
    name: "Make intro flyer",
    exact: true,
  });
  const taskRow = page.getByRole("row").filter({ has: taskLink });
  const assignmentAction = taskRow.getByRole("button", {
    name: "Assign this task to me",
    exact: true,
  });

  await expect(taskLink).toBeVisible();
  await expect(taskRow).not.toContainText(
    "Prepare a flyer for the next intro workshop.",
  );
  await expect(
    page.getByRole("columnheader", { name: "Points", exact: true }),
  ).toHaveCount(0);
  await expect(taskRow.getByRole("cell").nth(1)).toHaveText(
    /^[A-Z][a-z]{2} \d{1,2}(, \d{4})?$/,
  );
  await expect(assignmentAction).toBeVisible();
  await expect(assignmentAction).toHaveText("Assign to me");
  await expect(assignmentAction).toHaveClass(/whitespace-nowrap/);
  await expect(assignmentAction).toHaveClass(/px-3/);
  await expect(assignmentAction).toHaveClass(/py-1\.5/);
  await expectNoAxeViolations(page);

  for (const width of [1920, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(taskLink).toBeVisible();
    await expect(assignmentAction).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
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
      submitLabel: "Create event",
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
