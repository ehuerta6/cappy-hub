import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ActionFeedback, FieldError, SuccessNotice } from "@/components/ui";
import { successNotice, withSuccessNotice } from "@/lib/mutation-feedback";

it("renders form errors as alerts and success messages as status updates", () => {
  const error = renderToStaticMarkup(
    createElement(ActionFeedback, {
      state: { error: "Choose a valid date", success: "" },
    }),
  );
  const success = renderToStaticMarkup(
    createElement(ActionFeedback, {
      state: { error: "", success: "Event saved" },
    }),
  );

  expect(error).toContain('role="alert"');
  expect(error).toContain("Choose a valid date");
  expect(success).toContain('role="status"');
  expect(success).toContain("Event saved");
});

it("keeps field errors connected to invalid controls", () => {
  const html = renderToStaticMarkup(
    createElement(
      "label",
      null,
      "Email",
      createElement("input", {
        type: "email",
        "aria-invalid": true,
        "aria-describedby": "email-error",
      }),
      createElement(FieldError, { id: "email-error" }, "Enter a valid email"),
    ),
  );

  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('aria-describedby="email-error"');
  expect(html).toContain('id="email-error"');
  expect(html).toContain("Enter a valid email");
});

it("accepts only controlled post-redirect success keys", () => {
  const valid = renderToStaticMarkup(
    createElement(SuccessNotice, { status: "event-saved" }),
  );
  const reflected = renderToStaticMarkup(
    createElement(SuccessNotice, {
      status: "<img src=x onerror=alert(1)>",
    }),
  );

  expect(valid).toContain('role="status"');
  expect(valid).toContain("Event saved");
  expect(reflected).toBe("");
  expect(successNotice("officer-saved")).toBe("Officer saved");
  expect(successNotice(["event-saved"])).toBeUndefined();
  expect(successNotice("Officer saved")).toBeUndefined();
});

it("preserves filtered return context and fragments when adding a status", () => {
  expect(
    withSuccessNotice(
      "/events/12?returnTo=%2Fevents%3Fq%3Dmeeting%26branch%3D2#details",
      "event-saved",
    ),
  ).toBe(
    "/events/12?returnTo=%2Fevents%3Fq%3Dmeeting%26branch%3D2&feedback=event-saved#details",
  );
  expect(
    withSuccessNotice(
      "/tasks/9?feedback=old&returnTo=%2Ftasks%3Fbranch%3D2",
      "task-updated",
    ),
  ).toBe("/tasks/9?returnTo=%2Ftasks%3Fbranch%3D2&feedback=task-updated");
  expect(withSuccessNotice("https://evil.example/", "event-saved")).toBe("/");
  // @ts-expect-error Exercise the runtime guard with an invalid internal route.
  expect(withSuccessNotice("//evil.example/", "event-saved")).toBe("/");
});
