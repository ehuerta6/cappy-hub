// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ExportCsvButton } from "@/components/export-csv-button";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("ExportCsvButton", () => {
  it("shows a clear message and skips downloading when there are zero matching rows", async () => {
    const createObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("\uFEFFName,Email,Classification,Position\r\n", {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "X-Export-Row-Count": "0",
          },
        }),
      ),
    );

    await act(async () => {
      root.render(
        <ExportCsvButton
          href="/api/exports/officers"
          emptyMessage="No matching officers to export."
        />,
      );
    });

    const button = container.querySelector("button")!;
    await act(async () => {
      button.click();
    });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "No matching officers to export.",
    );
  });

  it("shows an error alert and never downloads on server failure", async () => {
    const createObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await act(async () => {
      root.render(<ExportCsvButton href="/api/exports/officers" />);
    });

    const button = container.querySelector("button")!;
    await act(async () => {
      button.click();
    });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Admin access required",
    );
  });
});
