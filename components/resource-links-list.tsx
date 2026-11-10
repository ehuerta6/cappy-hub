import { SectionHeading } from "@/components/ui";

type ResourceLinkListItem = {
  id: number;
  kind: string;
  label: string;
  url: string;
};

export function ResourceLinksList({
  resources,
}: {
  resources: ResourceLinkListItem[];
}) {
  if (!resources.length) return null;

  return (
    <section aria-label="Resource links" className="space-y-2">
      <SectionHeading title="Resource links" />
      <ul className="space-y-1">
        {resources.map((resource) => (
          <li key={resource.id}>
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {resource.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
      {resources.some((resource) => resource.kind === "signup_sheet") && (
        <p className="text-sm text-muted">
          Signup sheet links are external resources. Cappy Hub signups,
          capacity, and participation remain separate.
        </p>
      )}
    </section>
  );
}
