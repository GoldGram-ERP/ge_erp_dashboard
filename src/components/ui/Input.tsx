"use client";
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

/** The one text input (text, search, password, number, tel, email). Height, padding and focus ring come from `.field input` in globals.css; put it inside a library Field. */
export const Input = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { type?: "text" | "search" | "password" | "number" | "tel" | "email" | "url" }>(function Input({ type = "text", ...rest }, ref) {
  return <input ref={ref} type={type} {...rest} />;
});
/** The one multi-line input. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(props, ref) {
  return <textarea ref={ref} {...props} />;
});
