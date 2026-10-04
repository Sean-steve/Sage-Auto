import React from "react";
import { cn } from "@carhire/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
    const descriptionId = inputId && (error || helperText) ? `${inputId}-description` : undefined;

    return (
      <div className="w-full space-y-1.5">
        {label ? (
          <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            {label}
          </label>
        ) : null}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={descriptionId}
          className={cn(
            "min-h-10 w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-[0_1px_1px_rgba(16,24,40,.02)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-slate-400 focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
            error && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/10",
            className
          )}
          {...props}
        />
        {error ? (
          <p id={descriptionId} className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
        ) : helperText ? (
          <p id={descriptionId} className="text-xs leading-5 text-slate-500 dark:text-slate-400">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";