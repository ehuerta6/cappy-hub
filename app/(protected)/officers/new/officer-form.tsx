"use client";

import { useActionState } from "react";
import type { Tables } from "@/lib/database.types";
import { formatLabel } from "@/lib/presentation";
import { saveOfficer } from "../actions";

type OfficerFormProps = {
  branches: Pick<Tables<"branches">, "id" | "name">[];
  positions: Pick<Tables<"positions">, "id" | "name">[];
  officer?: Tables<"officers">;
  branchIds?: number[];
};

export default function OfficerForm({
  branches,
  positions,
  officer,
  branchIds = [],
}: OfficerFormProps) {
  const [state, action, pending] = useActionState(saveOfficer, { error: "" });
  return (
    <form action={action} className="sm:grid-cols-2">
      {officer && <input type="hidden" name="id" value={officer.id} />}
      <label className="sm:col-span-2">
        Name <input name="name" required defaultValue={officer?.name} />
      </label>
      <p className="sm:col-span-2">Provide at least one email address.</p>
      <label>
        UTEP email (optional)
        <input
          name="utep_email"
          type="email"
          defaultValue={officer?.utep_email ?? ""}
        />
      </label>
      <label>
        Personal email (optional)
        <input
          name="personal_email"
          type="email"
          defaultValue={officer?.personal_email ?? ""}
        />
      </label>
      <label>
        Position
        <select
          name="position_id"
          required
          defaultValue={officer?.position_id ?? ""}
        >
          <option value="">Select position</option>
          {positions.map((position) => (
            <option key={position.id} value={position.id}>
              {position.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Classification (optional)
        <select
          name="classification"
          defaultValue={officer?.classification ?? ""}
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
      </label>
      {officer && (
        <label>
          Status
          <select name="status" defaultValue={officer.status}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      )}
      <fieldset className="sm:col-span-2">
        <legend>Branches (optional)</legend>
        {branches.map((branch) => (
          <label key={branch.id}>
            <input
              type="checkbox"
              name="branches"
              value={branch.id}
              defaultChecked={branchIds.includes(branch.id)}
            />{" "}
            {branch.name}
          </label>
        ))}
      </fieldset>
      {state.error && (
        <p role="alert" className="sm:col-span-2">
          {state.error}
        </p>
      )}
      <button disabled={pending}>{pending ? "Saving…" : "Save officer"}</button>
    </form>
  );
}
