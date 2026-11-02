import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type AcademicPeriod = Tables<"academic_periods">;
export type AcademicPeriodData = {
  periods: AcademicPeriod[];
  currentDate: string;
  currentPeriodId: number | null;
};
export type AcademicPeriodSelection = {
  period: AcademicPeriod | null;
  isHistorical: boolean;
  explicitNoPeriod: boolean;
};

export async function getAcademicPeriodData(): Promise<AcademicPeriodData> {
  const supabase = await createClient();
  const [periodsResult, contextResult] = await Promise.all([
    supabase
      .from("academic_periods")
      .select("id,name,starts_on,ends_on,created_at,updated_at")
      .order("starts_on", { ascending: false })
      .order("id", { ascending: false }),
    supabase.rpc("academic_period_context"),
  ]);
  if (periodsResult.error || contextResult.error)
    throw new Error("Failed to load academic periods");
  const context = contextResult.data[0];
  if (!context) throw new Error("Academic period context is unavailable");
  return {
    periods: periodsResult.data,
    currentDate: context.current_date_denver,
    currentPeriodId: context.current_period_id,
  };
}

export function resolveAcademicPeriod(
  selected: string | string[] | undefined,
  data: AcademicPeriodData,
): AcademicPeriodSelection {
  const value = Array.isArray(selected) ? selected[0] : selected;
  if (value === "none")
    return { period: null, isHistorical: false, explicitNoPeriod: true };
  const id = value === undefined ? data.currentPeriodId : Number(value);
  const period = Number.isSafeInteger(id)
    ? (data.periods.find((item) => item.id === id) ?? null)
    : null;
  const resolved =
    period ??
    (value === undefined
      ? null
      : (data.periods.find((item) => item.id === data.currentPeriodId) ??
        null));
  return {
    period: resolved,
    isHistorical: resolved !== null && resolved.ends_on < data.currentDate,
    explicitNoPeriod: false,
  };
}

export function periodDateRange(
  period: AcademicPeriod | null,
): { from: string; through: string } | null {
  return period ? { from: period.starts_on, through: period.ends_on } : null;
}
