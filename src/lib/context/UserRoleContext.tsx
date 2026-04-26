"use client";

import { createContext, useContext } from "react";
import type { AdminRole } from "@/lib/auth/validateSession";

type UserCtx = {
  role: AdminRole;
  hasEmail: boolean;
  hasRecoveryCodes: boolean;
  /** "all" for global-role users; string[] of formInstanceIds for scoped-only users */
  accessibleFormIds: string[] | "all";
};

const UserRoleContext = createContext<UserCtx>({ role: "admin", hasEmail: true, hasRecoveryCodes: true, accessibleFormIds: "all" });

export function UserRoleProvider({
  role,
  hasEmail,
  hasRecoveryCodes,
  accessibleFormIds,
  children,
}: {
  role: AdminRole;
  hasEmail: boolean;
  hasRecoveryCodes: boolean;
  accessibleFormIds: string[] | "all";
  children: React.ReactNode;
}) {
  return (
    <UserRoleContext.Provider value={{ role, hasEmail, hasRecoveryCodes, accessibleFormIds }}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole(): AdminRole {
  return useContext(UserRoleContext).role;
}

export function useUserCtx(): UserCtx {
  return useContext(UserRoleContext);
}
