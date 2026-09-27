export function formatLabel(value: string) {
  const known: Record<string, string> = {
    icpc: "ICPC",
    phd: "PhD",
  };
  return (
    known[value.toLowerCase()] ??
    value
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

const dateOptions: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
};

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", dateOptions);
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    ...dateOptions,
    hour: "numeric",
    minute: "2-digit",
  });
}
