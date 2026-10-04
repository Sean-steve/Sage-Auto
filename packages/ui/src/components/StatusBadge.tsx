import React from "react";
import { getStatusColor, cn } from "@carhire/utils";

export interface StatusBadgeProps {
  status: string;
  className?: string;
  dot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className, dot = true }) => {
  const { bg, text, border } = getStatusColor(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.045em]",
        bg,
        text,
        border,
        className
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {status.replace(/_/g, " ")}
    </span>
  );
};