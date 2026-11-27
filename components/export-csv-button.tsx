"use client";

import { useState } from "react";
import { Download } from "lucide-react";

function parseDownloadFilename(
  contentDisposition: string | null,
  fallback: string,
) {
  if (!contentDisposition) return fallback;
  const match = contentDisposition.match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
}

export function ExportCsvButton({
  href,
  label = "Export CSV",
  emptyMessage = "No matching records to export.",
  className = "",
}: {
  href: string;
  label?: string;
  emptyMessage?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleExport() {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(href, {
        method: "GET",
        credentials: "same-origin",
      });
      if (!response.ok) {
        let message = "Could not export CSV. Try again.";
        try {
          const payload = (await response.json()) as { error?: unknown };
          if (typeof payload.error === "string" && payload.error.trim()) {
            message = payload.error;
          }
        } catch {
          // Non-JSON error body; keep fallback message.
        }
        setError(message);
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("text/csv")) {
        setError("Could not export CSV. Try again.");
        return;
      }

      const rowCountHeader = response.headers.get("x-export-row-count");
      const rowCount =
        rowCountHeader !== null && /^\d+$/.test(rowCountHeader)
          ? Number(rowCountHeader)
          : null;
      if (rowCount === 0) {
        setNotice(emptyMessage);
        return;
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        setError("Could not export CSV. Try again.");
        return;
      }

      const filename = parseDownloadFilename(
        response.headers.get("content-disposition"),
        "export.csv",
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setNotice(
        rowCount !== null
          ? `Exported ${rowCount} row${rowCount === 1 ? "" : "s"}.`
          : "CSV downloaded.",
      );
    } catch {
      setError("Could not export CSV. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleExport}
        disabled={pending}
        aria-busy={pending}
        className="button-secondary inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-60 lg:min-h-0"
      >
        <Download aria-hidden="true" size={14} />
        {pending ? "Exporting…" : label}
      </button>
      {error && (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      )}
      {!error && notice && (
        <span role="status" className="text-xs font-medium text-muted">
          {notice}
        </span>
      )}
    </div>
  );
}
