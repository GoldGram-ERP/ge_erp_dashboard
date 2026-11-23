// The config contract of the screen engine, mirroring docs/nav-preview/app/things/*.js so a page config ports nearly verbatim.
// A page builds its config from `tr` (see lib/t.ts): `export const makeConfig = (tr: Tr): ThingConfig => ({...})`,
// and the page component is `export default function Page() { return <ThingPage make={makeConfig} /> }`.
import type { ConfirmOptions } from "@/components/engine/ui";
import type { ComponentType, ReactNode } from "react";
import type { Tr } from "./t";

export type Row = Record<string, any>;
export type Query = Record<string, string | number | boolean | undefined | null>;

export type FieldType = "text" | "textarea" | "password" | "number" | "money" | "weight" | "select" | "date" | "checkbox" | "code" | "html";
/** [value, label, disabled?] */
/** What a richer option carries (the item picker, issue #34): a second line, a colour, the text a search also matches, and a group to filter by. */
export type OptionMeta = { sub?: string; tone?: "good" | "bad"; search?: string; group?: string };
export type Option = [string | number, string, boolean?, OptionMeta?];
export type LookupSpec = { path: string; value?: string; label?: string | ((row: Row) => string); query?: Query; rowsPath?: string; paged?: boolean; pageOnly?: boolean };   // pageOnly: the list takes `page` but refuses `limit`

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
  step?: number;                       // money: shows -/+ buttons that change the value by this many pounds
  min?: number | string;               // numbers: parsed value; date: ISO day
  max?: number | string;
  pattern?: RegExp;
  patternMessage?: string;
  emptyAs?: unknown;                   // what an empty field reads as (default "")
  section?: string | { ar: string; en: string };
  searchable?: boolean;                // select: search box (default: more than 8 options)
  options?: Option[];                  // select
  optionsFrom?: string | LookupSpec;   // select: LOOKUPS key or a backend list
  picker?: "item";                     // select: the item picker (rows with code, group and brand; brand filter) fed by the items, instead of the plain options
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
export type ActionCtx = { query: Query; rows: Row[]; reload: () => void; toast: (msg: string, o?: { error?: boolean }) => void; confirm: (o: ConfirmOptions) => Promise<boolean> };
export type RowJump = { view: string; filters?: Record<string, string | number | undefined | null> };
export type CreateButton = { form: string; label: string; keys?: string[] };

export type ViewConfig = {
  narrow?: boolean;                    // a short list (a few one-value rows): the table card is as wide as its content, at most 480 px
  id: string; label: string; keys?: string[];
  endpoint?: string;
  exportPath?: string;                 // the report address Excel and Print use when the view loads through `load`
  load?: (query: Query, o: { signal?: AbortSignal }) => Promise<any>;
  query?: Query;                       // fixed params (the ONLY params besides chip/search/filters/paging/sort the list sends)
  rowsPath?: string; totalPath?: string; rowKey?: string;
  search?: { param?: string; placeholder?: string };
  chips?: Chip[];
  filters?: FilterConfig[];
  runLabel?: string;                   // report: nothing loads until this button is pressed
  columns: Column[];
  /** Server sort for a PAGED list whose backend takes `sort`/`dir` (the view has no `sort` param above). Default OFF: omit it, or `on: false`.
   *  To turn a screen on: set `on: true` here. ONLY after its backend is live (it answers 400 invalidFields `sort` for a column it does not know).
   *  `columns` maps a column (its sortKey, else its key) to the backend column id. On, with more than one page: a header click sends sort=<id>&dir=asc|desc and the page goes back to 1;
   *  one page: the browser sorts as before. A column not listed is not sortable on a multi-page list. */
  serverSort?: { on?: boolean; columns: Record<string, string> };
  sort?: { param?: string; orderParam?: string; default?: { key: string; dir: "asc" | "desc" } };
  paging?: PagingConfig | false;
  groupBy?: { key?: string; get?: (row: Row) => string; label: string }[];
  sum?: SumConfig;
  footer?: (rows: Row[], answer: any) => ReactNode;       // the cells of the footer row (<td>...</td>)
  transform?: (rows: Row[], answer: any) => Row[];
  answerExtra?: (answer: any) => string;
  /** false: rows are inert. A function may open the record/a form, or return {view, filters} to jump to another view with those filters (the address changes). `filters` in h are this view's current ones. */
  onRow?: false | ((row: Row, h: { open: (row: Row) => void; openForm: (formId: string, row?: Row | null) => void; filters: Record<string, any> }) => void | RowJump);
  rowClass?: (row: Row) => string;
  actions?: ViewAction[];
  create?: CreateButton[];
  record?: RecordConfig;                // this view's own record sheet (else the page's)
};

export type RecordAction = {
  id: string; label: string; icon?: string; danger?: boolean;
  /** A delete or a cancel: shown only to someone who may delete (an Admin, a Super admin, or a user given "delete-records"). */
  deletes?: boolean;
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
  byId?: boolean;                                         // an edit of a row that custom fetches itself by row.id: the id goes in the address (?new=&open=) so a reload reopens it
  custom?: ComponentType<CustomFormProps>;                // own UI for a big flow (display "page")
  note?: ReactNode;
  /** Runs after the form is on screen; `watch` follows live raw values, `setValue` writes a raw (typed-text) value. */
  onReady?: (api: { watch: (cb: (raw: Record<string, any>, changed?: string) => void) => () => void; setValue: (name: string, raw: unknown) => void; values: Row }, row: Row | null) => void | (() => void);
  /** `open(row)` shows that record's sheet once the form has closed (e.g. open the saved record: `h.open(answer)`). */
  afterSave?: (answer: any, h: { toast: (msg: string) => void; row: Row | null; open: (row: Row) => void }) => void | Promise<void>;
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
