import { describe, expect, it } from "vitest";
import type { RecordConfig } from "@/lib/engine-types";
import { recordActions } from "./record-actions";

const rec = {
  title: () => "x", edit: "edit",
  actions: [{ id: "note", label: "Note", run: () => {} }, { id: "cancel", label: "Cancel", deletes: true, run: () => {} }],
  remove: { path: () => "/x" },
} as unknown as RecordConfig;

describe("what a record's sheet offers", () => {
  it("a live record gets its actions, and the delete only for someone who may delete", () => {
    const live = { id: "1", deletedAt: null };
    expect(recordActions(rec, live, true)).toMatchObject({ gone: false, edit: true });
    expect(recordActions(rec, live, true).acts.map((a) => a.id)).toEqual(["note", "cancel"]);
    expect(recordActions(rec, live, true).remove).not.toBeNull();
    expect(recordActions(rec, live, false).acts.map((a) => a.id)).toEqual(["note"]);
    expect(recordActions(rec, live, false).remove).toBeNull();
  });
  it("a deleted record is only read: no edit, no delete and no action, whoever opens it", () => {
    const deleted = { id: "1", deletedAt: "2026-11-25T10:00:00Z" };
    for (const mayDelete of [true, false]) expect(recordActions(rec, deleted, mayDelete)).toEqual({ gone: true, edit: false, acts: [], remove: null });
  });
});
