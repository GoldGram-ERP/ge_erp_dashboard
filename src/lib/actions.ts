// Per-person action permissions: one place to ask "may this person do <action>?". Admin and Super admin may do every action;
// a plain user only the keys the backend lists in /access/me `actions`. Hidden by default (an unknown key is false for a plain user).
export type ActionKey = "give-cash-discount" | "use-treasuries" | "complete-sales-draft" | "confirm-taslem" | "delete-records";
export const ACTIONS: readonly ActionKey[] = ["give-cash-discount", "use-treasuries", "complete-sales-draft", "confirm-taslem", "delete-records"];
export const BUSINESS_ROLES = ["accountant", "call_center", "branch_sales", "pricing_specialist"] as const;
/** The business roles that work on the Sales desk drafts of every user and every branch (owner, 2026-11-25). Keep in step with DESK_WIDE_ROLES of the backend (hand-over-rule.ts). */
export const DESK_WIDE_ROLES = ["accountant"] as const;
export const isDeskWideRole = (role: string | null | undefined): boolean => !!role && (DESK_WIDE_ROLES as readonly string[]).includes(role);

export const hasAction = (me: { userType?: string; actions?: string[] } | null | undefined, key: string): boolean =>
  !!me && (me.userType === "admin" || me.userType === "super_admin" || (me.actions ?? []).includes(key));
