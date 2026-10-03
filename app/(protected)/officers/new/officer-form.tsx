"use client";

import { useActionState, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { formatLabel } from "@/lib/presentation";
import {
  initialFormActionState,
  submittedValue,
  submittedValues,
} from "@/lib/form-feedback";
import { ActionFeedback, FieldError } from "@/components/ui";
import { saveOfficer } from "../actions";

type OfficerFormProps = {
  returnTo?: string;
  branches: Pick<Tables<"branches">, "id" | "name">[];
  positions: Pick<Tables<"positions">, "id" | "name">[];
  officer?: Tables<"officers">;
  branchIds?: number[];
};

export default function OfficerForm({
  returnTo,
  branches,
  positions,
  officer,
  branchIds = [],
}: OfficerFormProps) {
  const [state, action, pending] = useActionState(
    saveOfficer,
    initialFormActionState,
  );
  const [selectedBranches, setSelectedBranches] = useState(() =>
    submittedValues(state.values, "branches", branchIds.map(String)),
  );
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form action={action} className="sm:grid-cols-2">
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {officer && <input type="hidden" name="id" value={officer.id} />}
      <label className="sm:col-span-2">
        Name
        <input
          name="name"
          required
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "officer-name-error" : undefined}
          defaultValue={submittedValue(
            state.values,
            "name",
            officer?.name ?? "",
          )}
        />
        <FieldError id="officer-name-error">{fieldErrors.name}</FieldError>
      </label>
      <p className="sm:col-span-2">Provide at least one email address.</p>
      <label>
        UTEP email (optional)
        <input
          name="utep_email"
          type="email"
          aria-invalid={Boolean(fieldErrors.utep_email)}
          aria-describedby={
            fieldErrors.utep_email ? "officer-utep-email-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "utep_email",
            officer?.utep_email ?? "",
          )}
        />
        <FieldError id="officer-utep-email-error">
          {fieldErrors.utep_email}
        </FieldError>
      </label>
      <label>
        Personal email (optional)
        <input
          name="personal_email"
          type="email"
          aria-invalid={Boolean(fieldErrors.personal_email)}
          aria-describedby={
            fieldErrors.personal_email
              ? "officer-personal-email-error"
              : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "personal_email",
            officer?.personal_email ?? "",
          )}
        />
        <FieldError id="officer-personal-email-error">
          {fieldErrors.personal_email}
        </FieldError>
      </label>
      <label>
        Position
        <select
          name="position_id"
          required
          aria-invalid={Boolean(fieldErrors.position_id)}
          aria-describedby={
            fieldErrors.position_id ? "officer-position-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "position_id",
            String(officer?.position_id ?? ""),
          )}
        >
          <option value="">Select position</option>
          {positions.map((position) => (
            <option key={position.id} value={position.id}>
              {position.name}
            </option>
          ))}
        </select>
        <FieldError id="officer-position-error">
          {fieldErrors.position_id}
        </FieldError>
      </label>
      <label>
        Classification (optional)
        <select
          name="classification"
          aria-invalid={Boolean(fieldErrors.classification)}
          aria-describedby={
            fieldErrors.classification
              ? "officer-classification-error"
              : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "classification",
            officer?.classification ?? "",
          )}
        >
          <option value="">Not specified</option>
          {["freshman", "sophomore", "junior", "senior", "graduate"].map(
            (value) => (
              <option key={value} value={value}>
                {formatLabel(value)}
              </option>
            ),
          )}
        </select>
        <FieldError id="officer-classification-error">
          {fieldErrors.classification}
        </FieldError>
      </label>
      {officer && (
        <label>
          Status
          <select
            name="status"
            aria-invalid={Boolean(fieldErrors.status)}
            aria-describedby={
              fieldErrors.status ? "officer-status-error" : undefined
            }
            defaultValue={submittedValue(
              state.values,
              "status",
              officer.status,
            )}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <FieldError id="officer-status-error">
            {fieldErrors.status}
          </FieldError>
        </label>
      )}
      <fieldset
        className="sm:col-span-2"
        aria-invalid={Boolean(fieldErrors.branches)}
        aria-describedby={
          fieldErrors.branches ? "officer-branches-error" : undefined
        }
      >
        <legend>Branches (optional)</legend>
        {branches.map((branch) => (
          <label key={branch.id}>
            <input
              type="checkbox"
              name="branches"
              value={branch.id}
              checked={selectedBranches.includes(String(branch.id))}
              onChange={() =>
                setSelectedBranches((current) =>
                  current.includes(String(branch.id))
                    ? current.filter((id) => id !== String(branch.id))
                    : [...current, String(branch.id)],
                )
              }
            />{" "}
            {branch.name}
          </label>
        ))}
        <FieldError id="officer-branches-error">
          {fieldErrors.branches}
        </FieldError>
      </fieldset>
      <ActionFeedback state={state} />
      <button disabled={pending}>
        {pending ? (officer ? "Saving…" : "Creating…") : "Save officer"}
      </button>
    </form>
  );
}
