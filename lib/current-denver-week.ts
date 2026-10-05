import { Temporal } from "temporal-polyfill";
import { denverParts } from "./event-time";

export function currentDenverWeek(now: Date) {
  const today = Temporal.PlainDate.from(denverParts(now).date);
  return {
    today: today.toString(),
    sunday: today.add({ days: 7 - today.dayOfWeek }).toString(),
  };
}
