// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import PointsRankingTableClient from "@/app/(protected)/points/ranking-table-client";

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
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const rows = [
  { id: 1, name: "Ada Lovelace", total_points: 20, normal_points: 20, negative_points: 0 },
  { id: 2, name: "Grace Hopper", total_points: 18, normal_points: 18, negative_points: 0 },
  { id: 3, name: "Alan Turing", total_points: 15, normal_points: 16, negative_points: -1 },
  { id: 4, name: "Katherine Johnson", total_points: 12, normal_points: 12, negative_points: 0 },
  { id: 5, name: "Margaret Hamilton", total_points: 10, normal_points: 10, negative_points: 0 },
  { id: 6, name: "Donald Knuth", total_points: 8, normal_points: 8, negative_points: 0 },
];

it("highlights the current officer row, preserves rank numbers while filtering, and handles empty matches", async () => {
  await act(async () => {
    root.render(<PointsRankingTableClient rows={rows} actorId={4} />);
  });

  const myRow = host.querySelector("#my-rank");
  expect(myRow?.textContent).toContain("Katherine Johnson");
  expect(myRow?.textContent).toContain("You");

  const search = host.querySelector<HTMLInputElement>(
    'input[aria-label="Find officer in ranking"]',
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(search, "Knuth");
    search.dispatchEvent(new Event("input", { bubbles: true }));
    search.dispatchEvent(new Event("change", { bubbles: true }));
  });

  expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(host.querySelector("tbody tr td")?.textContent).toBe("6");
  expect(host.textContent).toContain("1 of 6 shown");
});
