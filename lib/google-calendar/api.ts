import type { GoogleEventProjection } from "./projection";

type GoogleEventResponse = {
  id?: string;
  status?: string;
  etag?: string;
  htmlLink?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export class GoogleCalendarApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(`Google Calendar API returned ${status} (${reason})`);
    this.name = "GoogleCalendarApiError";
  }
}

type UpsertResult =
  | {
      status: "synced";
      etag: string | null;
      htmlLink: string | null;
    }
  | { status: "superseded" };

export class GoogleCalendarApi {
  constructor(
    private readonly options: {
      calendarId: string;
      getAccessToken: () => Promise<string>;
      fetcher?: typeof fetch;
    },
  ) {}

  async verifyCalendar(): Promise<void> {
    const calendar = await this.request<{ id?: string }>(
      "GET",
      `/calendars/${encodeURIComponent(this.options.calendarId)}`,
    );
    if (calendar.id !== this.options.calendarId)
      throw new GoogleCalendarApiError(403, "calendar_identity_mismatch");
    const entry = await this.request<{ id?: string; accessRole?: string }>(
      "GET",
      `/users/me/calendarList/${encodeURIComponent(this.options.calendarId)}`,
    );
    if (
      entry.id !== this.options.calendarId ||
      !["writer", "owner"].includes(entry.accessRole ?? "")
    )
      throw new GoogleCalendarApiError(403, "calendar_write_access_required");
  }

  async upsert(
    event: GoogleEventProjection,
    previousEtag: string | null = null,
  ): Promise<UpsertResult> {
    if (previousEtag) {
      const existing = await this.get(event.id);
      if (!existing) return this.insert(event);
      return this.patchIfCurrent(event, existing);
    }

    try {
      const inserted = await this.request<GoogleEventResponse>(
        "POST",
        `${this.eventsPath()}?sendUpdates=none`,
        event,
      );
      return this.result(inserted);
    } catch (error) {
      if (!(error instanceof GoogleCalendarApiError) || error.status !== 409)
        throw error;
      const existing = await this.get(event.id);
      if (!existing) return this.insert(event);
      return this.patchIfCurrent(event, existing);
    }
  }

  async readOwnedEvent(eventId: string, cappyHubEventId: string) {
    const event = await this.get(eventId);
    if (!event) return null;
    this.assertRemoteIdentity(eventId, cappyHubEventId, event);
    return event;
  }

  async readEventStatus(eventId: string): Promise<string | null> {
    try {
      const event = await this.get(eventId);
      return event?.status ?? null;
    } catch (error) {
      if (
        error instanceof GoogleCalendarApiError &&
        (error.status === 404 || error.status === 410)
      )
        return null;
      throw error;
    }
  }

  async delete(
    eventId: string,
    cappyHubEventId: string,
  ): Promise<{ status: "removed" }> {
    let existing: GoogleEventResponse | null;
    try {
      existing = await this.get(eventId);
    } catch (error) {
      if (
        error instanceof GoogleCalendarApiError &&
        (error.status === 404 || error.status === 410)
      )
        return { status: "removed" };
      throw error;
    }
    if (!existing || existing.status === "cancelled")
      return { status: "removed" };
    this.assertRemoteIdentity(eventId, cappyHubEventId, existing);
    try {
      await this.request<void>(
        "DELETE",
        `${this.eventsPath()}/${encodeURIComponent(eventId)}?sendUpdates=none`,
      );
    } catch (error) {
      if (
        !(error instanceof GoogleCalendarApiError) ||
        (error.status !== 404 && error.status !== 410)
      )
        throw error;
    }
    return { status: "removed" };
  }

  private eventsPath() {
    return `/calendars/${encodeURIComponent(this.options.calendarId)}/events`;
  }

  private async insert(event: GoogleEventProjection): Promise<UpsertResult> {
    try {
      const inserted = await this.request<GoogleEventResponse>(
        "POST",
        `${this.eventsPath()}?sendUpdates=none`,
        event,
      );
      return this.result(inserted);
    } catch (error) {
      if (!(error instanceof GoogleCalendarApiError) || error.status !== 409)
        throw error;
      const existing = await this.get(event.id);
      if (!existing) throw error;
      return this.patchIfCurrent(event, existing);
    }
  }

