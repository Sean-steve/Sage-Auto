// ============================================================================
// CAR HIRE OS — CORPORATE ACCOUNT DOMAIN ERRORS (DEV-004, DOM-001, DOM-003)
// ============================================================================

export class CorporateAccountNotFoundError extends Error {
  constructor(id: string) {
    super(`Corporate account not found: ${id}`);
    this.name = "CorporateAccountNotFoundError";
  }
}

export class CorporateCreditLimitExceededError extends Error {
  constructor(accountNumber: string, requestedAmount: number, availableCredit: number) {
    super(`Corporate account ${accountNumber} credit limit exceeded. Requested: ${requestedAmount}, Available: ${availableCredit}`);
    this.name = "CorporateCreditLimitExceededError";
  }
}

export class CorporateDuplicateRegistrationError extends Error {
  constructor(registrationNumber: string) {
    super(`A corporate account with registration number '${registrationNumber}' already exists in this workspace.`);
    this.name = "CorporateDuplicateRegistrationError";
  }
}
