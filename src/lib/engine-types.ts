// The config contract of the screen engine, mirroring docs/nav-preview/app/things/*.js so a page config ports nearly verbatim.
// A page builds its config from `tr` (see lib/t.ts): `export const makeConfig = (tr: Tr): ThingConfig => ({...})`,
// and the page component is `export default function Page() { return <ThingPage make={makeConfig} /> }`.
import type { ComponentType, ReactNode } from "react";
import type { Tr } from "./t";

export type Row = Record<string, any>;
export type Query = Record<string, string | number | boolean | undefined | null>;

export type FieldType = "text" | "textarea" | "password" | "number" | "money" | "weight" | "select" | "date" | "checkbox" | "code" | "html";
/** [value, label, disabled?] */
export type Option = [string | number, string, boolean?];
export type LookupSpec = { path: string; value?: string; label?: string | ((row: Row) => string); query?: Query; rowsPath?: string; paged?: boolean };

export type FieldConfig = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  disabled?: boolean;
  wide?: boolean;
  default?: unknown | (() => unknown);
  placeholder?: string;
  help?: string;
  hint?: string;                       // code: shown while no number is previewed
  maxLength?: number;
  autocomplete?: string;
  positive?: boolean;                  // number/money/weight: refuses zero
  min?: number | string;               // numbers: parsed value; date: ISO day
  max?: number | string;
  pattern?: RegExp;
  patternMessage?: string;
  emptyAs?: unknown;                   // what an empty field reads as (default "")
  section?: string | { ar: string; en: string };
  searchable?: boolean;                // select: search box (default: more than 8 options)
  options?: Option[];                  // select
  optionsFrom?: string | LookupSpec;   // select: LOOKUPS key or a backend list
  validate?: (v: any, all: Record<string, any>) => string | null | undefined;
  // code: the next document number preview (GET /document-numbers/next)
  documentType?: string;
  branchField?: string;
  dateField?: string;
  html?: (values: Row) => ReactNode;   // type "html"
};

export type FilterConfig = FieldConfig & { param?: string; toQuery?: (v: any, all: Record<string, any>) => Query | void };

export type Chip = { id: string; label: string; query?: Query; keys?: string[]; superOnly?: boolean };
export type ColumnType = "money" | "weight" | "int" | "date" | "datetime" | "bool" | "status" | "text";
export type Column = {
  key: string; label: string; type?: ColumnType;
  get?: (row: Row) => unknown;
  sortKey?: string; sortable?: boolean;
  render?: (row: Row, value: unknown) => ReactNode;
  className?: string;
  statuses?: Record<string, string | [string, "good" | "warn" | "info" | "off"]>;
};
export type PagingConfig = { param?: string; sizeParam?: string | null; sizes?: number[]; size?: number };
export type SumConfig = { key: string; label: string; type: "money" | "weight" | "int" };
export type ViewAction = { label: string; icon?: string; keys?: string[]; run: (c: ActionCtx) => void | Promise<void> };
export type ActionCtx = { query: Query; rows: Row[]; reload: () => void; toast: (msg: string, o?: { error?: boolean }) => void };
export type CreateButton = { form: string; label: string; keys?: string[] };

export type ViewConfig = {
  id: string; label: string; keys?: string[];
  endpoint?: string;
  load?: (query: Query, o: { signal?: AbortSignal }) => Promise<any>;
  query?: Query;                       // fixed params (the ONLY params besides chip/search/filters/paging/sort the list sends)
  rowsPath?: string; totalPath?: string; rowKey?: string;
  search?: { param?: string; placeholder?: string };
  chips?: Chip[];
  filters?: FilterConfig[];
  runLabel?: string;                   // report: nothing loads until this button is pressed
  columns: Column[];
  sort?: { param?: string; orderParam?: string; default?: { key: string; dir: "asc" | "desc" } };
  paging?: PagingConfig | false;
  groupBy?: { key?: string; get?: (row: Row) => string; label: string }[];
  sum?: SumConfig;
  footer?: (rows: Row[], answer: any) => ReactNode;       // the cells of the footer row (<td>...</td>)
  transform?: (rows: Row[], answer: any) => Row[];
  answerExtra?: (answer: any) => string;
  onRow?: false | ((row: Row, h: { open: (row: Row) => void; openForm: (formId: string, row?: Row | null) => void }) => void);
  rowClass?: (row: Row) => string;
  actions?: ViewAction[];
  create?: CreateButton[];
};

export type RecordAction = {
  id: string; label: string; icon?: string; danger?: boolean;
  when?: (row: Row) => boolean;
  confirm?: { title: string; text?: string };
  run: (row: Row, h: RecordHelpers) => void | Promise<void>;
};
export type RecordHelpers = { reload: () => void; close: () => void; toast: (msg: string, o?: { error?: boolean }) => void; openForm: (formId: string, row?: Row | null) => void };
export type RecordConfig = {
  title: (row: Row) => string;
  endpoint?: (row: Row) => string;     // reload the row fresh before showing it
  enrich?: (full: Row) => Promise<Row>;
  fields?: { label: string; get?: (row: Row) => unknown; key?: string; type?: ColumnType; section?: string | { ar: string; en: string }; statuses?: Column["statuses"]; render?: Column["render"] }[];
  render?: (full: Row, row: Row) => ReactNode;            // use <Section>, <Kv> from components/engine
  actions?: RecordAction[];
  remove?: { path: (row: Row) => string; when?: (row: Row) => boolean; confirm?: (row: Row) => { title: string; text?: string } };
  edit?: string;                       // form id
};

export type CustomFormProps = { row: Row | null; close: () => void; reload: () => void; tr: Tr };
export type FormConfig = {
  title?: string | ((row: Row | null) => string);
  label?: string;
  fields: FieldConfig[];
  load?: (row: Row | null) => Row;     // initial values (typed values: money as piastres, weight as milligrams)
  toPayload?: (values: Row, row: Row | null) => unknown;
  method?: string;
  path: (row: Row | null) => string;
  display?: "sheet" | "page";
  custom?: ComponentType<CustomFormProps>;                // own UI for a big flow (display "page")
  note?: ReactNode;
  /** Runs after the form is on screen; `watch` follows live raw values, `setValue` writes a raw (typed-text) value. */
  onReady?: (api: { watch: (cb: (raw: Record<string, any>, changed?: string) => void) => () => void; setValue: (name: string, raw: unknown) => void; values: Row }, row: Row | null) => void | (() => void);
  afterSave?: (answer: any, h: { toast: (msg: string) => void; row: Row | null }) => void | Promise<void>;
};

export type ThingConfig = {
  id: string;
  title: string;
  unit?: string;
  keys?: string[];
  views: ViewConfig[];
  record?: RecordConfig;
  forms?: Record<string, FormConfig>;
  create?: CreateButton[];
};

export type MakeConfig = (tr: Tr) => ThingConfig;
