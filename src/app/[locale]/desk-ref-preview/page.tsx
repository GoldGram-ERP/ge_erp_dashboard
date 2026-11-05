import { notFound } from "next/navigation";
import { DeskScreen } from "@/things/desk-ref/DeskScreen";
import { DESK_SAMPLE } from "@/things/desk-ref/sample";

// Dev-only, for the pixel proof (e2e-tests/tests/desk-pixel.e2e.ts): the desk with fixed sample props, off the signed-in shell (which needs the backend).
// Reachable only when the build had NEXT_PUBLIC_DESK_PREVIEW=1; /ar/desk-ref-preview?theme=dark for the dark theme.
export default async function DeskRefPreview({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  if (process.env.NEXT_PUBLIC_DESK_PREVIEW !== "1") notFound();
  const { theme } = await searchParams;
  return (
    <>
      {/* The app's global page rules (fixed-height flex body that never scrolls) would clip the desk; the preview lets the page grow. */}
      <style>{`html,body{height:auto!important;overflow:visible!important;display:block!important}`}</style>
      <DeskScreen values={{ ...DESK_SAMPLE, theme: theme === "dark" ? "dark" : "light" }} />
    </>
  );
}
