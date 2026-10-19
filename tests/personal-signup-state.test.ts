import { expect, it } from "vitest";
import { personalSignupState } from "@/app/(protected)/events/personal-signup-state";

const openAndEligible = {
  open: true,
  confirmed: false,
  eligible: true,
  full: false,
};

it("allows an eligible Officer to sign up only once", () => {
  expect(personalSignupState(openAndEligible)).toBe("available");
  expect(personalSignupState({ ...openAndEligible, confirmed: true })).toBe(
    "confirmed",
  );
});

it("marks a full event unavailable and hides actions when closed", () => {
  expect(personalSignupState({ ...openAndEligible, full: true })).toBe("full");
  expect(personalSignupState({ ...openAndEligible, open: false })).toBe(
    "closed",
  );
});

it("does not offer self signup when the current Officer is ineligible", () => {
  expect(personalSignupState({ ...openAndEligible, eligible: false })).toBe(
    "ineligible",
  );
});
