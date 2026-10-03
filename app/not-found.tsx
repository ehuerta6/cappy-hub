import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>Record not found</h1>
      <p>The requested record or page could not be found.</p>
      <Link href="/">Back to dashboard</Link>
    </>
  );
}
