// Source scanner for the "one source of UI" rules (docs/specs/ui-conformance-benchmark.md): pure text in, counts out, so the ratchet and the
// seeded-recall test run the very same code. U1 = bespoke markup/CSS instead of a library component, T1 = raw table/control tags, C1 = hard-coded px/colour.
// shortcut: regex on text, not an AST; a tag built by string concatenation or a size inside a template literal is not seen (see the test's "not detected" note).

export type Rule = "U1" | "T1" | "C1";
export type Counts = Record<Rule, number>;

// Implementation files of the library itself: they are where the raw tags are allowed to live.
export const isLibraryFile = (rel: string) =>
  rel.startsWith("src/components/ui/") ||
  /^src\/components\/(?:fields\/(?:Field|Select|DatePicker|Popover)|engine\/ui|shell\/copy-button)\.tsx$/.test(rel);

const RAW_TAG = /<(?:table|thead|tbody|tfoot|tr|th|td|button|input|select|textarea)\b/g;
const INLINE_STYLE = /style=\{\{/g;
const HARD_PX = /(?<![\w.-])\d*\.?\d+px\b/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const n = (t: string, re: RegExp) => (t.match(re) ?? []).length;

// Drop comments so a "// 12px" note is not a hit.
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function scanSource(rel: string, text: string): Counts {
  const t = strip(text);
  if (rel.endsWith(".css")) {
    // Token definitions (`--x: 12px;`) are the single source, not a hit.
    const body = t.replace(/--[\w-]+\s*:[^;}]*;?/g, "");
    const families = new Set([...body.matchAll(/\.([a-z][a-z0-9]*)(?:-|\b)[\w-]*/gi)].map((m) => m[1]));
    // U1 in CSS: one count per class family (prefix) defined here; a family is a screen-specific look.
    return { U1: rel === "src/app/globals.css" ? 0 : families.size, T1: 0, C1: n(body, HARD_PX) + n(body, HEX) };
  }
  return { U1: n(t, INLINE_STYLE), T1: n(t, RAW_TAG), C1: n(t, HARD_PX) + n(t, HEX) };
}

// Rule hits by pattern name, for the inventory (which library component replaces which pattern).
export const replacements: Record<string, string> = {
  "<table|thead|tbody|tr|th|td>": "DataTable / Tr / Th / Td",
  "<button>": "Button / TextButton",
  "<input>": "Input / Checkbox / DatePicker / FileInput",
  "<select>": "Select",
  "<textarea>": "Textarea",
  "style={{}}": "a prop of a library component (size, tone, width), or a token class",
  "hard-coded px / #colour": "a token (var(--...)) or a library component prop",
};
export const tagReplacement = (tag: string) =>
  /^(?:table|thead|tbody|tfoot|tr|th|td)$/.test(tag) ? "DataTable / Tr / Th / Td" : tag === "button" ? "Button / TextButton" : tag === "input" ? "Input / Checkbox / DatePicker / FileInput" : tag === "select" ? "Select" : "Textarea";
export const tagsIn = (text: string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const m of strip(text).matchAll(RAW_TAG)) out[m[0].slice(1)] = (out[m[0].slice(1)] ?? 0) + 1;
  return out;
};
