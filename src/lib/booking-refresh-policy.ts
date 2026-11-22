/**
 * UX-H1: Keep ordinary booking registers steady. Only a visible, stale tab
 * may perform a quiet refresh. Pending financial dossiers may poll while open.
 */
export const BOOKING_REGISTER_STALE_MS = 60_000;
export const PENDING_BOOKING_POLL_MS = 30_000;

export type BookingRefreshContext = {
  visibility: "visible" | "hidden";
  lastSuccessfulAt: number;
  now: number;
  inFlight: boolean;
};

export function shouldRefreshBookingRegister(context: BookingRefreshContext): boolean {
  const { visibility, lastSuccessfulAt, now, inFlight } = context;
  return visibility === "visible" && !inFlight &&
    Number.isFinite(now) && Number.isFinite(lastSuccessfulAt) &&
    (lastSuccessfulAt === 0 || now - lastSuccessfulAt >= BOOKING_REGISTER_STALE_MS);
}

export function isPendingFinancialBooking(booking: {
  status?: string | null;
  paymentStatus?: string | null;
  depositStatus?: string | null;
} | null | undefined): boolean {
  if (!booking) return false;
  // Terminal bookings do not need background monitoring.
  if (["COMPLETED", "CANCELLED", "REJECTED", "EXPIRED", "NO_SHOW"].includes(booking.status || "")) return false;
  return booking.status === "AWAITING_PAYMENT" ||
    ["REQUESTED", "PENDING", "PENDING_VERIFICATION", "PARTIALLY_PAID", "PROCESSING"].includes(booking.paymentStatus || "") ||
    ["REQUESTED", "PENDING", "PROCESSING"].includes(booking.depositStatus || "");
}

export function shouldPollPendingBooking(
  booking: Parameters<typeof isPendingFinancialBooking>[0],
  visibility: "visible" | "hidden",
  selectedId: string,
  modalEditing: boolean,
): boolean {
  return visibility === "visible" && !!selectedId && !modalEditing && isPendingFinancialBooking(booking);
}
