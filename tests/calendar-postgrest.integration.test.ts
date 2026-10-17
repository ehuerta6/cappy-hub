import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { fetchCalendarRecords } from "@/app/(protected)/calendar/calendar-query";

const postgrestUrl = process.env.CALENDAR_POSTGREST_API_URL;
const serviceRoleKey = process.env.CALENDAR_POSTGREST_SERVICE_KEY;
const isolatedInstance = process.env.CALENDAR_POSTGREST_ISOLATED;

if (Boolean(postgrestUrl) !== Boolean(serviceRoleKey))
  throw new Error(
    "Set both CALENDAR_POSTGREST_API_URL and CALENDAR_POSTGREST_SERVICE_KEY to enable the isolated Calendar PostgREST test.",
  );

if (postgrestUrl) {
  const parsedUrl = new URL(postgrestUrl);
  if (
    parsedUrl.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname)
  )
    throw new Error(
      "The Calendar PostgREST integration test only accepts a loopback HTTP API URL.",
    );
  if (parsedUrl.port === "54321")
    throw new Error(
      "The Calendar PostgREST integration test refuses the default shared local Supabase API port 54321; provision a separate disposable instance on its own port.",
    );
  if (isolatedInstance !== "1")
    throw new Error(
      "Set CALENDAR_POSTGREST_ISOLATED=1 only for a separately provisioned disposable Supabase instance; never point this test at shared local, Preview, or Production data.",
    );
}

const isConfigured = Boolean(
  postgrestUrl && serviceRoleKey && isolatedInstance,
);
const describePostgrest = describe.skipIf(!isConfigured);

describePostgrest(
  "Calendar pagination against isolated local PostgREST",
  () => {
    it("loads every eligible row beyond the 1,000-row response cap", async () => {
      const supabase = createClient<Database>(postgrestUrl!, serviceRoleKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const marker = `calendar-pagination-${crypto.randomUUID()}`;

      try {
        const [branch, position, eventType] = await Promise.all([
          supabase.from("branches").select("id").eq("name", "intro").single(),
          supabase
            .from("positions")
            .select("id")
            .eq("name", "Officer")
            .single(),
          supabase
            .from("event_types")
            .select("id")
            .eq("name", "Meeting")
            .single(),
        ]);
        expect(branch.error).toBeNull();
        expect(position.error).toBeNull();
        expect(eventType.error).toBeNull();

        const officer = await supabase
          .from("officers")
          .insert({
            name: `${marker} Officer`,
            personal_email: `${marker}@example.test`,
            position_id: position.data!.id,
            classification: "senior",
          })
          .select("id")
          .single();
        expect(officer.error).toBeNull();

        const recordCount = 1_001;
        const eventRows = Array.from({ length: recordCount }, (_, index) => ({
          name: `${marker} event ${index.toString().padStart(4, "0")}`,
          event_type_id: eventType.data!.id,
          event_date: "2099-10-08",
          starts_at: "2099-10-08T17:00:00-06:00",
          ends_at: "2099-10-08T17:30:00-06:00",
          location: "Synthetic pagination fixture",
        }));
        const taskRows = Array.from({ length: recordCount }, (_, index) => ({
          title: `${marker} task ${index.toString().padStart(4, "0")}`,
          description: "Synthetic Calendar pagination fixture",
          task_type: "Post",
          branch_id: branch.data!.id,
          due_date: "2099-10-08",
          points: 1,
          created_by: officer.data!.id,
        }));

        for (let offset = 0; offset < recordCount; offset += 500) {
          const [eventsInsert, tasksInsert] = await Promise.all([
            supabase
              .from("events")
              .insert(eventRows.slice(offset, offset + 500))
              .select("id"),
            supabase
              .from("tasks")
              .insert(taskRows.slice(offset, offset + 500))
              .select("id"),
          ]);
          expect(eventsInsert.error).toBeNull();
          expect(tasksInsert.error).toBeNull();
        }

        const [cappedEvents, cappedTasks] = await Promise.all([
          supabase
            .from("events")
            .select("id")
            .like("name", `${marker} event%`)
            .is("deleted_at", null)
            .neq("status", "cancelled"),
          supabase
            .from("tasks")
            .select("id")
            .like("title", `${marker} task%`)
            .is("removed_at", null),
        ]);
        expect(cappedEvents.error).toBeNull();
        expect(cappedTasks.error).toBeNull();
        expect(cappedEvents.data).toHaveLength(1_000);
        expect(cappedTasks.data).toHaveLength(1_000);

        const [events, tasks] = await fetchCalendarRecords(supabase);
        const matchingEvents = events.filter(({ name }) =>
          name.startsWith(`${marker} event`),
        );
        const matchingTasks = tasks.filter(({ title }) =>
          title.startsWith(`${marker} task`),
        );
        expect(matchingEvents).toHaveLength(recordCount);
        expect(matchingTasks).toHaveLength(recordCount);
        expect(new Set(matchingEvents.map(({ id }) => id)).size).toBe(
          recordCount,
        );
        expect(new Set(matchingTasks.map(({ id }) => id)).size).toBe(
          recordCount,
        );
        expect(matchingEvents.map(({ name }) => name)).toEqual(
          eventRows.map(({ name }) => name),
        );
        expect(matchingTasks.map(({ title }) => title)).toEqual(
          taskRows.map(({ title }) => title),
        );
      } finally {
        const [eventsCleanup, tasksCleanup] = await Promise.all([
          supabase.from("events").delete().like("name", `${marker} event%`),
          supabase.from("tasks").delete().like("title", `${marker} task%`),
        ]);
        const officerCleanup = await supabase
          .from("officers")
          .delete()
          .eq("personal_email", `${marker}@example.test`);
        expect(eventsCleanup.error).toBeNull();
        expect(tasksCleanup.error).toBeNull();
        expect(officerCleanup.error).toBeNull();
      }
    }, 60_000);
  },
);
