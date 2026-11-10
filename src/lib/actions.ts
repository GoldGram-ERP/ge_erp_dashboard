// Per-person action permissions: one place to ask "may this person do <action>?". Admin and Super admin may do every action;
// a plain user only the keys the backend lists in /access/me `actions`. Hidden by default (an unknown key is false for a plain user).
export type ActionKey = "give-cash-discount" | "use-treasuries" | "complete-sales-draft" | "confirm-taslem";
export const ACTIONS: readonly ActionKey[] = ["give-cash-discount", "use-treasuries", "complete-sales-draft", "confirm-taslem"];
export const BUSINESS_ROLES = ["accountant", "call_center", "branch_sales", "pricing_specialist"] as const;

export const hasAction = (me: { userType?: string; actions?: string[] } | null | undefined, key: string): boolean =>
  !!me && (me.userType === "admin" || me.userType === "super_admin" || (me.actions ?? []).includes(key));
