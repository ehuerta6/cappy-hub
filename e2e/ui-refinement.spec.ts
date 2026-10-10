import { expect, test, type Page } from "@playwright/test";

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("Cappy Hub navigation remains visible across desktop widths and themes", async ({
  page,
}) => {
  await signInAsAdmin(page);

  const brand = page.getByRole("link", { name: "Cappy Hub", exact: true });
  const logo = brand.locator("img");
  await expect(brand).toHaveCount(1);
  await expect(brand).toHaveAttribute("href", "/");
  await expect(logo).toHaveAttribute("src", /favicon\.ico/);
  await expect(logo).toHaveAttribute("alt", "");
  await expect(logo).toHaveAttribute("aria-hidden", "true");
  await expect(logo).toBeVisible();

  const imageSize = await logo.evaluate((image: HTMLImageElement) => ({
    width: image.getBoundingClientRect().width,
    height: image.getBoundingClientRect().height,
    loaded: image.complete && image.naturalWidth > 0,
  }));
  expect(imageSize).toEqual({ width: 26, height: 26, loaded: true });
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(logo).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const width of [1920, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const label of [
      "Dashboard",
      "Events",
      "Tasks",
      "Calendar",
      "Officers",
      "Points",
      "Admin",
    ])
      await expect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    await expectNoPageOverflow(page);
  }
});

test("administrative pages remain usable across desktop widths", async ({
  page,
}) => {
  await signInAsAdmin(page);

  const wideScreens = [
    ["/", "Dashboard"],
    ["/events", "Events"],
    ["/tasks", "Tasks"],
    ["/calendar", "Calendar"],
    ["/officers", "Officers"],
    ["/points", "Points"],
    ["/admin", "Admin"],
    ["/system-log", "System Log"],
  ] as const;

  for (const [path, heading] of wideScreens) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading }).first(),
    ).toBeVisible();
    const shell = page.locator(".protected-page-width");
    await expect(shell).toBeVisible();
    const width = await shell.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(width).toBeGreaterThanOrEqual(1200);
    expect(width).toBeLessThanOrEqual(1280);
    await expectNoPageOverflow(page);
  }

  await page.goto("/officers");
  for (const name of [
    "Name",
    "UTEP email",
    "Personal email",
    "Position",
    "Classification",
    "Branches",
    "Status",
  ])
    await expect(
      page.getByRole("columnheader", { name, exact: true }),
    ).toBeVisible();

  await page.goto("/points");
  const totals = page.getByRole("table").first();
  for (const name of ["Rank", "Officer", "Total points"])
    await expect(
      totals.getByRole("columnheader", { name, exact: true }),
    ).toBeVisible();

  await page.goto("/calendar");
  await expect(page.getByRole("checkbox", { name: "Events" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Tasks" })).toBeVisible();

  await page.goto("/admin");
  for (const name of [
    "Manage officers",
    "Manage positions and branches",
    "Open points administration",
    "View system log",
  ])
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

  await page.goto("/system-log");
  await expect(
    page.getByRole("searchbox", { name: "Search log" }),
  ).toBeVisible();
  await expect(
    page.getByText("Technical details", { exact: true }).first(),
  ).toBeVisible();

  await page.goto("/events");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("heading", { name: "Events", exact: true }),
  ).toBeVisible();
  await expectNoPageOverflow(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/events");
  for (const [path, heading] of wideScreens) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading }).first(),
    ).toBeVisible();
    await expectNoPageOverflow(page);
  }

  for (const width of [1920, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, heading] of wideScreens) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading }).first(),
      ).toBeVisible();
      await expectNoPageOverflow(page);
    }
  }
  await page.goto("/tasks");
  await expect(
    page.getByRole("button", { name: "Assign this task to me" }).first(),
  ).toBeVisible();
  await page.goto("/officers");
  for (const name of ["UTEP email", "Personal email", "Position", "Status"])
    await expect(
      page.getByRole("columnheader", { name, exact: true }),
    ).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("checkbox", { name: "Events" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Tasks" })).toBeVisible();
});

