import Link from "next/link";
import { PointValue } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import { formatDate, formatLabel } from "@/lib/presentation";

type PointTransactionWithRelations = Tables<"point_transactions"> & {
  officers: Pick<Tables<"officers">, "id" | "name">;
  events: Pick<Tables<"events">, "id" | "name"> | null;
  tasks: Pick<Tables<"tasks">, "id" | "title"> | null;
};
type PointTransactionTableProps = {
  transactions: PointTransactionWithRelations[];
};

export default function PointTransactionTable({
  transactions,
}: PointTransactionTableProps) {
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
                <Link href={`/tasks/${transaction.tasks.id}`}>
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
            <td>{formatDate(transaction.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
