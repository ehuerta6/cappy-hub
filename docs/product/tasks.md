# Tasks

## Tasks

### Current / shipped

A Task has a title, description, Task type, one Branch, a due date with an optional due time for reminder scheduling, Point value, and recurrence metadata when applicable. Due dates and optional times are displayed in America/Denver. Its assignments are stored in **`task_officer_assignments`**, the canonical assignment relation. One Task can have multiple Officers. Officers can self-assign when the Task is open to assignment; authorized managers can assign or remove one or multiple Officers.

Tasks may also have zero or more external resource links. Each link has an HTTP(S) URL and a readable common or custom label. These links are contextual references and do not change Task assignment, completion, or Points.

Completion is tracked independently for each Task/Officer assignment. An active Officer may mark their own active assignment complete. For an ordinary Officer, this reports the completion for review by a Task manager in scope; the assignment remains awaiting approval until approved. An active Lead who manages the Task's Branch or an Admin who marks their own assignment complete is accepted immediately. A Task manager can approve or reject another Officer's pending report. Rejection clears the report, notifies the Officer in-app, and allows a new submission without retaining a separate rejected state. Authorized managers retain their ability to correct or reverse any assignment completion in their permitted Task/Branch scope.

Only approved completion earns the Task's fixed Point value, and only after its due date has passed in America/Denver. The optional due time changes reminder scheduling only. A scheduled database processor handles eligible Tasks when the application is closed. If an authorized manager changes completion after the due date, the corresponding award is reconciled. Reversing an approved completion logically removes the award; completing again reuses the same Task/Officer transaction. Existing completed assignments and historical approval data retain their meaning.

Authorized managers can correct completed or awarded Tasks, including fixed Points, due dates and assignments. A corrected future due date or removed assignment suspends dependent credit; eligibility recovery reuses the same transaction and preserved completion history. Explicit Admin removals and ambiguous legacy removals stay excluded. Routine processing and descriptive edits preserve historical direct amount edits; explicitly correcting the Task fixed value updates its dependent eligible or mechanically suspended awards with before/after audit. Due-date processing uses each active assignment's current completion state. Historical approval fields or audit entries retained from an older workflow are historical compatibility only; the retired single-assignee projection and legacy completion/approval RPC workflow are not current product behavior.

Tasks may link to zero or more Events for context. Links do not change either record's authorization, workflow, or Point behavior. Existing links remain readable when an Event is cancelled or archived; cancelled and archived Events cannot be newly linked.

The Tasks page groups active Tasks into **Current** (due today or later) and **Past** (overdue), with status filters for Open, In progress, and Complete. Authorized managers can select an explicit Deleted view. Assignment progress and the current Officer's relationship to each Task are visible in context. The Calendar shows each active Task due date and opens the canonical Task record.

Authorized managers can Delete and Restore a Task within their existing branch scope, including completed and awarded Tasks. Delete hides the Task from active lists, Dashboard action items, and Calendar, and suspends its active automatic Task awards. The Task, assignments, completion, recurrence identity, Points, and audit history remain available. Restore reuses the existing award reconciler with current due-date and completion rules; an award intentionally removed independently is not reactivated. Each action applies to one Task occurrence.
