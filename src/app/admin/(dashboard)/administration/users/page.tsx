import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { UsersSection } from "@/components/admin/administration/UsersSection";
import { UsersHeader } from "./UsersHeader";

export default async function AdministrationUsersPage() {
  const admins = await db
    .select({ id: users.id, username: users.username, email: users.email, role: users.role })
    .from(users);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <UsersHeader />
      <UsersSection initialAdmins={admins} />
    </div>
  );
}
