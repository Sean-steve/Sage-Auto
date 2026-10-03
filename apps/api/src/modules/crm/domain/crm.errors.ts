// ============================================================================
// CAR HIRE OS — CRM DOMAIN ERRORS (Sprint 33)
// ============================================================================

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead not found with ID: ${leadId}`);
    this.name = "LeadNotFoundError";
  }
}

export class LeadAlreadyConvertedError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} is already converted and cannot be modified.`);
    this.name = "LeadAlreadyConvertedError";
  }
}

export class LeadConversionError extends Error {
  constructor(message: string) {
    super(`Lead conversion failed: ${message}`);
    this.name = "LeadConversionError";
  }
}

export class SalesQuoteNotFoundError extends Error {
  constructor(quoteId: string) {
    super(`Sales Quote not found with ID/Token: ${quoteId}`);
    this.name = "SalesQuoteNotFoundError";
  }
}

export class SalesQuoteExpiredError extends Error {
  constructor(quoteNumber: string, validUntil: string) {
    super(`Sales Quote ${quoteNumber} expired on ${validUntil}`);
    this.name = "SalesQuoteExpiredError";
  }
}

export class SalesQuoteInvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition Sales Quote status from ${from} to ${to}`);
    this.name = "SalesQuoteInvalidStatusTransitionError";
  }
}

export class SalesQuoteAlreadyConvertedError extends Error {
  constructor(quoteNumber: string) {
    super(`Sales Quote ${quoteNumber} is already converted to a booking.`);
    this.name = "SalesQuoteAlreadyConvertedError";
  }
}

export class CrmTaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`CRM Task not found with ID: ${taskId}`);
    this.name = "CrmTaskNotFoundError";
  }
}
