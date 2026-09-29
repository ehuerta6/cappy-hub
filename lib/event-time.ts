const zone = "America/Denver";
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function denverParts(value: string | Date) {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(value))
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function denverTimestamp(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(wall)) return null;
  const guess = new Date(wall);
  const local = denverParts(guess);
  const [localYear, localMonth, localDay] = local.date.split("-").map(Number);
  const [localHour, localMinute] = local.time.split(":").map(Number);
  const offset =
    Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute) -
    wall;
  const actual = new Date(wall - offset);
  const resolved = denverParts(actual);
  return resolved.date === date && resolved.time === time
    ? actual.toISOString()
    : null;
}
