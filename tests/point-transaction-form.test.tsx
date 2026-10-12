import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(protected)/points/actions", () => ({
  addTransaction: vi.fn(),
  searchEvents: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import TransactionForm, {
  mergeEventSearchResults,
} from "@/app/(protected)/points/transaction-form";

const repeatedEvents = [
  { id: 11, name: "Repeated event", event_date: "2026-10-08" },
  { id: 12, name: "Repeated event", event_date: "2026-10-15" },
];

it("disambiguates duplicate Event names by occurrence date and preserves IDs", () => {
  const html = renderToStaticMarkup(
    <TransactionForm officers={[]} events={repeatedEvents} />,
  );

  expect(html).toContain(
    '<option value="11">Repeated event — Oct 8, 2026</option>',
  );
  expect(html).toContain(
    '<option value="12">Repeated event — Oct 15, 2026</option>',
  );
});

it("retains a previously selected Event when another search returns new matches", () => {
  const selected = repeatedEvents[0];
  expect(
    mergeEventSearchResults(
      [selected],
      [{ id: 14, name: "Older event", event_date: "2025-02-10" }],
    ),
  ).toEqual([
    selected,
    { id: 14, name: "Older event", event_date: "2025-02-10" },
  ]);
});
