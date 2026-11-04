"use client";
import { createElement, lazy, Suspense, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useMe } from "@/lib/session";
import { canOpen, findLeaf } from "@/nav/tree";
import { things } from "@/things/registry";
import { Icon } from "./icon";

export function ComingSoon() {
  const t = useTranslations("app");
  return <div className="empty" data-testid="coming-soon"><Icon name="file" size={36} /><strong>{t("comingSoon")}</strong></div>;
}
const cache = new Map<string, ReactElement>();
function pageFor(key: string) {
  const entry = things[key];
  if (!entry) return null;
  if (!cache.has(key)) cache.set(key, createElement(lazy(entry.load)));
  return cache.get(key)!;
}

export function ThingHost({ route }: { route: string }) {
  const t = useTranslations("app");
  const { data: me } = useMe();
  const leaf = findLeaf(route);
  if (!me || !leaf) return null;
  if (!canOpen(me, leaf.screens) || (leaf.group.superOnly && me.userType !== "super_admin")) return <div className="empty"><Icon name="lock" size={36} /><strong>{t("noAccess")}</strong></div>;
  const page = pageFor(route.slice(1));
  if (!page) return <ComingSoon />;
  return <Suspense fallback={<div className="empty" aria-busy="true"><span>{t("loading")}</span></div>}>{page}</Suspense>;
}
