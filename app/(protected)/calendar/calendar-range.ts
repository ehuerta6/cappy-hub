const denverDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Denver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function denverDate(instant: Date) {
  const parts = denverDateFormatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function parseCalendarRange(startValue: string, endValue: string) {
  if (typeof startValue !== "string" || typeof endValue !== "string")
    throw new Error("Invalid Calendar range");
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start.toISOString() !== startValue ||
    end.toISOString() !== endValue ||
    end <= start ||
    end.getTime() - start.getTime() > 62 * 24 * 60 * 60 * 1000
  )
    throw new Error("Invalid Calendar range");

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: denverDate(start),
    endDate: denverDate(end),
  };
}
