"use client";
import { useEffect } from "react";
import { useToast } from "@/lib/toast";

export function Toaster() {
  const { msg, error, n, hide } = useToast();
  useEffect(() => { if (!n) return; const t = setTimeout(hide, 4200); return () => clearTimeout(t); }, [n, hide]);
  return <div className={`toast${msg ? " show" : ""}${error ? " error" : ""}`} role="status" aria-live="polite">{msg ? <span>{msg}</span> : null}</div>;
}
