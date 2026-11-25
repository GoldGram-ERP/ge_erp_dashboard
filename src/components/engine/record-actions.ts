import type { RecordConfig, Row } from "@/lib/engine-types";

/** What a record's sheet offers (owner, 2026-11-25). A deleted record (it has `deletedAt`) is only read: everyone who has the screen may open it, and it gets no edit,
 *  no delete and no other action. A live one gets the actions whose `when` holds, and a delete only for someone who may delete (the action delete-records). */
export function recordActions(rec: RecordConfig, full: Row, mayDelete: boolean) {
  const gone = Boolean(full.deletedAt);
  if (gone) return { gone, edit: false, acts: [] as NonNullable<RecordConfig["actions"]>, remove: null };
  return {
    gone,
    edit: Boolean(rec.edit),
    acts: (rec.actions ?? []).filter((a) => (!a.when || a.when(full)) && (!a.deletes || mayDelete)),
    remove: mayDelete && rec.remove && (!rec.remove.when || rec.remove.when(full)) ? rec.remove : null,
  };
}
