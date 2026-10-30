import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { buildTaskListQuery } from "@/lib/task-list-query";

const postgrestUrl = process.env.TASK_POSTGREST_API_URL;
const serviceRoleKey = process.env.TASK_POSTGREST_SERVICE_KEY;

if (Boolean(postgrestUrl) !== Boolean(serviceRoleKey))
  throw new Error(
    "Set both TASK_POSTGREST_API_URL and TASK_POSTGREST_SERVICE_KEY to enable the local PostgREST test.",
  );

if (postgrestUrl) {
  const parsedUrl = new URL(postgrestUrl);
  if (
    parsedUrl.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname)
  )
    throw new Error(
      "The Tasks PostgREST integration test only accepts a loopback HTTP API URL.",
    );
}

const isConfigured = Boolean(postgrestUrl && serviceRoleKey);
const describePostgrest = describe.skipIf(!isConfigured);

describePostgrest("Tasks status filtering against local PostgREST", () => {
  it("filters zero, complete, incomplete, and mixed assignments before pagination", async () => {
    const supabase = createClient<Database>(postgrestUrl!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const marker = `task-status-${crypto.randomUUID()}`;
    const taskIds: number[] = [];
    const officerIds: number[] = [];

    try {
      const [branch, otherBranch, officerPosition] = await Promise.all([
        supabase.from("branches").select("id").eq("name", "intro").single(),
        supabase.from("branches").select("id").eq("name", "social").single(),
        supabase.from("positions").select("id").eq("name", "Officer").single(),
      ]);
      expect(branch.error).toBeNull();
      expect(otherBranch.error).toBeNull();
      expect(officerPosition.error).toBeNull();

      const officersResult = await supabase
        .from("officers")
        .insert([
          {
            name: `${marker} Officer A`,
            personal_email: `${marker}-a@example.test`,
            position_id: officerPosition.data!.id,
            classification: "senior",
          },
          {
            name: `${marker} Officer B`,
            personal_email: `${marker}-b@example.test`,
            position_id: officerPosition.data!.id,
            classification: "senior",
          },
        ])
        .select("id");
      expect(officersResult.error).toBeNull();
      const [officerA, officerB] = officersResult.data!;
      officerIds.push(officerA.id, officerB.id);

      const records = [
        {
          key: "current-zero",
          branchId: branch.data!.id,
          dueDate: "2099-10-08",
        },
        {
          key: "current-one-incomplete",
          branchId: branch.data!.id,
          dueDate: "2099-10-08",
        },
        {
          key: "current-one-complete",
          branchId: branch.data!.id,
          dueDate: "2099-10-08",
        },
        {
          key: "current-many-complete",
          branchId: branch.data!.id,
          dueDate: "2099-10-08",
        },
        {
          key: "current-mixed",
          branchId: branch.data!.id,
          dueDate: "2099-10-08",
        },
        ...Array.from({ length: 9 }, (_, index) => ({
          key: `current-page-${index + 1}`,
          branchId: branch.data!.id,
          dueDate: "2099-10-08",
        })),
        {
          key: "past-complete",
          branchId: branch.data!.id,
          dueDate: "2025-10-08",
        },
        {
          key: "archived-complete",
          branchId: branch.data!.id,
          dueDate: "2099-10-08",
          removedAt: "2026-01-02T00:00:00Z",
        },
        {
          key: "archived-other-branch-complete",
          branchId: otherBranch.data!.id,
          dueDate: "2099-10-08",
          removedAt: "2026-01-02T00:00:00Z",
        },
        {
          key: "current-other-branch-complete",
          branchId: otherBranch.data!.id,
          dueDate: "2099-10-08",
        },
      ];

      const tasksResult = await supabase
        .from("tasks")
        .insert(
          records.map((record) => ({
            title: `${marker} ${record.key}`,
            description: `${marker} search fixture`,
            task_type: "Post",
            branch_id: record.branchId,
            due_date: record.dueDate,
            points: 3,
            created_by: officerA.id,
            removed_at: record.removedAt ?? null,
            removed_by: record.removedAt ? officerA.id : null,
          })),
        )
        .select("id,title");
      expect(tasksResult.error).toBeNull();
      const taskIdsByKey = new Map(
        tasksResult.data!.map((task) => {
          taskIds.push(task.id);
          return [task.title.slice(marker.length + 1), task.id] as const;
        }),
      );

      const completedAt = "2099-10-01T12:00:00Z";
      const assignments = [
        ["current-one-incomplete", officerA.id, null],
        ["current-one-complete", officerA.id, completedAt],
        ["current-many-complete", officerA.id, completedAt],
        ["current-many-complete", officerB.id, completedAt],
        ["current-mixed", officerA.id, completedAt],
        ["current-mixed", officerB.id, null],
        ...Array.from(
          { length: 9 },
          (_, index) =>
            [`current-page-${index + 1}`, officerA.id, completedAt] as const,
        ),
        ["past-complete", officerA.id, completedAt],
        ["archived-complete", officerA.id, completedAt],
        ["archived-other-branch-complete", officerA.id, completedAt],
        ["current-other-branch-complete", officerA.id, completedAt],
      ] as const;
      const assignmentsResult = await supabase
        .from("task_officer_assignments")
        .insert(
          assignments.map(([taskKey, officerId, assignmentCompletedAt]) => ({
            task_id: taskIdsByKey.get(taskKey)!,
            officer_id: officerId,
            assigned_by: officerA.id,
            completed_at: assignmentCompletedAt,
          })),
        );
      expect(assignmentsResult.error).toBeNull();

      const baseFilters = {
        today: "2026-01-01",
        search: marker,
        branchId: branch.data!.id,
        assigneeId: officerA.id,
        page: 1,
      };

      const openResult = await buildTaskListQuery(supabase, {
        ...baseFilters,
        view: "current",
        status: "open",
        assigneeId: undefined,
      });
      expect(openResult.error).toBeNull();
      expect(openResult.count).toBe(1);
      expect(
        (openResult.data as unknown as { title: string }[] | null)?.map(
          (task) => task.title,
        ),
      ).toEqual([`${marker} current-zero`]);

      const impossibleOpenResult = await buildTaskListQuery(supabase, {
        ...baseFilters,
        view: "current",
        status: "open",
      });
      expect(impossibleOpenResult.error).toBeNull();
      expect(impossibleOpenResult.count).toBe(0);
      expect(impossibleOpenResult.data).toEqual([]);

      const inProgressResult = await buildTaskListQuery(supabase, {
        ...baseFilters,
        view: "current",
        status: "in_progress",
      });
      expect(inProgressResult.error).toBeNull();
      expect(
        (inProgressResult.data as unknown as { title: string }[] | null)
          ?.map((task) => task.title)
          .sort(),
      ).toEqual(
        [`${marker} current-mixed`, `${marker} current-one-incomplete`].sort(),
      );

      const completePageOne = await buildTaskListQuery(supabase, {
        ...baseFilters,
        view: "current",
        status: "complete",
        page: 1,
      });
      const completePageTwo = await buildTaskListQuery(supabase, {
        ...baseFilters,
        view: "current",
        status: "complete",
        page: 2,
      });
      expect(completePageOne.error).toBeNull();
      expect(completePageTwo.error).toBeNull();
      expect(completePageOne.count).toBe(11);
      expect(completePageOne.data).toHaveLength(8);
      expect(completePageTwo.data).toHaveLength(3);
      const completePageIds = [
        ...((completePageOne.data ?? []) as unknown as { id: number }[]).map(
          (task) => task.id,
        ),
        ...((completePageTwo.data ?? []) as unknown as { id: number }[]).map(
          (task) => task.id,
        ),
      ];
      expect(new Set(completePageIds).size).toBe(11);
      expect(completePageIds).toEqual(
        [
          "current-one-complete",
          "current-many-complete",
          ...Array.from(
            { length: 9 },
            (_, index) => `current-page-${index + 1}`,
          ),
        ]
          .map((key) => taskIdsByKey.get(key)!)
          .sort((left, right) => left - right),
      );

      const pastResult = await buildTaskListQuery(supabase, {
        ...baseFilters,
        view: "past",
        status: "complete",
      });
      expect(pastResult.error).toBeNull();
      expect(pastResult.count).toBe(1);
      expect(
        (pastResult.data as unknown as { title: string }[] | null)?.map(
          (task) => task.title,
        ),
      ).toEqual([`${marker} past-complete`]);

      const deletedResult = await buildTaskListQuery(supabase, {
        ...baseFilters,
        view: "deleted",
        status: "complete",
        branchId: undefined,
        branchScope: [branch.data!.id],
      });
      expect(deletedResult.error).toBeNull();
      expect(deletedResult.count).toBe(1);
      expect(
        (deletedResult.data as unknown as { title: string }[] | null)?.map(
          (task) => task.title,
        ),
      ).toEqual([`${marker} archived-complete`]);
    } finally {
      if (taskIds.length) {
        await supabase
          .from("task_officer_assignments")
          .delete()
          .in("task_id", taskIds);
        await supabase.from("tasks").delete().in("id", taskIds);
      }
      if (officerIds.length)
        await supabase.from("officers").delete().in("id", officerIds);
    }
  }, 30_000);
});