test("Points uses desktop space for totals, administration, and full-width history", async ({
  page,
}) => {
  await signInAsAdmin(page);

  for (const width of [1920, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/points");

    const content = page.locator(
      "main#main-content > div[data-page-width='wide']",
    );
    const overview = content.locator(":scope > div.grid");
    const totals = overview.locator(":scope > section");
    const administration = overview.locator(":scope > div");
    const history = content.locator(":scope > section").last();
    await expect(
      totals.getByRole("heading", { name: "Officer totals" }),
    ).toBeVisible();
    await expect(
      administration.getByRole("heading", { name: "Point configuration" }),
    ).toBeVisible();
    await expect(
      administration.getByRole("heading", {
        name: "Add manual transaction or correction",
      }),
    ).toBeVisible();
    await expect(
      history.getByRole("heading", { name: "Point history" }),
    ).toBeVisible();

    const [contentBox, totalsBox, administrationBox, historyBox] =
      await Promise.all([
        content.boundingBox(),
        totals.boundingBox(),
        administration.boundingBox(),
        history.boundingBox(),
      ]);
    expect(contentBox).not.toBeNull();
    expect(totalsBox).not.toBeNull();
    expect(administrationBox).not.toBeNull();
    expect(historyBox).not.toBeNull();
    expect(totalsBox!.x + totalsBox!.width).toBeLessThanOrEqual(
      administrationBox!.x + 1,
    );
    expect(historyBox!.x).toBeCloseTo(contentBox!.x, 0);
    expect(historyBox!.width).toBeCloseTo(contentBox!.width, 0);
    await expectNoPageOverflow(page);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/points");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByRole("button", { name: "Officer", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  for (const width of [1920, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/points");
    await expect(
      page.getByRole("heading", { name: "Officer totals" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Point history" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Participation rate: .* points\/hour/),
    ).toBeVisible();
    const content = page.locator(
      "main#main-content > div[data-page-width='wide']",
    );
    const totals = content.locator(":scope > div.max-w-4xl > section");
    const history = content.locator(":scope > section").last();
    const [contentBox, totalsBox, historyBox] = await Promise.all([
      content.boundingBox(),
      totals.boundingBox(),
      history.boundingBox(),
    ]);
    expect(contentBox).not.toBeNull();
    expect(totalsBox).not.toBeNull();
    expect(historyBox).not.toBeNull();
    expect(totalsBox!.width).toBeLessThan(contentBox!.width);
    expect(
      Math.abs(
        totalsBox!.x +
          totalsBox!.width / 2 -
          (contentBox!.x + contentBox!.width / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(historyBox!.x).toBeCloseTo(contentBox!.x, 0);
    expect(historyBox!.width).toBeCloseTo(contentBox!.width, 0);
    await expectNoPageOverflow(page);
  }
  await expect(
    page.getByRole("heading", {
      name: "Add manual transaction or correction",
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Participation points per hour")).toHaveCount(0);
  await expect(page.getByLabel("Status", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoPageOverflow(page);
});

test("Points keeps its Admin controls and contextual history links available", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/points");

  const form = page
    .locator("form")
    .filter({ has: page.locator('[name="officer_id"]') });
  for (const selector of [
    '[name="officer_id"]',
    '[name="points"]',
    '[name="reason"]',
    '[name="award_type"]',
    '[type="search"]',
    '[name="event_id"]',
  ])
    await expect(form.locator(selector)).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Search events" }),
  ).toBeVisible();
  await expect(page.getByLabel("Participation points per hour")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save rate" })).toBeVisible();

  const filters = page.getByRole("search", { name: "Point history filters" });
  for (const name of ["q", "type", "officer", "event", "status", "from", "to"])
    await expect(filters.locator(`[name="${name}"]`)).toBeVisible();
  await expect(
    filters.getByRole("button", { name: "Apply filters" }),
  ).toBeVisible();

  const eventRow = page
    .getByRole("row")
    .filter({ has: page.locator("a[href^='/events/']:visible") })
    .filter({ has: page.locator("a[href^='/officers/']:visible") })
    .first();
  await expect(
    eventRow.locator("a[href^='/officers/']:visible").first(),
  ).toBeVisible();
  await expect(
    eventRow.locator("a[href^='/events/']:visible").first(),
  ).toBeVisible();
  await expect(
    eventRow.getByRole("spinbutton", { name: "Points" }),
  ).toBeVisible();
  await expect(
    eventRow.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await expect(
    eventRow.getByRole("button", { name: "Remove", exact: true }),
  ).toBeVisible();
});
