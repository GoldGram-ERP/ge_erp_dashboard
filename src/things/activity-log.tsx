"use client";
// سجل النشاط / Activity log (owner, 2026-11-24): setup/activity-log, for an Admin. The Super admin reads the same log in "الأمان والبيانات", so the menu hides this one from them.
// An Admin never sees a row a Super admin made (the backend filters them). Print and Excel stay the Super admin's.
import type { MakeConfig, ThingConfig } from "@/lib/engine-types";
import { ThingPage } from "@/components/engine";
import { useAccess } from "./sales-access";
import { activityLogView } from "./activity-log-view";

export const makeConfig: MakeConfig = (tr): ThingConfig => ({
  id: "activity-log",
  title: tr.t("super-control", "activityLog.title"),
  unit: tr.L("سجل", "records"),
  keys: ["administration/activity-log"],
  views: [activityLogView(tr, ["administration/activity-log"])],
  forms: {},
});

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
