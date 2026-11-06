// The ONE place a screen imports components from: `import { ... } from "@/components/ui"`.
// Inheritance only: a variant is a prop on a component here, never a copy in a screen; a component that does not exist yet is added in this
// folder (after checking none exists), never inside src/things or src/app. Edit a component here and the whole app changes.
// The ratchet test (library-ratchet.test.ts) fails when a screen adds a raw control, an inline style or a local component.
export { Checkbox, CheckInput, SwitchInput } from "./Checkbox";
export { Modal } from "./Modal";
export { Button, TextButton, type ButtonProps } from "./Button";
export { Badge, Status, Bubble } from "./Badge";
export { DataTable, Tr, Td, Th, useTableSort } from "./DataTable";
export { Input, Textarea } from "./Input";
export { Disclosure } from "./Disclosure";
export { FileInput } from "./FileInput";
export { Field, fieldId } from "../fields/Field";
export { Select, useLabelFallback } from "../fields/Select";
export { DatePicker } from "../fields/DatePicker";
export { Popover } from "../fields/Popover";
export { CopyButton, copyText } from "../shell/copy-button";
// engine/ui.tsx has its own Icon; shell/icon.tsx has a second, same-signature copy (a duplicate to unify next).
export { Icon, Section, Kv, Ltr, Seg, Sheet, Skeleton, EmptyState, toast, ToastHost, useConfirm, ConfirmDialog } from "../engine/ui";
