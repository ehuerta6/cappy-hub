export type PersonalSignupState =
  "closed" | "confirmed" | "waitlisted" | "ineligible" | "available" | "full";

export function personalSignupState({
  open,
  confirmed,
  waitlisted,
  eligible,
  full,
}: {
  open: boolean;
  confirmed: boolean;
  waitlisted: boolean;
  eligible: boolean;
  full: boolean;
}): PersonalSignupState {
  if (!open) return "closed";
  if (confirmed) return "confirmed";
  if (waitlisted) return "waitlisted";
  if (!eligible) return "ineligible";
  return full ? "full" : "available";
}
