import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(protected)/points/actions", () => ({
  addTransaction: vi.fn(),
  searchEvents: vi.fn(),
}));

import TransactionForm from "@/app/(protected)/points/transaction-form";

it("disambiguates duplicate Event names by occurrence date and preserves IDs", () => {
  const html = renderToStaticMarkup(
    <TransactionForm
      officers={[]}
      events={[
        { id: 11, name: "Repeated event", event_date: "2026-10-08" },
        { id: 12, name: "Repeated event", event_date: "2026-10-15" },
      ]}
    />,
  );

  expect(html).toContain(
    '<option value="11">Repeated event — Oct 8, 2026</option>',
  );
  expect(html).toContain(
    '<option value="12">Repeated event — Oct 15, 2026</option>',
  );
});
