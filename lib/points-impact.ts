// Informational confirmation copy for edits that change existing automatic
// Points. The database remains the authority for the actual recalculation.

export type EventSchedule = {
  event_date: string;
  start_time: string;
  end_time: string;
};

export type TaskPointsImpact = {
  activeAwardCount: number;
  correctableAwardCount: number;
  today: string;
};

function officers(count: number) {
  return `${count} ${count === 1 ? "Officer" : "Officers"}`;
}

function points(value: number) {
  return `${value} ${value === 1 ? "Point" : "Points"}`;
}

export function eventPointsImpactMessage(
  original: EventSchedule,
  next: EventSchedule,
  affectedOfficerCount: number,
) {
  if (affectedOfficerCount < 1) return null;
  const scheduleChanged =
    next.event_date !== original.event_date ||
    next.start_time !== original.start_time ||
    next.end_time !== original.end_time;
  if (!scheduleChanged) return null;
  return `Saving recalculates automatic participation Points for ${officers(affectedOfficerCount)} on this Event.`;
}

export function taskPointsImpactMessage(
  original: { points: number; due_date: string },
  next: { points: string; due_date: string },
  impact: TaskPointsImpact,
) {
  const messages: string[] = [];
  const nextPoints = next.points.trim() === "" ? NaN : Number(next.points);
  if (
    impact.correctableAwardCount > 0 &&
    Number.isFinite(nextPoints) &&
    nextPoints >= 0 &&
    nextPoints !== original.points
  ) {
    messages.push(
      `Saving changes the automatic award for ${officers(impact.correctableAwardCount)} from ${points(original.points)} to ${points(nextPoints)}.`,
    );
  }
  // Task awards are due once the due date is before today in El Paso, so a
  // later due date of today or after suspends currently active awards.
  if (
    impact.activeAwardCount > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(next.due_date) &&
    next.due_date > original.due_date &&
    next.due_date >= impact.today
  ) {
    messages.push(
      `Saving suspends Task Points for ${officers(impact.activeAwardCount)} until the new due date passes.`,
    );
  }
  return messages.length ? messages.join(" ") : null;
}
