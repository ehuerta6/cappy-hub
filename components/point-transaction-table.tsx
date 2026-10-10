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

function TransactionSource({
  transaction,
}: {
  transaction: PointTransactionWithRelations;
}) {
  if (transaction.events)
    return (
      <Link href={`/events/${transaction.events.id}`} className="break-words">
        {transaction.events.name}
      </Link>
    );
  if (transaction.tasks)
    return (
      <Link href={`/tasks/${transaction.tasks.id}`} className="break-words">
        {transaction.tasks.title}
      </Link>
    );
  return "—";
}

export default function PointTransactionTable({
  transactions,
}: PointTransactionTableProps) {
  if (!transactions.length) return <p>No point transactions yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Officer</th>
          <th scope="col">Event / task</th>
          <th scope="col">Reason</th>
          <th scope="col">Points</th>
          <th scope="col">Award type</th>
          <th scope="col">Date</th>
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
              <TransactionSource transaction={transaction} />
            </td>
            <td className="break-words">{transaction.reason}</td>
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
