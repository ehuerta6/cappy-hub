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
    <Link href={withReturnTo(`/officers/${transaction.officer_id}`, returnTo)}>
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
        href={withReturnTo(`/events/${transaction.event_id}`, returnTo)}
        className="break-words"
      >
        {transaction.event_name}
      </Link>
    );
  if (transaction.task_id)
    return (
      <Link
        href={withReturnTo(`/tasks/${transaction.task_id}`, returnTo)}
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
    <table className="point-history-table">
      <thead>
        <tr>
          <th scope="col">Officer</th>
          <th scope="col">Event / task</th>
          <th scope="col">Reason</th>
          <th scope="col">Points</th>
          <th scope="col">Type</th>
          <th scope="col">Activity date</th>
          {isAdmin && <th scope="col">Actor / status</th>}
          {isAdmin && <th scope="col">Action</th>}
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
          <tr key={transaction.id}>
            <td>
              <OfficerLink transaction={transaction} returnTo={returnTo} />
            </td>
            <td>
              <TransactionSource
                transaction={transaction}
                returnTo={returnTo}
              />
            </td>
            <td className="break-words">{transaction.reason}</td>
            <td>
              <PointValue value={transaction.points ?? 0} />
            </td>
            <td>{formatLabel(transaction.award_type ?? "")}</td>
            <td>
              {transaction.activity_date
                ? formatCalendarDate(transaction.activity_date)
                : "—"}
            </td>
            {isAdmin && (
              <td>
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
