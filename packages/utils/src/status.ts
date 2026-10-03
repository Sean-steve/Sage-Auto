export function getStatusColor(status: string): { bg: string; text: string; border: string } {
  switch (status.toUpperCase()) {
    case "AVAILABLE":
    case "PAID":
    case "COMPLETED":
    case "VERIFIED":
    case "SUCCESS":
      return { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20" };
    case "ON_RENT":
    case "ON_HIRE":
    case "ACTIVE":
    case "IN_PROGRESS":
      return { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/20" };
    case "CONFIRMED":
    case "RETURNED":
      return { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/20" };
    case "RESERVED":
    case "PENDING":
    case "SCHEDULED":
    case "DRAFT":
    case "TRIAL":
      return { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" };
    case "MAINTENANCE":
    case "INSPECTION_PENDING":
    case "UNPAID":
    case "PARTIALLY_PAID":
    case "RENEWAL_DUE":
    case "PAST_DUE":
      return { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/20" };
    case "CANCELLED":
    case "REJECTED":
    case "FAILED":
    case "SUSPENDED":
    case "EXPIRED":
    case "BLOCKED":
      return { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/20" };
    default:
      return { bg: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-400", border: "border-slate-500/20" };
  }
}
