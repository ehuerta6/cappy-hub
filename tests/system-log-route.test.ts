import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import RetiredSystemLogPage from "@/app/(protected)/system-log/page";

it("redirects the retired route to the existing Admin access boundary", () => {
  expect(RetiredSystemLogPage).toThrow("redirect:/admin");
});
