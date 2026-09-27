import Link from "next/link";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";

export default async function OfficersPage() {
  await connection();
  const { data, error } = await supabase
    .from("officers")
    .select("*, positions(name), officer_branches(branches(name))")
    .order("name");
  if (error) throw new Error(`Failed to load officers: ${error.message}`);
  return (
    <>
      <h1>Officers</h1>
      <p>
        <Link href="/officers/new">Add officer</Link>
      </p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Position</th>
            <th>Classification</th>
            <th>Branches</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((officer) => (
            <tr key={officer.id}>
              <td>
                <Link href={`/officers/${officer.id}`}>{officer.name}</Link>
              </td>
              <td>{officer.email}</td>
              <td>{officer.positions.name}</td>
              <td>{officer.classification}</td>
              <td>
                {officer.officer_branches
                  .map((membership) => membership.branches.name)
                  .join(", ") || "None"}
              </td>
              <td>{officer.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && <p>No officers yet.</p>}
    </>
  );
}
