"use client";
import { forwardRef, type InputHTMLAttributes } from "react";

/** The one file input: always hidden, opened from a library button through its ref. A screen never writes <input type="file">. */
export const FileInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "hidden">>(function FileInput(props, ref) {
  return <input ref={ref} type="file" hidden {...props} />;
});
