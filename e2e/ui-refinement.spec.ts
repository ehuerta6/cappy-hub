import { expect, test, type Page } from "@playwright/test";

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
}

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("Cappy Hub brand mark stays decorative and compact across themes and widths", async ({
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

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(brand).toBeVisible();
  await expect(logo).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByText("Section: Dashboard", { exact: true }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoPageOverflow(page);
});

test("administrative pages remain usable across desktop and compact widths", async ({
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

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, heading] of wideScreens) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading }).first(),
    ).toBeVisible();
    await expectNoPageOverflow(page);
  }
  await page.goto("/tasks");
  await expect(
    page.getByRole("button", { name: "Assign this task to me" }).first(),
  ).toBeVisible();
  await page.goto("/officers");
  await expect(
    page.getByText("Contact details", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("checkbox", { name: "Events" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Tasks" })).toBeVisible();
});
