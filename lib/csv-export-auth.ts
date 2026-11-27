import "server-only";
import { NextResponse } from "next/server";
import { getCurrentOfficer } from "./current-officer";
import { createClient } from "./supabase/server";
import type { AuthorizationContext } from "./authorization";

export type ExportAuthResult =
  | {
      ok: true;
      actor: AuthorizationContext;
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | { ok: false; response: NextResponse };

export function exportErrorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Rechecks authenticated active-Officer identity on the server for CSV export
 * Route Handlers. Returns 401 for signed-out callers and 403 for inactive or
 * unlinked accounts rather than redirecting.
 */
export async function requireExportActor(): Promise<ExportAuthResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return {
      ok: false,
      response: exportErrorResponse("Authentication required", 401),
    };
  }
  const actor = await getCurrentOfficer();
  if (!actor) {
    return {
      ok: false,
      response: exportErrorResponse("Access denied", 403),
    };
  }
  return { ok: true, actor, supabase };
}

export function searchParamsToRecord(
  searchParams: URLSearchParams,
): Record<string, string | string[] | undefined> {
  const record: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of searchParams.entries()) {
    const existing = record[key];
    if (existing === undefined) record[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else record[key] = [existing, value];
  }
  return record;
}
