import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>Record not found</h1>
      <p>The requested officer, event, or page does not exist.</p>
      <Link href="/">Back to dashboard</Link>
    </>
  );
}
