// ============================================================================
// CAR HIRE OS — CUSTOMERS DOMAIN ERRORS (DEV-004, DOM-001, DOM-003)
// ============================================================================

export class CustomerDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CustomerNotFoundError extends CustomerDomainError {
  constructor(id: string) {
    super(`Customer not found: ${id}`, "CUSTOMER_NOT_FOUND", 404);
  }
}

export class CustomerBlockedError extends CustomerDomainError {
  constructor(customerNumber: string, reason: string) {
    super(
      `Customer ${customerNumber} is BLOCKED / BLACKLISTED. Reason: ${reason}`,
      "CUSTOMER_BLOCKED",
      403
    );
  }
}

export class CustomerInvalidStatusTransitionError extends CustomerDomainError {
  constructor(from: string, to: string, reason?: string) {
    super(
      `Invalid customer status transition from ${from} to ${to}.${reason ? ` Reason: ${reason}` : ""}`,
      "CUSTOMER_STATUS_TRANSITION_INVALID",
      409
    );
  }
}

export class CustomerInvalidVerificationTransitionError extends CustomerDomainError {
  constructor(from: string, to: string) {
    super(
      `Invalid customer KYC verification transition from ${from} to ${to}.`,
      "CUSTOMER_KYC_TRANSITION_INVALID",
      409
    );
  }
}

export class CustomerDuplicateIdentityError extends CustomerDomainError {
  constructor(idOrPassportNumber: string) {
    super(
      `A customer with ID or Passport number '${idOrPassportNumber}' already exists in this workspace.`,
      "CUSTOMER_IDENTITY_DUPLICATE",
      409
    );
  }
}
