"use client";
// An inline script that exists only in the server-rendered HTML (owner, 2026-11-10). React 19 prints "Encountered a script tag while rendering React component"
// (a red Issues badge on every dev server) whenever the CLIENT renders a <script>; rendering it on the server only means the client never sees one.
// The script has already run when the HTML was parsed, so nothing is lost; the element is kept out of hydration checks with suppressHydrationWarning.
export function ServerScript({ id, code }: { id: string; code: string }) {
  return typeof window === "undefined" ? <script id={id} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: code }} /> : null;
}
