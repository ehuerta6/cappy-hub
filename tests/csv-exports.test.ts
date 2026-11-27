import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/current-officer", () => ({
  getCurrentOfficer: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/academic-periods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/academic-periods")>()),
  getAcademicPeriodData: vi.fn(),
}));

import { getCurrentOfficer } from "@/lib/current-officer";
import { createClient } from "@/lib/supabase/server";
import { getAcademicPeriodData } from "@/lib/academic-periods";
import { GET as exportOfficers } from "@/app/api/exports/officers/route";
import { GET as exportOfficerActivity } from "@/app/api/exports/officers/activity/route";
import { GET as exportLeaderboard } from "@/app/api/exports/points/leaderboard/route";
import { GET as exportPointHistory } from "@/app/api/exports/points/history/route";
import { GET as exportEventRoster } from "@/app/api/exports/events/[id]/roster/route";
import { GET as exportEvents } from "@/app/api/exports/events/route";
import { GET as exportTasks } from "@/app/api/exports/tasks/route";

const adminActor = {
  id: 1,
  name: "Admin User",
  authUserId: "auth-admin",
  applicationRole: "admin" as const,
  positionId: 1,
  positionName: "Officer",
  positionCode: "officer",
  branchIds: [1],
};

const officerActor = {
  id: 2,
  name: "Regular Officer",
  authUserId: "auth-officer",
  applicationRole: "officer" as const,
  positionId: 1,
  positionName: "Officer",
  positionCode: "officer",
  branchIds: [1],
};

const leadBranch2Actor = {
  id: 3,
  name: "Branch 2 Lead",
  authUserId: "auth-lead",
  applicationRole: "officer" as const,
  positionId: 2,
  positionName: "Lead",
  positionCode: "lead",
  branchIds: [2],
};

let authUser: { id: string } | null = { id: "auth-admin" };
let tableHandlers: Record<
  string,
  (ctx: {
    filters: Array<[string, string, unknown]>;
    range?: [number, number];
  }) => { data: unknown; error: { message: string } | null }
> = {};
let rpcHandler: (
  name: string,
  args?: Record<string, unknown>,
) => { data: unknown; error: { message: string } | null } = () => ({
  data: null,
  error: null,
});

