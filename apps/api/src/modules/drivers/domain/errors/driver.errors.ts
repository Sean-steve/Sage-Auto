// ============================================================================
// CAR HIRE OS — DRIVER DOMAIN ERRORS (DEV-004, DOM-001, DOM-003)
// ============================================================================

export class DriverNotFoundError extends Error {
  constructor(id: string) {
    super(`Driver not found: ${id}`);
    this.name = "DriverNotFoundError";
  }
}

export class DriverInvalidStatusTransitionError extends Error {
  constructor(from: string, to: string, reason?: string) {
    super(`Invalid driver status transition from ${from} to ${to}.${reason ? ` Reason: ${reason}` : ""}`);
    this.name = "DriverInvalidStatusTransitionError";
  }
}

export class DriverLicenseExpiredError extends Error {
  constructor(driverNumber: string, expiryDate: string) {
    super(`Driver ${driverNumber} license expired on ${expiryDate}.`);
    this.name = "DriverLicenseExpiredError";
  }
}

export class DriverDuplicateLicenseError extends Error {
  constructor(licenseNumber: string) {
    super(`A driver with license number '${licenseNumber}' already exists in this workspace.`);
    this.name = "DriverDuplicateLicenseError";
  }
}