  private async get(eventId: string): Promise<GoogleEventResponse | null> {
    try {
      return await this.request<GoogleEventResponse>(
        "GET",
        `${this.eventsPath()}/${encodeURIComponent(eventId)}`,
      );
    } catch (error) {
      if (error instanceof GoogleCalendarApiError && error.status === 404)
        return null;
      throw error;
    }
  }

  private async patchIfCurrent(
    event: GoogleEventProjection,
    existing: GoogleEventResponse,
  ): Promise<UpsertResult> {
    this.assertOwned(event, existing);
    if (
      Number(existing.extendedProperties?.private?.cappyHubGeneration ?? 0) >
      Number(event.extendedProperties.private.cappyHubGeneration)
    )
      return { status: "superseded" };

    // Google retains deleted Event IDs as cancelled resources. Reuse the same
    // owned resource and its ID when an archived Cappy Hub Event is restored.
    if (existing.status === "cancelled") {
      const restored = await this.request<GoogleEventResponse>(
        "PATCH",
        `${this.eventsPath()}/${encodeURIComponent(event.id)}`,
        updateBody(event),
        existing.etag,
      );
      return this.result(restored);
    }

    let current = existing;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const updated = await this.request<GoogleEventResponse>(
          "PATCH",
          `${this.eventsPath()}/${encodeURIComponent(event.id)}`,
          updateBody(event),
          current.etag,
        );
        return this.result(updated);
      } catch (error) {
        if (
          !(error instanceof GoogleCalendarApiError) ||
          error.status !== 412 ||
          attempt > 0
        )
          throw error;
        const latest = await this.get(event.id);
        if (!latest) return this.insert(event);
        this.assertOwned(event, latest);
        if (
          Number(latest.extendedProperties?.private?.cappyHubGeneration ?? 0) >
          Number(event.extendedProperties.private.cappyHubGeneration)
        )
          return { status: "superseded" };
        current = latest;
      }
    }
    throw new Error("Calendar update retry exhausted");
  }

  private assertOwned(
    event: GoogleEventProjection,
    existing: GoogleEventResponse,
  ) {
    this.assertRemoteIdentity(
      event.id,
      event.extendedProperties.private.cappyHubEventId,
      existing,
    );
  }

  private assertRemoteIdentity(
    eventId: string,
    cappyHubEventId: string,
    existing: GoogleEventResponse,
  ) {
    if (
      existing.id !== eventId ||
      existing.extendedProperties?.private?.cappyHubEventId !== cappyHubEventId
    )
      throw new GoogleCalendarApiError(409, "remote_event_identity_mismatch");
  }

  private result(event: GoogleEventResponse): UpsertResult {
    return {
      status: "synced",
      etag: event.etag ?? null,
      htmlLink: event.htmlLink ?? null,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: GoogleEventProjection | Omit<GoogleEventProjection, "id">,
    etag?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.options.getAccessToken()}`,
    };
    if (body) headers["content-type"] = "application/json";
    if (etag) headers["if-match"] = etag;

    let response: Response;
    try {
      response = await (this.options.fetcher ?? fetch)(
        `https://www.googleapis.com/calendar/v3${path}`,
        {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch (error) {
      throw error;
    }
    if (!response.ok) {
      let reason = "unknown";
      try {
        const payload = (await response.json()) as {
          error?: { errors?: { reason?: string }[] };
        };
        reason = payload.error?.errors?.[0]?.reason ?? "unknown";
      } catch {
        // Keep response bodies out of logs and stored diagnostics.
      }
      throw new GoogleCalendarApiError(response.status, reason);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

function updateBody(
  event: GoogleEventProjection,
): Omit<GoogleEventProjection, "id"> {
  return Object.fromEntries(
    Object.entries(event).filter(([key]) => key !== "id"),
  ) as Omit<GoogleEventProjection, "id">;
}
