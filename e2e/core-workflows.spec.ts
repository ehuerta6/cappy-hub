import { expect, test, type Page } from "@playwright/test";

const eventTitle = "E2E Event - Core Workflow";
const initialEventDescription =
  "Event created through the browser smoke suite.";
const updatedEventDescription = "Updated through the rendered Event form.";
const taskTitle = "E2E Task - Approval Workflow";
const taskDescription = "Task completed and approved through the browser UI.";

async function signInLocally(page: Page, account: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Cappy Hub" })).toBeVisible();
  await page.getByRole("button", { name: account, exact: true }).click();
}

function futureDenverDate(daysAhead: number) {
  const future = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(future)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

test("protected access reaches local login and an active officer reaches Dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Cappy Hub" })).toBeVisible();

  await page.getByRole("button", { name: "Admin", exact: true }).click();

  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Events", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Dashboard context" })
      .getByRole("heading", { name: "Local Admin", exact: true }),
  ).toBeVisible();
});

test("inactive local officer cannot enter the protected app", async ({
  page,
}) => {
  await signInLocally(page, "Inactive Officer");

  await expect(page).toHaveURL("http://127.0.0.1:3100/access-denied");
  await expect(
    page.getByRole("heading", { name: "Access denied", exact: true }),
  ).toBeVisible();
});

