"use client";

export default function NewOfficerPage() {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    console.log("Form submitted");

    const formData = new FormData(event.currentTarget);

    const name = formData.get("name");
    const email = formData.get("email");
    const role = formData.get("role");
    const branch = formData.get("branch");

    console.log(name, email, role, branch);
  }
  return (
    <div>
      <h1>Add Officer</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
        </div>
        <div>
          <label htmlFor="role">Role</label>
          <input id="role" name="role" type="text" required />
        </div>
        <div>
          <label htmlFor="branch">Branch</label>
          <input id="branch" name="branch" type="text" required />
        </div>
        <button type="submit">Create Officer</button>
      </form>
    </div>
  );
}
