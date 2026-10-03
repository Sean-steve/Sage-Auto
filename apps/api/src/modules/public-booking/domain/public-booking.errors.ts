// ============================================================================
// CAR HIRE OS — PUBLIC BOOKING DOMAIN ERRORS (Sprint 31: DEV-006, DEV-008, SEC-001)
// ============================================================================

export class PublicBookingError extends Error {
  constructor(message: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = "PublicBookingError";
  }
}

export class VehicleNotAvailableForBookingError extends PublicBookingError {
  constructor(vehicleId: string, reason?: string) {
    super(
      `Vehicle '${vehicleId}' is not available for the requested rental period${reason ? `: ${reason}` : "."}`,
      409
    );
    this.name = "VehicleNotAvailableForBookingError";
  }
}

export class VehicleNotPubliclyRentableError extends PublicBookingError {
  constructor(vehicleId: string) {
    super(`Vehicle '${vehicleId}' is not operational or eligible for public direct rental.`, 400);
    this.name = "VehicleNotPubliclyRentableError";
  }
}

export class PublicQuoteExpiredError extends PublicBookingError {
  constructor(quoteId: string) {
    super(`The requested pricing quote '${quoteId}' has expired or is no longer valid.`, 400);
    this.name = "PublicQuoteExpiredError";
  }
}

export class GuestCustomerInvalidError extends PublicBookingError {
  constructor(reason: string) {
    super(`Guest customer information is invalid: ${reason}`, 422);
    this.name = "GuestCustomerInvalidError";
  }
}

export class GuestCustomerBlockedError extends PublicBookingError {
  constructor(reason: string = "Identity is flagged for security review") {
    super(`Online booking cannot proceed: ${reason}. Please contact customer support.`, 403);
    this.name = "GuestCustomerBlockedError";
  }
}

export class PaymentInitiationFailedError extends PublicBookingError {
  constructor(reason: string) {
    super(`Payment handoff initiation failed: ${reason}`, 502);
    this.name = "PaymentInitiationFailedError";
  }
}

export class PublicBookingNotFoundError extends PublicBookingError {
  constructor(bookingId: string) {
    super(`Public booking '${bookingId}' was not found.`, 404);
    this.name = "PublicBookingNotFoundError";
  }
}
