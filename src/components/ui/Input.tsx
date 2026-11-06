"use client";
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

/** The one text input (text, search, password, number, tel, email). Height, padding and focus ring come from `.field input` in globals.css; put it inside a library Field. */
/** What the field holds sets its width (globals.css, `input[data-kind]`): money/number 80-140 px, date 140-180, code/phone 160-240, text 200-320; without `kind` the field fills its place as before. */
export type InputKind = "money" | "number" | "date" | "code" | "phone" | "text";
export const Input = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { type?: "text" | "search" | "password" | "number" | "tel" | "email" | "url"; kind?: InputKind }>(function Input({ type = "text", kind, ...rest }, ref) {
  return <input ref={ref} type={type} data-kind={kind} {...rest} />;
});
/** The one multi-line input. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(props, ref) {
  return <textarea ref={ref} {...props} />;
});
