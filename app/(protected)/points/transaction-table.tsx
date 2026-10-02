import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { displayDate } from "@/lib/event-status";
import { formatLabel } from "@/lib/presentation";
import { PointValue } from "@/components/ui";
type Transaction = Tables<"point_transactions"> & {
  officers: Pick<Tables<"officers">, "id" | "name">;
  events: Pick<Tables<"events">, "id" | "name"> | null;
  tasks: Pick<Tables<"tasks">, "id" | "title"> | null;
};
export default function TransactionTable({
  transactions,
}: {
  transactions: Transaction[];
}) {
  if (!transactions.length) return <p>No point transactions yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Officer</th>
          <th>Event / task</th>
          <th>Reason</th>
          <th>Points</th>
          <th>Award type</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
          <tr key={transaction.id}>
            <td>
              <Link href={`/officers/${transaction.officers.id}`}>
                {transaction.officers.name}
              </Link>
            </td>
            <td>
              {transaction.events ? (
                <Link href={`/events/${transaction.events.id}`}>
                  {transaction.events.name}
                </Link>
              ) : transaction.tasks ? (
                <Link href={`/tasks#task-${transaction.tasks.id}`}>
                  {transaction.tasks.title}
                </Link>
              ) : (
                "—"
              )}
            </td>
            <td>{transaction.reason}</td>
            <td>
              <PointValue value={transaction.points} />
            </td>
            <td>{formatLabel(transaction.award_type)}</td>
            <td>{displayDate(transaction.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
