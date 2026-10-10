import { expect, it } from "vitest";
import { personalSignupState } from "@/app/(protected)/events/personal-signup-state";

const openAndEligible = {
  open: true,
  confirmed: false,
  waitlisted: false,
  eligible: true,
  full: false,
};

it("allows an eligible Officer to sign up only once", () => {
  expect(personalSignupState(openAndEligible)).toBe("available");
  expect(personalSignupState({ ...openAndEligible, confirmed: true })).toBe(
    "confirmed",
  );
});

it("keeps a waitlisted Officer on the leave-waitlist state", () => {
  expect(personalSignupState({ ...openAndEligible, waitlisted: true })).toBe(
    "waitlisted",
  );
});

it("offers the waitlist for a full event and no action when closed", () => {
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
