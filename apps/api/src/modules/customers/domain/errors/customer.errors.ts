// ============================================================================
// CAR HIRE OS — CUSTOMER DOMAIN ERRORS (DEV-004, DOM-001, DOM-003)
// ============================================================================

export class CustomerNotFoundError extends Error {
  constructor(id: string) {
    super(`Customer not found: ${id}`);
    this.name = "CustomerNotFoundError";
  }
}

export class CustomerBlockedError extends Error {
  constructor(customerNumber: string, reason: string) {
    super(`Customer ${customerNumber} is BLOCKED / BLACKLISTED. Reason: ${reason}`);
    this.name = "CustomerBlockedError";
  }
}

export class CustomerInvalidStatusTransitionError extends Error {
  constructor(from: string, to: string, reason?: string) {
    super(`Invalid customer status transition from ${from} to ${to}.${reason ? ` Reason: ${reason}` : ""}`);
    this.name = "CustomerInvalidStatusTransitionError";
  }
}

export class CustomerInvalidVerificationTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid customer KYC verification transition from ${from} to ${to}.`);
    this.name = "CustomerInvalidVerificationTransitionError";
  }
}

export class CustomerDuplicateIdentityError extends Error {
  constructor(idOrPassportNumber: string) {
    super(`A customer with ID or Passport number '${idOrPassportNumber}' already exists in this workspace.`);
    this.name = "CustomerDuplicateIdentityError";
  }
}
