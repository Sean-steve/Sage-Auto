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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
        bg,
        text,
        border,
        className
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {status.replace(/_/g, " ")}
    </span>
  );
};
