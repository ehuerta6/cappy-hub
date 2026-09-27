import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default async function OfficerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const { data: officer, error } = await supabase
    .from("officers")
    .select("*, positions(name), officer_branches(branches(name))")
    .eq("id", Number(id))
    .maybeSingle();
  if (error) throw new Error(`Failed to load officer: ${error.message}`);
  if (!officer) notFound();
  return (
    <>
      <h1>{officer.name}</h1>
      <p>
        <Link href={`/officers/${id}/edit`}>Edit officer / change status</Link>
      </p>
      <dl>
        <dt>Email</dt>
        <dd>{officer.email}</dd>
        <dt>Position</dt>
        <dd>{officer.positions.name}</dd>
        <dt>Classification</dt>
        <dd>{officer.classification}</dd>
        <dt>Status</dt>
        <dd>{officer.status}</dd>
        <dt>Branches</dt>
        <dd>
          {officer.officer_branches
            .map((membership) => membership.branches.name)
            .join(", ") || "None"}
        </dd>
      </dl>
    </>
  );
}
