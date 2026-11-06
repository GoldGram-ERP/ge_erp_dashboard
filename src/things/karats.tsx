"use client";
// العيارات: system-codes/karats, karats-list. A fixed, read-only list (GET /karats -> [{karat}]; no add, edit or delete route). Ported from docs/nav-preview/app/things/karats.js.
import type { MakeConfig, ThingConfig } from "@/lib/engine-types";
import { ThingPage, Ltr } from "@/components/engine";

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const m = (k: string) => tr.t("system-codes", `karats.${k}`);
  return {
    id: "karats",
    title: m("title"),
    unit: tr.L("عيار", "karats"),
    keys: ["system-codes/karats", "system-codes/karats-list"],
    views: [{
      id: "list", label: m("title"), endpoint: "/karats", rowKey: "karat",
      narrow: true,
      paging: false,       // the whole list at once, no parameters
      onRow: false,        // nothing to open
      columns: [{ key: "karat", label: m("karat"), render: (r) => <Ltr>{String(r.karat)}</Ltr> }],
      answerExtra: () => m("fixedNote"),
    }],
  };
};

export default function Page() { return <ThingPage make={makeConfig} />; }
