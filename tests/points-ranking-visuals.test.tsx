// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import PointsRankingTableClient from "@/app/(protected)/points/ranking-table-client";
import GroupedPointsRankingClient from "@/app/(protected)/points/grouped-ranking-view";
import { resolvePointsView } from "@/app/(protected)/points/validation";
import {
  getTopRankTier,
  groupRankingByBranch,
  groupRankingByPosition,
  type GroupedRankingOfficer,
} from "@/lib/points-ranking";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("points ranking presentation helpers", () => {
  it("identifies only ranks 1, 2, and 3 as top-rank tiers", () => {
    expect(getTopRankTier(1)).toBe(1);
    expect(getTopRankTier(2)).toBe(2);
    expect(getTopRankTier(3)).toBe(3);
    expect(getTopRankTier(4)).toBeNull();
    expect(getTopRankTier(0)).toBeNull();
  });

  it("resolves overview, branch, position, and history views cleanly", () => {
    expect(resolvePointsView({})).toBe("overview");
    expect(resolvePointsView({ view: "branch" })).toBe("branch");
    expect(resolvePointsView({ view: "position" })).toBe("position");
    expect(resolvePointsView({ view: "history" })).toBe("history");
    expect(resolvePointsView({ q: "workshop" })).toBe("history");
  });

  it("groups rankings by branch and by position while preserving sort order", () => {
    const officers: GroupedRankingOfficer[] = [
      {
        id: 1,
        name: "Multi Lead",
        total_points: 20,
        normal_points: 20,
        negative_points: 0,
        positionId: 2,
        positionName: "Lead",
        branches: [
          { id: 10, name: "intro" },
          { id: 20, name: "icpc" },
        ],
      },
      {
        id: 2,
        name: "Intro Officer",
        total_points: 10,
        normal_points: 10,
        negative_points: 0,
        positionId: 1,
        positionName: "Officer",
        branches: [{ id: 10, name: "intro" }],
      },
      {
        id: 3,
        name: "Unassigned Officer",
        total_points: 4,
        normal_points: 4,
        negative_points: 0,
        positionId: 1,
        positionName: "Officer",
        branches: [],
      },
    ];

    const byBranch = groupRankingByBranch(officers);
    expect(byBranch.map((g) => g.label)).toEqual([
      "ICPC",
      "Intro",
      "No branch",
    ]);
    expect(byBranch[0].rows.map((r) => r.name)).toEqual(["Multi Lead"]);
    expect(byBranch[1].rows.map((r) => r.name)).toEqual([
      "Multi Lead",
      "Intro Officer",
    ]);
    expect(byBranch[1].averagePoints).toBe(15);
    expect(byBranch[2].rows.map((r) => r.name)).toEqual(["Unassigned Officer"]);

    const byPosition = groupRankingByPosition(officers);
    expect(byPosition.map((g) => g.label)).toEqual(["Lead", "Officer"]);
    expect(byPosition[1].rows.map((r) => r.name)).toEqual([
      "Intro Officer",
      "Unassigned Officer",
    ]);
    expect(byPosition[1].averagePoints).toBe(7);
  });
});

describe("PointsRankingTableClient top-3 visual markers", () => {
  const sampleRows = [
    {
      id: 1,
      name: "Alice Tied",
      total_points: 20,
      normal_points: 20,
      negative_points: 0,
    },
    {
      id: 2,
      name: "Bob Tied",
      total_points: 20,
      normal_points: 21,
      negative_points: -1,
    },
    {
      id: 3,
      name: "Cara Third",
      total_points: 10,
      normal_points: 10,
      negative_points: 0,
    },
    {
      id: 4,
      name: "Devon Fourth",
      total_points: 5,
      normal_points: 5,
      negative_points: 0,
    },
    {
      id: 5,
      name: "Eli Negative",
      total_points: -2,
      normal_points: 0,
      negative_points: -2,
    },
    {
      id: 6,
      name: "Fran Zero",
      total_points: 0,
      normal_points: 0,
      negative_points: 0,
    },
  ];

  it("renders non-color top-3 badges and accessible labels without progress bars or obscured totals", () => {
    const html = renderToStaticMarkup(
      createElement(PointsRankingTableClient, {
        rows: sampleRows,
        actorId: 4,
      }),
    );

    expect(html).toContain('data-rank-tier="1"');
    expect(html).toContain('data-rank-tier="2"');
    expect(html).toContain('data-rank-tier="3"');
    expect(html).not.toContain('data-rank-tier="4"');

    // Textual markers so distinction never relies on color alone
    expect(html).toContain(">1st<");
    expect(html).toContain(">2nd<");
    expect(html).toContain(">3rd<");
    expect(html).toContain(" place</span>");

    // Numeric totals remain intact
    expect(html).toContain("+20");
    expect(html).toContain("+10");
    expect(html).toContain("-2");
    expect(html).not.toContain("ranking-progress-track");

    // Keyboard-accessible scrollable region
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
  });

  it("preserves original rank when filtering by name", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        createElement(PointsRankingTableClient, {
          rows: sampleRows,
          actorId: 4,
        }),
      );
    });

    const searchInput = container.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(searchInput, "Devon");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-rank-tier")).toBeNull();
    expect(rows[0].textContent).toContain("4");
    expect(rows[0].textContent).toContain("Devon Fourth");

    act(() => {
      root.unmount();
    });
  });

  it("renders GroupedPointsRankingClient with filter pills and per-group filtering", () => {
    const groups = groupRankingByPosition([
      {
        id: 1,
        name: "Lead One",
        total_points: 18,
        normal_points: 18,
        negative_points: 0,
        positionId: 2,
        positionName: "Lead",
        branches: [],
      },
      {
        id: 2,
        name: "Officer One",
        total_points: 12,
        normal_points: 12,
        negative_points: 0,
        positionId: 1,
        positionName: "Officer",
        branches: [],
      },
    ]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        createElement(GroupedPointsRankingClient, {
          mode: "position",
          groups,
          actorId: 2,
          periodName: "Fall 2026",
        }),
      );
    });

    expect(container.querySelectorAll("section")).toHaveLength(2);
    const leadButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Lead (1)"),
    );
    expect(leadButton).toBeDefined();

    act(() => {
      leadButton!.click();
    });

    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(container.textContent).toContain("Lead One");
    expect(container.textContent).not.toContain("Officer One");

    act(() => {
      root.unmount();
    });
  });
});
