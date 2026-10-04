import React from "react";
import { cn } from "@carhire/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center rounded-[10px] border font-semibold tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px";

  const variants = {
    primary:
      "border-emerald-700 bg-emerald-700 text-white hover:border-emerald-800 hover:bg-emerald-800",
    secondary:
      "border-slate-950 bg-slate-950 text-white hover:bg-slate-800 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white",
    outline:
      "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
    ghost:
      "border-transparent bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
    danger:
      "border-rose-700 bg-rose-700 text-white hover:border-rose-800 hover:bg-rose-800",
  };

  const sizes = {
    sm: "min-h-8 gap-1.5 px-3 py-1.5 text-xs",
    md: "min-h-10 gap-2 px-4 py-2 text-sm",
    lg: "min-h-11 gap-2 px-5 py-2.5 text-sm",
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
};