function makeSupabaseMock() {
  return {
    auth: {
      getUser: async () => ({ data: { user: authUser }, error: null }),
    },
    rpc: (name: string, args?: Record<string, unknown>) => ({
      single: async () => rpcHandler(name, args),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(rpcHandler(name, args)).then(resolve),
    }),
    from: (table: string) => {
      const filters: Array<[string, string, unknown]> = [];
      let rangeVal: [number, number] | undefined;
      const run = () => {
        const handler = tableHandlers[table];
        return handler
          ? handler({ filters, range: rangeVal })
          : { data: [], error: null };
      };
      const query = {
        select: () => query,
        eq: (col: string, val: unknown) => {
          filters.push(["eq", col, val]);
          return query;
        },
        neq: (col: string, val: unknown) => {
          filters.push(["neq", col, val]);
          return query;
        },
        gt: (col: string, val: unknown) => {
          filters.push(["gt", col, val]);
          return query;
        },
        gte: (col: string, val: unknown) => {
          filters.push(["gte", col, val]);
          return query;
        },
        lt: (col: string, val: unknown) => {
          filters.push(["lt", col, val]);
          return query;
        },
        lte: (col: string, val: unknown) => {
          filters.push(["lte", col, val]);
          return query;
        },
        is: (col: string, val: unknown) => {
          filters.push(["is", col, val]);
          return query;
        },
        not: (col: string, op: string, val: unknown) => {
          filters.push([`not:${op}`, col, val]);
          return query;
        },
        in: (col: string, val: unknown) => {
          filters.push(["in", col, val]);
          return query;
        },
        or: (expr: string) => {
          filters.push(["or", expr, null]);
          return query;
        },
        filter: (col: string, op: string, val: unknown) => {
          filters.push([`filter:${op}`, col, val]);
          return query;
        },
        order: () => query,
        range: (from: number, to: number) => {
          rangeVal = [from, to];
          return query;
        },
        maybeSingle: async () => run(),
        single: async () => run(),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(run()).then(resolve),
      };
      return query;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { id: "auth-admin" };
  tableHandlers = {};
  rpcHandler = () => ({ data: null, error: null });
  vi.mocked(getCurrentOfficer).mockResolvedValue(adminActor as never);
  vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
  vi.mocked(getAcademicPeriodData).mockResolvedValue({
    periods: [
      {
        id: 10,
        name: "Fall 2026",
        starts_on: "2026-08-16",
        ends_on: "2026-12-20",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ],
    currentDate: "2026-11-27",
    currentPeriodId: 10,
  });
});

describe("Officers CSV export (#478)", () => {
  it("denies signed-out users (401), inactive Officers (403), and non-Admins (403)", async () => {
    authUser = null;
    const unauth = await exportOfficers(
      new NextRequest("https://cappy.test/api/exports/officers"),
    );
    expect(unauth.status).toBe(401);

    authUser = { id: "auth-inactive" };
    vi.mocked(getCurrentOfficer).mockResolvedValue(null);
    const inactive = await exportOfficers(
      new NextRequest("https://cappy.test/api/exports/officers"),
    );
    expect(inactive.status).toBe(403);

    authUser = { id: "auth-officer" };
    vi.mocked(getCurrentOfficer).mockResolvedValue(officerActor as never);
    const nonAdmin = await exportOfficers(
      new NextRequest("https://cappy.test/api/exports/officers"),
    );
    expect(nonAdmin.status).toBe(403);
  });

  it("exports the four documented columns in order, excludes personal email, and neutralizes formulas", async () => {
    let seenStatusFilter: unknown;
    tableHandlers.officers = ({ filters }) => {
      seenStatusFilter = filters.find(([, col]) => col === "status")?.[2];
      return {
        data: [
          {
            id: 10,
            name: "José Peña",
            utep_email: "jpena@miners.utep.edu",
            personal_email: "secret-personal@example.com",
            classification: "junior",
            positions: { name: "Lead" },
          },
          {
            id: 11,
            name: '=HYPERLINK("https://evil.example")',
            utep_email: null,
            personal_email: "hidden@example.com",
            classification: null,
            positions: { name: "Officer" },
          },
        ],
        error: null,
      };
    };

    const res = await exportOfficers(
      new NextRequest("https://cappy.test/api/exports/officers"),
    );
    expect(res.status).toBe(200);
    expect(seenStatusFilter).toBe("active");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="cappy-hub-officers-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.headers.get("X-Export-Row-Count")).toBe("2");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const body = new TextDecoder("utf-8").decode(bytes);
    expect(body).not.toContain("secret-personal@example.com");
    expect(body).not.toContain("hidden@example.com");
    const lines = body.trimEnd().split("\r\n");
    expect(lines[0]).toBe("Name,Email,Classification,Position");
    expect(lines[1]).toBe("José Peña,jpena@miners.utep.edu,Junior,Lead");
    expect(lines[2]).toBe('"\'=HYPERLINK(""https://evil.example"")",,,Officer');
  });

  it("returns 500 JSON instead of a partial file when a query fails", async () => {
    tableHandlers.officers = () => ({
      data: null,
      error: { message: "Connection dropped" },
    });
    const res = await exportOfficers(
      new NextRequest("https://cappy.test/api/exports/officers"),
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});

describe("Points leaderboard & Point History CSV exports", () => {
  it("exports active officers with Position and Branches in leaderboard order for the selected period", async () => {
    vi.mocked(getCurrentOfficer).mockResolvedValue(officerActor as never);
    tableHandlers.officers = () => ({
      data: [
        {
          id: 1,
          position_id: 1,
          positions: { name: "Officer" },
          officer_branches: [],
        },
        {
          id: 2,
          position_id: 2,
          positions: { name: "Lead" },
          officer_branches: [
            { branch_id: 20, branches: { name: "intro" } },
            { branch_id: 10, branches: { name: "icpc" } },
          ],
        },
      ],
      error: null,
    });
    rpcHandler = (name) => {
      expect(name).toBe("academic_period_point_summary");
      return {
        data: {
          ranking: [
            {
              officer_id: 2,
              officer_name: "Ana García",
              points: 12.5,
              normal_points: 13.5,
              negative_points: -1,
            },
            {
              officer_id: 99,
              officer_name: "Inactive Person",
              points: 99,
              normal_points: 99,
              negative_points: 0,
            },
          ],
        },
        error: null,
      };
    };

    const res = await exportLeaderboard(
      new NextRequest("https://cappy.test/api/exports/points/leaderboard"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Export-Row-Count")).toBe("1");
    const body = await res.text();
    expect(body).toContain(
      "Rank,Officer,Position,Branches,Total Points,Positive Points,Negative Points,Academic Period",
    );
    expect(body).toContain(
      '1,Ana García,Lead,"ICPC, Intro",12.5,13.5,-1,Fall 2026',
    );
    expect(body).not.toContain("Inactive Person");
  });

  it("filters leaderboard CSV by branch id, branch=none, and position id", async () => {
    vi.mocked(getCurrentOfficer).mockResolvedValue(officerActor as never);
    let lastPositionFilter: unknown;
    tableHandlers.officers = ({ filters }) => {
      lastPositionFilter = filters.find(
        ([, col]) => col === "position_id",
      )?.[2];
      const all = [
        {
          id: 1,
          position_id: 2,
          positions: { name: "Lead" },
          officer_branches: [{ branch_id: 10, branches: { name: "intro" } }],
        },
        {
          id: 2,
          position_id: 1,
          positions: { name: "Officer" },
          officer_branches: [],
        },
      ];
      return {
        data:
          lastPositionFilter !== undefined
            ? all.filter((o) => o.position_id === lastPositionFilter)
            : all,
        error: null,
      };
    };
    rpcHandler = () => ({
      data: {
        ranking: [
          {
            officer_id: 1,
            officer_name: "Lead One",
            points: 15,
            normal_points: 15,
            negative_points: 0,
          },
          {
            officer_id: 2,
            officer_name: "Unassigned Officer",
            points: 6,
            normal_points: 6,
            negative_points: 0,
          },
        ],
      },
      error: null,
    });

    const byBranch = await exportLeaderboard(
      new NextRequest(
        "https://cappy.test/api/exports/points/leaderboard?branch=10",
      ),
    );
    expect(byBranch.status).toBe(200);
    const byBranchCsv = await byBranch.text();
    expect(byBranchCsv).toContain("Lead One");
    expect(byBranchCsv).not.toContain("Unassigned Officer");

    const noBranch = await exportLeaderboard(
      new NextRequest(
        "https://cappy.test/api/exports/points/leaderboard?branch=none",
      ),
    );
    expect(noBranch.status).toBe(200);
    const noBranchCsv = await noBranch.text();
    expect(noBranchCsv).toContain("Unassigned Officer");
    expect(noBranchCsv).not.toContain("Lead One");

    const byPosition = await exportLeaderboard(
      new NextRequest(
        "https://cappy.test/api/exports/points/leaderboard?position=2",
      ),
    );
    expect(byPosition.status).toBe(200);
    expect(lastPositionFilter).toBe(2);
    const byPositionCsv = await byPosition.text();
    expect(byPositionCsv).toContain("Lead One");
    expect(byPositionCsv).not.toContain("Unassigned Officer");
  });

  it("forces active-only status for non-Admins exporting Point History", async () => {
    vi.mocked(getCurrentOfficer).mockResolvedValue(officerActor as never);
    let sawRemovedIsNull = false;
    tableHandlers.point_history = ({ filters }) => {
      sawRemovedIsNull = filters.some(
        ([op, col, val]) => op === "is" && col === "removed_at" && val === null,
      );
      return {
        data: [
          {
            activity_date: "2026-10-15",
            officer_name: "Regular Officer",
            award_type: "negative",
            points: -1,
            reason: "=Missed shift",
            event_name: "Workshop, Fall",
            task_title: null,
            removed_at: null,
            participation_schedule_suspended: false,
            created_at: "2026-10-15T18:00:00Z",
          },
        ],
        error: null,
      };
    };

    const res = await exportPointHistory(
      new NextRequest(
        "https://cappy.test/api/exports/points/history?status=removed",
      ),
    );
    expect(res.status).toBe(200);
    expect(sawRemovedIsNull).toBe(true);
    const body = await res.text();
    expect(body).toContain(",-1,");
    expect(body).toContain("'=Missed shift");
    expect(body).toContain('"Workshop, Fall"');
  });
});

describe("Event roster, Events list, and Tasks CSV exports", () => {
  it("restricts Event roster CSV to authorized Event managers and exports slots & UTEP email", async () => {
    tableHandlers.events = () => ({
      data: {
        id: 42,
        name: "Career Fair",
        event_date: "2026-11-10",
        deleted_at: null,
        event_branches: [{ branch_id: 1 }],
      },
      error: null,
    });

    vi.mocked(getCurrentOfficer).mockResolvedValue(officerActor as never);
    const deniedOfficer = await exportEventRoster(
      new NextRequest("https://cappy.test/api/exports/events/42/roster"),
      { params: Promise.resolve({ id: "42" }) },
    );
    expect(deniedOfficer.status).toBe(403);

    vi.mocked(getCurrentOfficer).mockResolvedValue(leadBranch2Actor as never);
    const deniedOtherBranchLead = await exportEventRoster(
      new NextRequest("https://cappy.test/api/exports/events/42/roster"),
      { params: Promise.resolve({ id: "42" }) },
    );
    expect(deniedOtherBranchLead.status).toBe(403);

    vi.mocked(getCurrentOfficer).mockResolvedValue(adminActor as never);
    tableHandlers.event_officers = () => ({
      data: [
        {
          officer_id: 10,
          participation_type: "volunteer",
          officers: {
            id: 10,
            name: "Sofía Ruiz",
            utep_email: "sruiz@miners.utep.edu",
          },
        },
      ],
      error: null,
    });
    tableHandlers.event_time_slots = () => ({
      data: [
        {
          id: 500,
          starts_at: "2026-11-10T17:00:00Z",
          ends_at: "2026-11-10T18:00:00Z",
          event_time_slot_officers: [
            { officer_id: 10, event_officers: { removed_at: null } },
          ],
        },
      ],
      error: null,
    });

    const allowed = await exportEventRoster(
      new NextRequest("https://cappy.test/api/exports/events/42/roster"),
      { params: Promise.resolve({ id: "42" }) },
    );
    expect(allowed.status).toBe(200);
    const body = await allowed.text();
    expect(body).toContain(
      "Officer,UTEP Email,Participation Type,Assigned Volunteer Time Slots",
    );
    expect(body).toContain("Sofía Ruiz,sruiz@miners.utep.edu,Volunteer,Slot 1");
  });

  it("exports filtered Events and Tasks lists with stable headers", async () => {
    vi.mocked(getCurrentOfficer).mockResolvedValue(officerActor as never);
    tableHandlers.events = () => ({
      data: [
        {
          id: 7,
          name: "Intro Workshop",
          event_date: "2026-11-30",
          starts_at: "2026-11-30T17:00:00Z",
          ends_at: "2026-11-30T19:00:00Z",
          location: "CCSB G.0208",
          status: "upcoming",
          deleted_at: null,
          delete_points_suspended: false,
          max_volunteers: 10,
          event_types: { name: "Workshop" },
          event_branches: [{ branches: { name: "intro" } }],
          event_officers: [{ officer_id: 2, removed_at: null }],
        },
      ],
      error: null,
    });
    tableHandlers.tasks = () => ({
      data: [
        {
          id: 9,
          title: "Design Flyer",
          due_date: "2026-12-01",
          due_time: "15:00:00",
          task_type: "flyer",
          points: 5,
          removed_at: null,
          no_longer_needed_at: null,
          branches: { name: "intro" },
          task_officer_assignments: [
            {
              officer_id: 2,
              completed_at: null,
              completion_approval_pending: false,
              removed_at: null,
            },
          ],
        },
      ],
      error: null,
    });

    const eventsRes = await exportEvents(
      new NextRequest("https://cappy.test/api/exports/events"),
    );
    expect(eventsRes.status).toBe(200);
    const eventsCsv = await eventsRes.text();
    expect(eventsCsv).toContain(
      "Event,Date,Schedule (El Paso),Location,Type,Branches,Confirmed Signups,Max Volunteers,Status",
    );
    expect(eventsCsv).toContain("Intro Workshop,2026-11-30");

    const tasksRes = await exportTasks(
      new NextRequest("https://cappy.test/api/exports/tasks"),
    );
    expect(tasksRes.status).toBe(200);
    const tasksCsv = await tasksRes.text();
    expect(tasksCsv).toContain(
      "Task,Due Date,Due Time,Type,Branch,Points,Assigned,Completed,Pending Approval,Status,No Longer Needed",
    );
    expect(tasksCsv).toContain(
      "Design Flyer,2026-12-01,3:00 PM,Flyer,Intro,5,1,0,0,In progress,No",
    );
  });
});

describe("Officer Activity CSV export", () => {
  it("allows any active Officer, combines volunteer and attendee counts, and excludes personal email", async () => {
    vi.mocked(getCurrentOfficer).mockResolvedValue(officerActor as never);
    tableHandlers.officers = () => ({
      data: [
        {
          id: 10,
          name: "Avery Chen",
          positions: { name: "Officer" },
          officer_branches: [{ branch_id: 1, branches: { name: "intro" } }],
        },
        {
          id: 11,
          name: "Casey Nguyen",
          positions: { name: "Officer" },
          officer_branches: [],
        },
      ],
      error: null,
    });
    tableHandlers.task_officer_assignments = () => ({
      data: [
        {
          officer_id: 10,
          completed_at: "2026-10-01T12:00:00Z",
          completion_approval_pending: false,
          removed_at: null,
          tasks: {
            due_date: "2026-10-01",
            removed_at: null,
            no_longer_needed_at: null,
          },
        },
      ],
      error: null,
    });
    tableHandlers.event_officers = () => ({
      data: [
        {
          officer_id: 10,
          event_id: 1,
          participation_type: "volunteer",
          removed_at: null,
          events: {
            id: 1,
            event_date: "2026-10-10",
            deleted_at: null,
            status: "past",
          },
        },
        {
          officer_id: 10,
          event_id: 2,
          participation_type: "attendee",
          removed_at: null,
          events: {
            id: 2,
            event_date: "2026-10-12",
            deleted_at: null,
            status: "past",
          },
        },
      ],
      error: null,
    });

    const res = await exportOfficerActivity(
      new NextRequest("https://cappy.test/api/exports/officers/activity"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Export-Row-Count")).toBe("2");
    const csv = await res.text();
    expect(csv).toContain(
      "Officer,Position,Branches,Task Completion %,Completed Due Tasks,Due Tasks,Pending Approval Tasks,Upcoming Tasks,Volunteer Events,Attend Events,Recorded Events,Academic Period",
    );
    expect(csv).toContain(
      "Avery Chen,Officer,Intro,100%,1,1,0,0,1,1,2,Fall 2026",
    );
    expect(csv).toContain(
      "Casey Nguyen,Officer,,No Tasks due,0,0,0,0,0,0,0,Fall 2026",
    );
  });
});
