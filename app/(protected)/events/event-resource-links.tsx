export default function EventResourceLinks({
  slidesUrl,
  meetingNotesUrl,
  signupSheetUrl,
}: {
  slidesUrl: string | null;
  meetingNotesUrl: string | null;
  signupSheetUrl: string | null;
}) {
  if (!slidesUrl && !meetingNotesUrl && !signupSheetUrl) return null;

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">
        Links and files
      </h3>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {slidesUrl && <ResourceLink href={slidesUrl}>Open slides</ResourceLink>}
        {meetingNotesUrl && (
          <ResourceLink href={meetingNotesUrl}>Open notes</ResourceLink>
        )}
        {signupSheetUrl && (
          <ResourceLink href={signupSheetUrl}>Open signup sheet</ResourceLink>
        )}
      </div>
    </section>
  );
}

function ResourceLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-9 items-center underline underline-offset-4"
    >
      {children}
    </a>
  );
}
