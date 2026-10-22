import type { GoogleCalendarEvent } from "./google-calendar-event";

export class GoogleCalendarApiError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

export class GoogleCalendarApi {
  constructor(
    private readonly accessToken: string,
    private readonly calendarId: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async upsert(event: GoogleCalendarEvent): Promise<void> {
    const existing = await this.call(
      "GET",
      `events/${event.id}`,
      undefined,
      [404, 410],
    );
    if (existing.status === 404 || existing.status === 410) {
      const inserted = await this.call("POST", "events", event, [409]);
      if (inserted.status === 409) {
        throw new GoogleCalendarApiError(
          409,
          "Google Calendar event was concurrently created",
        );
      }
      return;
    }
    const etag = this.etag(existing);
    await this.call("PUT", `events/${event.id}`, event, [], etag);
  }

  async remove(eventId: string): Promise<void> {
    const existing = await this.call(
      "GET",
      `events/${eventId}`,
      undefined,
      [404, 410],
    );
    if (existing.status === 404 || existing.status === 410) return;
    await this.call(
      "DELETE",
      `events/${eventId}`,
      undefined,
      [404, 410],
      this.etag(existing),
    );
  }

  private async call(
    method: string,
    path: string,
    body?: GoogleCalendarEvent,
    toleratedStatuses: number[] = [],
    etag?: string,
  ): Promise<Response> {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/${path}`,
    );
    if (method !== "GET") url.searchParams.set("sendUpdates", "none");

    let response: Response;
    try {
      response = await this.request(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(etag ? { "If-Match": etag } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new GoogleCalendarApiError(
        null,
        "Google Calendar network request failed",
      );
    }

    if (!response.ok && !toleratedStatuses.includes(response.status)) {
      throw new GoogleCalendarApiError(
        response.status,
        `Google Calendar returned HTTP ${response.status}`,
      );
    }
    return response;
  }

  private etag(response: Response): string {
    const etag = response.headers.get("etag");
    if (!etag) {
      throw new GoogleCalendarApiError(
        null,
        "Google Calendar response did not include an event version",
      );
    }
    return etag;
  }
}
