import React from "react";
import { cn } from "@carhire/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  density?: "comfortable" | "compact";
}

export const Card: React.FC<CardProps> = ({ children, className, hover = false, density = "comfortable", ...props }) => {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04)] dark:border-slate-800 dark:bg-slate-900",
        density === "compact" ? "p-4" : "p-5",
        hover && "transition-[border-color,background-color] hover:border-slate-300 hover:bg-slate-50/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/60",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => {
  return <div className={cn("flex items-start justify-between gap-4 pb-4", className)} {...props}>{children}</div>;
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...props }) => {
  return <h3 className={cn("text-[15px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-white", className)} {...props}>{children}</h3>;
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className, ...props }) => {
  return <p className={cn("mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400", className)} {...props}>{children}</p>;
};