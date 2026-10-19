export type PersonalSignupState =
  "closed" | "confirmed" | "ineligible" | "available" | "full";

export function personalSignupState({
  open,
  confirmed,
  eligible,
  full,
}: {
  open: boolean;
  confirmed: boolean;
  eligible: boolean;
  full: boolean;
}): PersonalSignupState {
  if (!open) return "closed";
  if (confirmed) return "confirmed";
  if (!eligible) return "ineligible";
  return full ? "full" : "available";
}
