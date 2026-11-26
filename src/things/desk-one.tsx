"use client";
// The redesigned Sales desk, direction one ("the counter slip"): the Sales desk's data, its list drawn by desk-one-list and its draft page by desk-one-form.
import { useMemo } from "react";
import type { MakeConfig } from "@/lib/engine-types";
import { useMe } from "@/lib/session";
import { ThingPage } from "@/components/engine";
import { useAccess } from "./sales-access";
import { OpenByNumber } from "./sales-desk-form";
import { seesEveryBranchDrafts } from "./sales-desk-rules";
import { buildConfig } from "./sales-desk";
import DeskOneForm from "./desk-one-form";
import DeskOneList from "./desk-one-list";

export default function Page() {
  const { data: me } = useMe();
  const everyBranch = seesEveryBranchDrafts(me);
  const make = useMemo<MakeConfig>(() => (tr) => {
    const c = buildConfig(tr, everyBranch);
    return { ...c, id: "desk-one", list: DeskOneList, forms: { ...c.forms,
      draft: { ...c.forms!.draft, custom: DeskOneForm },
      open: { ...c.forms!.open, custom: (p) => <OpenByNumber {...p} form={DeskOneForm} /> } } };
  }, [everyBranch]);
  return <ThingPage make={make} access={useAccess()} />;
}
