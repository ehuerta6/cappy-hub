import { expect, test } from "@playwright/test";

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
}

test("Create Task Linked Events supports search, keyboard selection, removal, and empty submission", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/tasks/new");

  const input = page.getByRole("combobox", { name: "Linked Events" });
  const taskForm = page.locator("form").filter({ has: input });
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await expect(input).toHaveAttribute("aria-describedby", /.+/);
  await input.fill("Mock: Intro Hash Maps");
  await expect(
    page.getByRole("option", { name: /Mock: Intro Hash Maps/ }),
  ).toBeVisible();
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: /Remove Mock: Intro Hash Maps/ }),
  ).toBeVisible();

  await input.fill("Mock: Officer Meeting");
  await page.getByRole("option", { name: /Mock: Officer Meeting/ }).click();
  await expect(
    page.getByRole("button", { name: /Remove Mock: Officer Meeting/ }),
  ).toBeVisible();
  expect(
    await taskForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).getAll("event_ids"),
    ),
  ).toHaveLength(2);

  await page
    .getByRole("button", { name: /Remove Mock: Intro Hash Maps/ })
    .click();
  expect(
    await taskForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).getAll("event_ids"),
    ),
  ).toHaveLength(1);

  await input.fill("no event can match this phrase");
  await expect(page.getByText("No matching Events.")).toBeVisible();
  await input.press("Escape");
  await page.getByLabel("Title").click();
  await expect(page.getByText("No matching Events.")).toBeHidden();
  expect(
    await taskForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).getAll("event_ids"),
    ),
  ).toHaveLength(1);
  await input.click();
  expect(
    await taskForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).getAll("event_ids"),
    ),
  ).toHaveLength(1);

  await page.getByLabel("Title").click();
  await page
    .getByRole("button", { name: /Remove Mock: Officer Meeting/ })
    .click();
  expect(
    await taskForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).getAll("event_ids"),
    ),
  ).toEqual([]);
});

test("Edit Task tracks linked Event changes without changing other fields", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/tasks/-8002/edit");

  const input = page.getByRole("combobox", { name: "Linked Events" });
  const taskForm = page.locator("form").filter({ has: input });
  await input.fill("Mock: Intro Hash Maps");
  await page.getByRole("option", { name: /Mock: Intro Hash Maps/ }).click();
  await expect(page.locator('input[name="edited_fields"]')).toHaveValue(
    "event_ids",
  );
  expect(
    await taskForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).getAll("event_ids"),
    ),
  ).toHaveLength(1);

  await page
    .getByRole("button", { name: /Remove Mock: Intro Hash Maps/ })
    .click();
  await expect(page.locator('input[name="edited_fields"]')).toHaveCount(0);
  expect(
    await taskForm.evaluate((form) =>
      new FormData(form as HTMLFormElement).getAll("event_ids"),
    ),
  ).toEqual([]);
});

test("selected Linked Events survive server validation errors", async ({
  page,
}) => {
  await signInAsAdmin(page);

  for (const scenario of [
    { path: "/tasks/new", submit: "Create task" },
    { path: "/tasks/-8002/edit", submit: "Save task" },
  ]) {
    await page.goto(scenario.path);
    const input = page.getByRole("combobox", { name: "Linked Events" });
    const taskForm = page.locator("form").filter({ has: input });
    await input.fill("Mock: Intro Hash Maps");
    await page.getByRole("option", { name: /Mock: Intro Hash Maps/ }).click();

    if (scenario.path === "/tasks/new") {
      await page.getByLabel("Title").fill("Validation retention check");
      await page
        .getByLabel("Description")
        .fill("Will be rejected by validation.");
      await page.getByLabel("Type").selectOption({ label: "Flyer" });
      await page.getByLabel("Branch").selectOption({ index: 1 });
      await page.getByLabel("Due date").fill("2026-10-20");
    }
    await page.getByLabel("Points").fill("0");
    await page.getByRole("button", { name: scenario.submit }).click();

    await expect(page.getByLabel("Points")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      page.getByText("Enter a positive point value").first(),
    ).toBeVisible();
    expect(
      await taskForm.evaluate((form) =>
        new FormData(form as HTMLFormElement).getAll("event_ids"),
      ),
    ).toHaveLength(1);
    await expect(
      page.getByRole("button", { name: /Remove Mock: Intro Hash Maps/ }),
    ).toBeVisible();
  }
});
