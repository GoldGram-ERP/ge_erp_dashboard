"use client";
// The Sales desk (issue #6). Stage 1: the route, the nav leaf and the texts exist; the form is built in stage 2.
import { useT } from "@/lib/t";

export default function Page() {
  const tr = useT();
  return (
    <section>
      <h1>{tr.t("gold-sales", "salesDesk.title")}</h1>
      <p className="help">{tr.t("app", "comingSoon")}</p>
    </section>
  );
}
