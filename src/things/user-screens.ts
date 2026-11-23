// The Users form and the screens of a person who becomes an Admin (owner, 2026-11-24).
// An Admin has every screen, except one whose only open screen is the Sales desk (a desk-only Admin). A plain user's ticked screens stay saved when the
// person is changed to Admin, so a user who had only the desk ticked became a desk-only Admin and got one page. Saying "no screens" (the backend's
// "every screen again") on that change clears the leftovers.

/** What to send as `screens` when a saved account is edited: [] when a plain user becomes an Admin, nothing otherwise (an Admin edited as an Admin keeps what it has, a desk-only one included). */
export const screensOnTypeChange = (savedType: string | undefined, newType: string): string[] | undefined =>
  savedType === "user" && newType === "admin" ? [] : undefined;
