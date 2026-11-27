const UTF8_BOM = "\uFEFF";
const FORMULA_TRIGGER_PATTERN = /^[\s]*[=+\-@\t\r]/;
const CSV_NEEDS_QUOTES_PATTERN = /[",\r\n]/;

export type CsvCellValue = string | number | null | undefined;

/**
 * Escapes a single CSV cell according to RFC 4180 and neutralizes potential
 * spreadsheet formula injection (OWASP CSV Injection guidance) for text cells.
 *
 * Explicitly numeric values (such as negative Point adjustments like -2.5)
 * are formatted as plain numbers after verifying they are finite.
 */
export function escapeCsvCell(value: CsvCellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  const normalized = FORMULA_TRIGGER_PATTERN.test(value) ? `'${value}` : value;
  if (CSV_NEEDS_QUOTES_PATTERN.test(normalized)) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }
  return normalized;
}

/**
 * Serializes headers and rows into an Excel-compatible UTF-8 CSV (with BOM
 * and CRLF line endings per RFC 4180).
 */
export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvCellValue[])[],
): string {
  const lines = [
    headers.map((header) => escapeCsvCell(header)).join(","),
    ...rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")),
  ];
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export function slugifyFilenamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function csvFilename(
  prefix: string,
  date: string,
  slug?: string,
): string {
  const safeSlug = slug ? slugifyFilenamePart(slug) : "";
  return safeSlug
    ? `${prefix}-${safeSlug}-${date}.csv`
    : `${prefix}-${date}.csv`;
}

export function csvResponse(
  csv: string,
  filename: string,
  rowCount: number,
): Response {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Export-Row-Count": String(rowCount),
    },
  });
}

const DEFAULT_PAGE_SIZE = 1000;

/**
 * Fetches every page of a PostgREST query using inclusive `.range(from, to)`
 * slices so exports never silently truncate at the 1,000-row API cap.
 * Throws immediately on any page error so callers never emit a partial CSV.
 */
export async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error || data === null) {
      throw new Error(error?.message ?? "Failed to load export rows");
    }
    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}
