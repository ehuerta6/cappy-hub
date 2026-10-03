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
      <Link href={"/events/" + transaction.events.id} className="break-words">
        {transaction.events.name}
      </Link>
    );
  if (transaction.tasks)
    return (
      <Link href={"/tasks/" + transaction.tasks.id} className="break-words">
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
            Award type
          </th>
          <th scope="col" className="hidden xl:table-cell">
            Date
          </th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
          <tr key={transaction.id} className="grid grid-cols-1 md:table-row">
            <td className="min-w-0 xl:hidden">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={"/officers/" + transaction.officers.id}
                    className="break-words font-medium"
                  >
                    {transaction.officers.name}
                  </Link>
                  <div className="mt-1 break-words text-sm">
                    <TransactionSource transaction={transaction} />
                  </div>
                </div>
                <div className="shrink-0">
                  <PointValue value={transaction.points} />
                  <span className="sr-only"> points</span>
                </div>
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 break-words text-sm text-muted">
                <span>Reason: {transaction.reason}</span>
                <span>Award type: {formatLabel(transaction.award_type)}</span>
                <span>Date: {formatDate(transaction.created_at)}</span>
              </div>
            </td>
            <td className="hidden xl:table-cell">
              <Link href={"/officers/" + transaction.officers.id}>
                {transaction.officers.name}
              </Link>
            </td>
            <td className="hidden xl:table-cell">
              <TransactionSource transaction={transaction} />
            </td>
            <td className="hidden xl:table-cell break-words">
              {transaction.reason}
            </td>
            <td className="hidden xl:table-cell">
              <PointValue value={transaction.points} />
            </td>
            <td className="hidden xl:table-cell">
              {formatLabel(transaction.award_type)}
            </td>
            <td className="hidden xl:table-cell">
              {formatDate(transaction.created_at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
