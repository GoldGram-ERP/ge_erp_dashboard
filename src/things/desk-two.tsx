"use client";
// The Sales desk, direction two ("Tally"): the same list as the Sales desk, with its own draft page.
import { useMemo } from "react";
import type { MakeConfig } from "@/lib/engine-types";
import { useMe } from "@/lib/session";
import { ThingPage } from "@/components/engine";
import { useAccess } from "./sales-access";
import { buildConfig } from "./sales-desk";
import { OpenByNumber } from "./sales-desk-form";
import { seesEveryBranchDrafts } from "./sales-desk-rules";
import DeskTwoForm from "./desk-two-form";

export default function Page() {
  const { data: me } = useMe();
  const everyBranch = seesEveryBranchDrafts(me);
  const make = useMemo<MakeConfig>(() => (tr) => {
    const c = buildConfig(tr, everyBranch);
    return { ...c, id: "desk-two", forms: { ...c.forms,
      draft: { ...c.forms!.draft, custom: DeskTwoForm },
      open: { ...c.forms!.open, custom: (p) => <OpenByNumber {...p} form={DeskTwoForm} /> } } };
  }, [everyBranch]);
  return <ThingPage make={make} access={useAccess()} />;
}
