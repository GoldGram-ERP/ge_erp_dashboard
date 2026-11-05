"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";

/** The one button. Sizes and looks live in globals.css (`.btn`); a screen picks a variant, never a class. Default type is "button" so a button never submits a form by accident. */
export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: "primary" | "quiet" | "plain";
  size?: "md" | "sm";
  danger?: boolean;
  /** Extra layout class from the screen (spacing only, never size or colour). */
  className?: string;
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "quiet", size = "md", danger = false, className = "", type = "button", ...rest }, ref) {
  return <button ref={ref} type={type} className={`btn${variant === "plain" ? "" : ` ${variant}`}${size === "sm" ? " sm" : ""}${danger ? " danger" : ""}${className ? ` ${className}` : ""}`} {...rest} />;
});

/** A button that looks like plain text (links inside text, back, sort headers): same hit area rules, no box. */
export const TextButton = forwardRef<HTMLButtonElement, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & { className?: string }>(function TextButton({ className = "", type = "button", ...rest }, ref) {
  return <button ref={ref} type={type} className={`tbtn${className ? ` ${className}` : ""}`} {...rest} />;
});
