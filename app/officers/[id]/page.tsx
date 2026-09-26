import { officers } from "../data";

export default async function OfficerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const officer = officers.find((officer) => officer.id === Number(id));

  if (!officer) {
    return <h1>Officer not found</h1>;
  }
  return (
    <div className="space-y-6">
      <h1 className="border-b">{officer.name}</h1>

      <div>
        <p>Email</p>
        <p>{officer.email}</p>
      </div>

      <div>
        <p>Role</p>
        <p>{officer.role}</p>
      </div>

      <div>
        <p>Branch</p>
        <p>{officer.branch ? officer.branch : "No branch"}</p>
      </div>

      <div>
        <p>Status</p>
        <p>{officer.active ? "Active" : "Inactive"}</p>
      </div>
    </div>
  );
}
