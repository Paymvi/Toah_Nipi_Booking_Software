import { createContext, useContext } from "react";

// What the signed-in account may use: { access: "office" | "limited" | "unknown" | null, departments, ... }.
// Display only. The database functions enforce every permission themselves.
export const StaffAccessContext = createContext({ access: "office" });

export function useStaffAccess() {
  return useContext(StaffAccessContext);
}
