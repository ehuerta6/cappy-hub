import { officers } from "./data";
import Link from "next/link";

export default function OfficersPage() {
  return (
    <div className="mx-auto w-full max-w-6xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Officers</h1>
        <Link
          href="/officers/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Add Officer
        </Link>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left">Name</th>
            <th className="px-4 py-3 text-left">Email</th>
            <th className="px-4 py-3 text-left">Role</th>
            <th className="px-4 py-3 text-left">Branch</th>

            <th className="px-4 py-3 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {officers.map((officer) => (
            <tr key={officer.id} className="border-t">
              <td className="px-4 py-3">
                <Link href={`/officers/${officer.id}`}>{officer.name}</Link>
              </td>
              <td className="px-4 py-3">{officer.email}</td>
              <td className="px-4 py-3">{officer.role}</td>
              <td className="px-4 py-3">
                <span>{officer.branch ? officer.branch : "No branch"}</span>
              </td>

              <td className="px-4 py-3">
                <span
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    officer.active
                      ? "bg-neutral-200 text-black"
                      : "border border-neutral-600 text-neutral-400"
                  }`}
                >
                  {officer.active ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
