"use client";

import { useState } from "react";
import {
  resourceLinkKinds,
  resourceLinkLabel,
  type ResourceLinkDraft,
} from "@/lib/resource-links";

const kindNames: Record<(typeof resourceLinkKinds)[number], string> = {
  slides: "Slides",
  meeting_notes: "Meeting notes",
  signup_sheet: "Signup sheet",
  documentation: "Documentation",
  custom: "Other",
};

export default function ResourceLinksEditor({
  initialValue,
  error,
  onChange,
}: {
  initialValue: string;
  error?: string;
  onChange?: (value: string) => void;
}) {
  const [resources, setResources] = useState<ResourceLinkDraft[]>(() => {
    try {
      const value: unknown = JSON.parse(initialValue);
      return Array.isArray(value) ? (value as ResourceLinkDraft[]) : [];
    } catch {
      return [];
    }
  });

  function update(next: ResourceLinkDraft[]) {
    setResources(next);
    onChange?.(JSON.stringify(next));
  }

  function change(index: number, patch: Partial<ResourceLinkDraft>) {
    update(
      resources.map((resource, currentIndex) => {
        if (currentIndex !== index) return resource;
        const next = { ...resource, ...patch };
        if (patch.kind) {
          next.label = resourceLinkLabel(patch.kind);
          next.legacy_key =
            patch.kind === "slides" ||
            patch.kind === "meeting_notes" ||
            patch.kind === "signup_sheet"
              ? resource.legacy_key === patch.kind
                ? patch.kind
                : null
              : null;
        }
        return next;
      }),
    );
  }

  return (
    <fieldset className="event-form-section event-form-resources col-span-full">
      <legend>Resource links</legend>
      <p className="event-form-section-description">
        Add optional links for this Event or Task. Each link needs a label and
        an HTTP or HTTPS URL.
      </p>
      <input
        type="hidden"
        name="resource_links"
        value={JSON.stringify(resources)}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="space-y-3">
        {resources.map((resource, index) => (
          <div
            className="grid items-end gap-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(14rem,2fr)_auto]"
            key={resource.legacy_key ?? "new-" + index}
          >
            <label>
              Link type
              <select
                aria-label={"Link " + (index + 1) + " type"}
                value={resource.kind}
                onChange={(event) =>
                  change(index, {
                    kind: event.currentTarget
                      .value as ResourceLinkDraft["kind"],
                  })
                }
              >
                {resourceLinkKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kindNames[kind]}
                  </option>
                ))}
              </select>
            </label>
            {resource.kind === "custom" ? (
              <label>
                Link label
                <input
                  aria-label={"Link " + (index + 1) + " label"}
                  maxLength={80}
                  value={resource.label}
                  onChange={(event) =>
                    change(index, { label: event.currentTarget.value })
                  }
                />
              </label>
            ) : (
              <div className="text-sm text-muted sm:pb-3">{resource.label}</div>
            )}
            <label className="sm:col-start-2 sm:row-start-2">
              URL
              <input
                aria-label={"Link " + (index + 1) + " URL"}
                type="url"
                inputMode="url"
                value={resource.url}
                onChange={(event) =>
                  change(index, { url: event.currentTarget.value })
                }
              />
            </label>
            <button
              className="button-secondary min-h-11 sm:col-start-3 sm:row-span-2 sm:row-start-1"
              type="button"
              onClick={() =>
                update(resources.filter((_, row) => row !== index))
              }
            >
              Remove link
            </button>
          </div>
        ))}
      </div>
      <button
        className="button-secondary mt-3 min-h-11"
        type="button"
        onClick={() =>
          update([
            ...resources,
            { kind: "custom", label: "", url: "", legacy_key: null },
          ])
        }
      >
        Add link
      </button>
      {resources.some((resource) => resource.kind === "signup_sheet") && (
        <p className="mt-2 text-sm text-muted">
          Signup sheet links are external resources. Cappy Hub signups,
          capacity, and participation remain separate.
        </p>
      )}
    </fieldset>
  );
}
