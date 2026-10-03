import { withReturnTo } from "@/lib/return-context";
import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import {
  formatCalendarDate,
  formatDate,
  formatLabel,
} from "@/lib/presentation";
import { PointValue, StatusBadge } from "@/components/ui";
import PointActions from "./point-actions";

function OfficerLink({
  transaction,
  returnTo,
}: {
  transaction: Tables<"point_history">;
  returnTo?: string;
}) {
  if (!transaction.officer_id) return transaction.officer_name;
  return (
    <Link href={withReturnTo("/officers/" + transaction.officer_id, returnTo)}>
      {transaction.officer_name}
    </Link>
  );
}

function TransactionSource({
  transaction,
  returnTo,
}: {
  transaction: Tables<"point_history">;
  returnTo?: string;
}) {
  if (transaction.event_id)
    return (
      <Link
        href={withReturnTo("/events/" + transaction.event_id, returnTo)}
        className="break-words"
      >
        {transaction.event_name}
      </Link>
    );
  if (transaction.task_id)
    return (
      <Link
        href={withReturnTo("/tasks/" + transaction.task_id, returnTo)}
        className="break-words"
      >
        {transaction.task_title}
      </Link>
    );
  return "—";
}

function actorName(transaction: Tables<"point_history">) {
  return (
    transaction.created_by_name ??
    (transaction.created_by ? "Unlinked account" : "System")
  );
}

export default function HistoryTable({
  returnTo,
  transactions,
  isAdmin,
  emptyMessage,
}: {
  returnTo?: string;
  transactions: Tables<"point_history">[];
  isAdmin: boolean;
  emptyMessage: string;
}) {
  if (!transactions.length) return <p>{emptyMessage}</p>;
  return (
    <table>
      <thead>
        <tr className="grid grid-cols-1 md:table-row">
          <th scope="col" className="xl:hidden">
            Point transaction
          </th>
          <th scope="col" className="hidden xl:table-cell">
            Officer
          </th>
          <th scope="col" className="hidden xl:table-cell">
            Event / task
          </th>
          <th scope="col" className="hidden xl:table-cell">
            Reason
          </th>
          <th scope="col" className="hidden xl:table-cell">
            Points
          </th>
          <th scope="col" className="hidden xl:table-cell">
            Type
          </th>
          <th scope="col" className="hidden xl:table-cell">
            Activity date
          </th>
          {isAdmin && (
            <th scope="col" className="hidden xl:table-cell">
              Actor / status
            </th>
          )}
          {isAdmin && <th scope="col">Action</th>}
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
          <tr key={transaction.id} className="grid grid-cols-1 md:table-row">
            <td className="min-w-0 xl:hidden">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="break-words font-medium">
                    <OfficerLink
                      transaction={transaction}
                      returnTo={returnTo}
                    />
                  </div>
                  <div className="mt-1 break-words text-sm">
                    <TransactionSource
                      transaction={transaction}
                      returnTo={returnTo}
                    />
                  </div>
                </div>
                <div className="shrink-0">
                  <PointValue value={transaction.points ?? 0} />
                  <span className="sr-only"> points</span>
                </div>
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 break-words text-sm text-muted">
                <span>Reason: {transaction.reason}</span>
                <span>Type: {formatLabel(transaction.award_type ?? "")}</span>
                <span>
                  Activity date:{" "}
                  {transaction.activity_date
                    ? formatCalendarDate(transaction.activity_date)
                    : "—"}
                </span>
              </div>
              {isAdmin && (
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted">
                  <span>Actor: {actorName(transaction)}</span>
                  {transaction.removed_at && (
                    <>
                      <StatusBadge status="removed" />
                      <span>
                        Removed by{" "}
                        {transaction.removed_by_name ?? "Unlinked account"}
                      </span>
                      <span>{formatDate(transaction.removed_at)}</span>
                    </>
                  )}
                </div>
              )}
            </td>
            <td className="hidden xl:table-cell">
              <OfficerLink transaction={transaction} returnTo={returnTo} />
            </td>
            <td className="hidden xl:table-cell">
              <TransactionSource
                transaction={transaction}
                returnTo={returnTo}
              />
            </td>
            <td className="hidden xl:table-cell break-words">
              {transaction.reason}
            </td>
            <td className="hidden xl:table-cell">
              <PointValue value={transaction.points ?? 0} />
            </td>
            <td className="hidden xl:table-cell">
              {formatLabel(transaction.award_type ?? "")}
            </td>
            <td className="hidden xl:table-cell">
              {transaction.activity_date
                ? formatCalendarDate(transaction.activity_date)
                : "—"}
            </td>
            {isAdmin && (
              <td className="hidden xl:table-cell">
                <div>{actorName(transaction)}</div>
                {transaction.removed_at && (
                  <div className="space-y-1">
                    <StatusBadge status="removed" />
                    <div>
                      Removed by{" "}
                      {transaction.removed_by_name ?? "Unlinked account"}
                    </div>
                    <div>{formatDate(transaction.removed_at)}</div>
                  </div>
                )}
              </td>
            )}
            {isAdmin && (
              <td className="min-w-0">
                {transaction.id && !transaction.removed_at && (
                  <PointActions
                    transactionId={transaction.id}
                    points={transaction.points ?? 0}
                  />
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