test("manager creates and updates an Event, adds an attendee, and confirms cancellation", async ({
  page,
}) => {
  await signInLocally(page, "Admin");
  await expect(page).toHaveURL("http://127.0.0.1:3100/");

  await page.getByRole("link", { name: "Events", exact: true }).click();
  await page.getByRole("link", { name: /New event/i }).click();
  await expect(
    page.getByRole("heading", { name: "New event", exact: true }),
  ).toBeVisible();

  await page.getByLabel("Name").fill(eventTitle);
  await page.getByLabel("Description").fill(initialEventDescription);
  await page.getByLabel("Type").selectOption({ label: "Workshop" });
  await page.getByLabel("Location").fill("CCSB G.0208");
  await page.getByLabel("Date (El Paso)").fill(futureDenverDate(90));
  await page.getByLabel("Start time").fill("17:00");
  await page.getByLabel("End time").fill("18:00");
  await page
    .getByRole("group", { name: /Branches/ })
    .getByRole("checkbox", { name: "general", exact: true })
    .check();
  await page.getByRole("button", { name: "Save event", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: eventTitle, exact: true }),
  ).toBeVisible();
  const eventDetails = page.getByRole("region", { name: "Event details" });
  await expect(eventDetails.getByText(initialEventDescription)).toBeVisible();
  await expect(
    eventDetails.getByText("CCSB G.0208", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Events", exact: true }).click();
  const eventFilters = page.getByRole("search", { name: "Event filters" });
  await eventFilters.getByLabel("Search events").fill(eventTitle);
  await eventFilters.getByRole("button", { name: "Apply filters" }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/events" && url.searchParams.get("q") === eventTitle,
  );

  await page.getByRole("link", { name: eventTitle, exact: true }).click();
  await page.getByRole("link", { name: "Back to events", exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/events" && url.searchParams.get("q") === eventTitle,
  );
  await expect(eventFilters.getByLabel("Search events")).toHaveValue(
    eventTitle,
  );

  await page.getByRole("link", { name: eventTitle, exact: true }).click();
  await page.getByRole("link", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Description").fill(updatedEventDescription);
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: eventTitle, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Event details" })
      .getByText(updatedEventDescription),
  ).toBeVisible();

  const participation = page.getByRole("region", { name: "Participation" });
  await participation
    .getByRole("checkbox", { name: "Local Officer", exact: true })
    .check();
  await participation
    .getByRole("button", { name: "Add selected officers", exact: true })
    .click();
  await expect(
    participation.getByText("Added 1 officer", { exact: true }),
  ).toBeVisible();
  await expect(
    participation.getByRole("row").filter({ hasText: "Local Officer" }),
  ).toBeVisible();

  const cancelDialog = page.getByRole("dialog", { name: "Cancel Event?" });
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await expect(cancelDialog).toBeVisible();
  await cancelDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(cancelDialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel event", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await cancelDialog
    .getByRole("button", { name: "Cancel Event", exact: true })
    .click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Back to events", exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/events" && url.searchParams.get("q") === eventTitle,
  );
  await expect(
    page
      .getByRole("search", { name: "Event filters" })
      .getByLabel("Search events"),
  ).toHaveValue(eventTitle);
});

test("officer completes an assigned Task and a different manager approves its Point award", async ({
  browser,
}) => {
  const managerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const managerPage = await managerContext.newPage();
  const officerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const officerPage = await officerContext.newPage();

  try {
    await signInLocally(managerPage, "Admin");
    await expect(managerPage).toHaveURL("http://127.0.0.1:3100/");
    await managerPage.getByRole("link", { name: "Tasks", exact: true }).click();
    await managerPage.getByRole("link", { name: /New task/i }).click();

    await managerPage.getByLabel("Title").fill(taskTitle);
    await managerPage.getByLabel("Description").fill(taskDescription);
    await managerPage.getByLabel("Type").selectOption({ label: "Post" });
    await managerPage.getByLabel("Branch").selectOption({ label: "general" });
    await managerPage.getByLabel("Due date").fill(futureDenverDate(90));
    await managerPage
      .getByRole("spinbutton", { name: "Points", exact: true })
      .fill("7");
    await managerPage
      .getByLabel("Require lead approval before points are awarded")
      .check();
    await managerPage
      .getByRole("button", { name: "Create task", exact: true })
      .click();

    const taskLink = managerPage.getByRole("link", {
      name: taskTitle,
      exact: true,
    });
    await expect(taskLink).toBeVisible();
    await taskLink.click();
    await expect(
      managerPage.getByRole("heading", { name: taskTitle, exact: true }),
    ).toBeVisible();
    await expect(managerPage.getByText("Open", { exact: true })).toBeVisible();

    await managerPage
      .getByRole("combobox", { name: "Assign officer" })
      .selectOption({ label: "Local Officer" });
    await managerPage
      .getByRole("button", { name: "Assign", exact: true })
      .click();
    await expect(
      managerPage.getByText("Assignee: Local Officer"),
    ).toBeVisible();
    await expect(
      managerPage.getByText("Assigned", { exact: true }),
    ).toBeVisible();

    await signInLocally(officerPage, "Officer");
    await expect(officerPage).toHaveURL("http://127.0.0.1:3100/");
    await officerPage.getByRole("link", { name: "Tasks", exact: true }).click();
    const taskFilters = officerPage.getByRole("search", {
      name: "Task filters",
    });
    await taskFilters.getByLabel("Search tasks").fill(taskTitle);
    await taskFilters.getByRole("button", { name: "Apply filters" }).click();
    await officerPage.waitForURL(
      (url) =>
        url.pathname === "/tasks" && url.searchParams.get("q") === taskTitle,
    );
    await officerPage
      .getByRole("link", { name: taskTitle, exact: true })
      .click();
    await officerPage
      .getByRole("button", { name: "Mark complete", exact: true })
      .click();
    await expect(
      officerPage.getByRole("button", { name: "Mark complete", exact: true }),
    ).not.toBeVisible();

    await managerPage.reload();
    await expect(
      managerPage.getByRole("button", { name: "Approve", exact: true }),
    ).toBeVisible();
    await managerPage
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await expect(
      managerPage.getByRole("button", { name: "Approve", exact: true }),
    ).not.toBeVisible();

    await managerPage
      .getByRole("link", { name: "Points", exact: true })
      .click();
    const pointFilters = managerPage.getByRole("search", {
      name: "Point history filters",
    });
    await pointFilters.getByLabel("Search point history").fill(taskTitle);
    await pointFilters.getByRole("button", { name: "Apply filters" }).click();
    await managerPage.waitForURL(
      (url) =>
        url.pathname === "/points" && url.searchParams.get("q") === taskTitle,
    );

    const award = managerPage.getByRole("row").filter({ hasText: taskTitle });
    await expect(award).toHaveCount(1);
    await expect(
      award.getByRole("link", { name: "Local Officer", exact: true }),
    ).toBeVisible();
    await expect(
      award.getByRole("link", { name: taskTitle, exact: true }),
    ).toBeVisible();
    await expect(award).toContainText(/\+?7(?:\.0+)?/);
    await expect(award).toContainText("Task");
  } finally {
    await officerContext.close();
    await managerContext.close();
  }
});
