import type { Column, ViewConfig } from "./engine-types";

/** How a column sorts: on the server through the view's sort param, in the browser when the whole list is loaded, or not at all (a paged list whose backend takes no sort for it). */
export const sortKeyOf = (view: ViewConfig, c: Column, whole: boolean): string | null => {
  if (c.sortable === false && !c.sortKey) return null;
  if (view.sort) return c.sortKey ?? c.key;
  if (!whole) return view.serverSort?.on && view.serverSort.columns[c.sortKey ?? c.key] ? c.sortKey ?? c.key : null;
  return c.sortKey ?? c.key;   // one page is the whole list: sorted here
};
