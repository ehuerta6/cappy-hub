// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  CopyCanonicalLinkButton,
  CopyTextButton,
} from "@/components/copy-button";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it("copies plain text and canonical links to clipboard and updates button state", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  await act(async () => {
    root.render(
      <div>
        <CopyTextButton value="ada@utep.edu" label="Copy Ada email" />
        <CopyCanonicalLinkButton path="/events/42" />
      </div>,
    );
  });

  const emailBtn = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Copy Ada email"]',
  )!;
  const linkBtn = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Copy link"]',
  )!;

  await act(async () => {
    emailBtn.click();
  });
  expect(writeText).toHaveBeenCalledWith("ada@utep.edu");

  await act(async () => {
    linkBtn.click();
  });
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/events/42`);
  expect(linkBtn.textContent).toContain("Copied");
});
