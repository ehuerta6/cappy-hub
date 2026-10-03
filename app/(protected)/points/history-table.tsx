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
        <tr>
          <th>Officer</th>
          <th>Event / task</th>
          <th>Reason</th>
          <th>Points</th>
          <th>Type</th>
          <th>Activity date</th>
          {isAdmin && <th>Actor / status</th>}
          {isAdmin && <th>Action</th>}
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
          <tr key={transaction.id}>
            <td>
              {transaction.officer_id ? (
                <Link
                  href={withReturnTo(
                    `/officers/${transaction.officer_id}`,
                    returnTo,
                  )}
                >
                  {transaction.officer_name}
                </Link>
              ) : (
                transaction.officer_name
              )}
            </td>
            <td>
              {transaction.event_id ? (
                <Link
                  href={withReturnTo(
                    `/events/${transaction.event_id}`,
                    returnTo,
                  )}
                >
                  {transaction.event_name}
                </Link>
              ) : transaction.task_id ? (
                <Link
                  href={withReturnTo(`/tasks/${transaction.task_id}`, returnTo)}
                >
                  {transaction.task_title}
                </Link>
              ) : (
                "—"
              )}
            </td>
            <td>{transaction.reason}</td>
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
                <div>
                  {transaction.created_by_name ??
                    (transaction.created_by ? "Unlinked account" : "System")}
                </div>
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
              <td>
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
