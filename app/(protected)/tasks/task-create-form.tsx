"use client";

import { useActionState } from "react";
import { createTask } from "./actions";

export default function TaskCreateForm({
  branches,
}: {
  branches: { id: number; name: string }[];
}) {
  const [state, action, pending] = useActionState(createTask, { error: "" });
  return (
    <form action={action} className="space-y-4 max-w-xl">
      <label>
        Title
        <input name="title" required />
      </label>
      <label>
        Description
        <textarea name="description" required />
      </label>
      <label>
        Type
        <select name="task_type" required defaultValue="">
          <option value="" disabled>
            Select task type
          </option>
          {["Flyer", "LinkedIn", "Airtable", "Story", "Post"].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      <label>
        Branch
        <select name="branch_id" required defaultValue="">
          <option value="" disabled>
            Select branch
          </option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Due date
        <input name="due_date" type="date" required />
      </label>
      <label>
        Points
        <input name="points" type="number" min="0.01" step="0.01" required />
      </label>
      <label>
        <input name="approval_required" type="checkbox" /> Require lead approval
        before points are awarded
      </label>
      {state.error && (
        <p role="alert" className="text-red-300">
          {state.error}
        </p>
      )}
      <button disabled={pending}>{pending ? "Saving…" : "Create task"}</button>
    </form>
  );
}
