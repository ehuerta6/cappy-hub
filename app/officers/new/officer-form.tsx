"use client";

import { useActionState } from "react";
import type { Tables } from "@/lib/database.types";
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
    <form action={action}>
      {officer && <input type="hidden" name="id" value={officer.id} />}
      <label>
        Name <input name="name" required defaultValue={officer?.name} />
      </label>
      <label>
        Email{" "}
        <input
          name="email"
          type="email"
          required
          defaultValue={officer?.email}
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
        Classification
        <select
          name="classification"
          required
          defaultValue={officer?.classification ?? ""}
        >
          <option value="">Select classification</option>
          {["freshman", "sophomore", "junior", "senior", "masters", "phd"].map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        Status
        <select name="status" defaultValue={officer?.status ?? "active"}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      <fieldset>
        <legend>Branches</legend>
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
      {state.error && <p role="alert">{state.error}</p>}
      <button disabled={pending}>{pending ? "Saving…" : "Save officer"}</button>
    </form>
  );
}
