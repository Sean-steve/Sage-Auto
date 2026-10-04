// ============================================================================
// CAR HIRE OS — DATABASE ERROR ABSTRACTIONS (DEV-009, SEC-003)
// Prevents raw PostgreSQL/Prisma exceptions from leaking into domain/API layers
// ============================================================================

export abstract class DatabaseError extends Error {
  public abstract readonly code: string;
  public readonly isOperational: boolean = true;
  public readonly statusCode: number = 500;

  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UniqueConstraintViolationError extends DatabaseError {
  public readonly code = "UNIQUE_CONSTRAINT_VIOLATION";
  public readonly statusCode = 409;
  constructor(field: string, value?: string, cause?: unknown) {
    super(`A record with the specified ${field}${value ? ` ('${value}')` : ""} already exists.`, cause, { field });
    this.name = "UniqueConstraintViolationError";
  }
}

export class ForeignKeyConstraintViolationError extends DatabaseError {
  public readonly code = "FOREIGN_KEY_CONSTRAINT_VIOLATION";
  constructor(relation: string, cause?: unknown) {
    super(`Referenced ${relation} does not exist or cannot be modified due to dependent records.`, cause, { relation });
    this.name = "ForeignKeyConstraintViolationError";
  }
}

export class ConcurrencyConflictError extends DatabaseError {
  public readonly code = "CONCURRENCY_CONFLICT";
  constructor(message: string = "The record was modified or locked by another concurrent transaction.", cause?: unknown) {
    super(message, cause);
    this.name = "ConcurrencyConflictError";
  }
}

export class CrossTenantViolationError extends DatabaseError {
  public readonly code = "CROSS_TENANT_VIOLATION";
  constructor(expectedTenant: string, actualTenant: string, cause?: unknown) {
    super(
      `Cross-tenant access violation: record belongs to tenant '${expectedTenant}', but request specified '${actualTenant}'.`,
      cause,
      { expectedTenant, actualTenant }
    );
    this.name = "CrossTenantViolationError";
  }
}

export class DatabaseUnavailableError extends DatabaseError {
  public readonly code = "DATABASE_UNAVAILABLE";
  constructor(message: string = "Database service is temporarily unreachable.", cause?: unknown) {
    super(message, cause);
    this.name = "DatabaseUnavailableError";
  }
}

export class TenantContextMissingError extends DatabaseError {
  public readonly code = "TENANT_CONTEXT_MISSING";
  constructor(message: string = "Operation requires an active tenant context but none was provided.", cause?: unknown) {
    super(message, cause);
    this.name = "TenantContextMissingError";
  }
}

export class RecordNotFoundError extends DatabaseError {
  public readonly code = "RECORD_NOT_FOUND";
  public readonly statusCode = 404;
  constructor(entityName: string, id: string, cause?: unknown) {
    super(`${entityName} was not found.`, cause, { entityName, id });
    this.name = "RecordNotFoundError";
  }
}

export class InternalDatabaseError extends DatabaseError {
  public readonly code = "INTERNAL_DATABASE_ERROR";
  constructor(message: string = "Internal database error occurred.", cause?: unknown) {
    super(message, cause);
  }
}

// ============================================================================
// SPRINT 12: AVAILABILITY ENGINE & CONCURRENCY-SAFE ALLOCATION ERRORS
// ============================================================================

export class AvailabilityConflictError extends DatabaseError {
  public readonly code = "AVAILABILITY_CONFLICT";
  public readonly statusCode = 409;
  public readonly vehicleId?: string;
  public readonly conflictingInterval?: { startsAt: string; endsAt: string };

  constructor(
    message: string = "Vehicle is not available for the requested time range due to an existing allocation or block.",
    vehicleId?: string,
    conflictingInterval?: { startsAt: string; endsAt: string },
    cause?: unknown
  ) {
    super(message, cause);
    this.vehicleId = vehicleId;
    this.conflictingInterval = conflictingInterval;
  }
}

export class DatabaseExclusionViolationError extends DatabaseError {
  public readonly code = "EXCLUSION_CONSTRAINT_VIOLATION";
  public readonly constraintName?: string;

  constructor(
    constraintName: string = "uq_no_overlapping_vehicle_allocations",
    message: string = "PostgreSQL GiST exclusion constraint violation: overlapping exclusive allocation detected.",
    cause?: unknown
  ) {
    super(message, cause);
    this.constraintName = constraintName;
  }
}

export class InvalidAvailabilityIntervalError extends DatabaseError {
  public readonly code = "INVALID_AVAILABILITY_INTERVAL";
  public readonly statusCode = 400;
  constructor(message: string = "Requested availability interval is invalid (endsAt must be strictly greater than startsAt).", cause?: unknown) {
    super(message, cause);
  }
}

export class VehicleNotOperationalError extends DatabaseError {
  public readonly code = "VEHICLE_NOT_OPERATIONAL";
  public readonly statusCode = 409;
  constructor(vehicleId: string, status: string, cause?: unknown) {
    super(`This vehicle is currently ${status.replaceAll("_"," ").toLowerCase()} and cannot be reserved.`, cause, { vehicleId, status });
  }
}

export class AvailabilityHoldNotFoundError extends DatabaseError {
  public readonly code = "AVAILABILITY_HOLD_NOT_FOUND";
  constructor(holdTokenOrId: string, cause?: unknown) {
    super(`Availability hold '${holdTokenOrId}' was not found.`, cause);
  }
}

export class AvailabilityHoldExpiredError extends DatabaseError {
  public readonly code = "AVAILABILITY_HOLD_EXPIRED";
  public readonly statusCode = 409;
  constructor(holdTokenOrId: string, expiresAt: string, cause?: unknown) {
    super(`Availability hold '${holdTokenOrId}' has expired at ${expiresAt}.`, cause);
  }
}

export class VehicleBlockNotFoundError extends DatabaseError {
  public readonly code = "VEHICLE_BLOCK_NOT_FOUND";
  constructor(blockId: string, cause?: unknown) {
    super(`Vehicle block '${blockId}' was not found.`, cause);
  }
}

export class VehicleNotFoundError extends DatabaseError {
  public readonly code = "VEHICLE_NOT_FOUND";
  constructor(vehicleId: string, cause?: unknown) {
    super(`Vehicle '${vehicleId}' was not found.`, cause, { vehicleId });
    this.name = "VehicleNotFoundError";
  }
}

export class CrossTenantAvailabilityAccessError extends DatabaseError {
  public readonly code = "CROSS_TENANT_AVAILABILITY_ACCESS";
  constructor(message: string = "Cross-tenant allocation or access is strictly forbidden.", cause?: unknown) {
    super(message, cause);
  }
}

export class SubscriptionSuspendedError extends DatabaseError {
  public readonly code = "SUBSCRIPTION_SUSPENDED";
  constructor(tenantId: string, cause?: unknown) {
    super(`Tenant subscription is SUSPENDED for tenant '${tenantId}'. Write operations are rejected.`, cause, { tenantId });
    this.name = "SubscriptionSuspendedError";
  }
}

// ============================================================================
// SPRINT 13: BOOKING & RESERVATION LIFECYCLE ERRORS
// ============================================================================

export class BookingNotFoundError extends DatabaseError {
  public readonly code = "BOOKING_NOT_FOUND";
  constructor(bookingId: string, cause?: unknown) {
    super(`Booking '${bookingId}' was not found.`, cause, { bookingId });
    this.name = "BookingNotFoundError";
  }
}

export class BookingInvalidStateTransitionError extends DatabaseError {
  public readonly code = "INVALID_STATE_TRANSITION";
  constructor(currentStatus: string, targetStatus: string, reason?: string, cause?: unknown) {
    super(
      `Cannot transition booking from state '${currentStatus}' to '${targetStatus}'.${reason ? ` Reason: ${reason}` : ""}`,
      cause,
      { currentStatus, targetStatus, reason }
    );
    this.name = "BookingInvalidStateTransitionError";
  }
}

export class BookingAvailabilityConflictError extends DatabaseError {
  public readonly code = "BOOKING_AVAILABILITY_CONFLICT";
  constructor(message: string, public readonly vehicleId?: string, cause?: unknown) {
    super(message, cause, { vehicleId });
    this.name = "BookingAvailabilityConflictError";
  }
}

export class CustomerNotEligibleError extends DatabaseError {
  public readonly code = "CUSTOMER_NOT_ELIGIBLE";
  constructor(customerId: string, reason: string, cause?: unknown) {
    super(`Customer '${customerId}' is not eligible for booking: ${reason}`, cause, { customerId, reason });
    this.name = "CustomerNotEligibleError";
  }
}

export class DriverNotEligibleError extends DatabaseError {
  public readonly code = "DRIVER_NOT_ELIGIBLE";
  constructor(driverId: string, reason: string, cause?: unknown) {
    super(`Driver '${driverId}' is not eligible for booking: ${reason}`, cause, { driverId, reason });
    this.name = "DriverNotEligibleError";
  }
}

export class BookingPricingSnapshotRequiredError extends DatabaseError {
  public readonly code = "BOOKING_PRICING_SNAPSHOT_REQUIRED";
  constructor(message: string = "A frozen pricing snapshot is required before this operation.", cause?: unknown) {
    super(message, cause);
    this.name = "BookingPricingSnapshotRequiredError";
  }
}

export class BookingImmutableError extends DatabaseError {
  public readonly code = "BOOKING_IMMUTABLE";
  constructor(bookingId: string, status: string, cause?: unknown) {
    super(`Booking '${bookingId}' is in immutable state '${status}' and cannot be modified directly.`, cause, { bookingId, status });
    this.name = "BookingImmutableError";
  }
}

export class BookingConcurrencyConflictError extends ConcurrencyConflictError {
  constructor(message: string = "Optimistic locking conflict on booking entity.", cause?: unknown) {
    super(message, cause);
    this.name = "BookingConcurrencyConflictError";
  }
}

export class InvalidBookingStateTransitionError extends BookingInvalidStateTransitionError {
  constructor(currentStatus: string, targetStatus: string, reason?: string, cause?: unknown) {
    super(currentStatus, targetStatus, reason, cause);
    this.name = "InvalidBookingStateTransitionError";
  }
}

// ============================================================================
// SPRINT 14: CONTRACTS, HANDOVER & RENTAL START ERRORS
// ============================================================================

export class ContractNotFoundError extends DatabaseError {
  public readonly code = "CONTRACT_NOT_FOUND";
  constructor(contractId: string, cause?: unknown) {
    super(`Rental Contract '${contractId}' was not found.`, cause, { contractId });
    this.name = "ContractNotFoundError";
  }
}

export class ContractImmutableError extends DatabaseError {
  public readonly code = "CONTRACT_IMMUTABLE";
  constructor(contractId: string, status: string, cause?: unknown) {
    super(`Contract '${contractId}' is in signed/active state '${status}' and cannot have material terms modified directly. Create a new contract version instead.`, cause, { contractId, status });
    this.name = "ContractImmutableError";
  }
}

export class ContractInvalidStateTransitionError extends DatabaseError {
  public readonly code = "CONTRACT_INVALID_STATE_TRANSITION";
  constructor(currentStatus: string, targetStatus: string, reason?: string, cause?: unknown) {
    super(
      `Cannot transition contract from state '${currentStatus}' to '${targetStatus}'.${reason ? ` Reason: ${reason}` : ""}`,
      cause,
      { currentStatus, targetStatus, reason }
    );
    this.name = "ContractInvalidStateTransitionError";
  }
}

export class ContractNotSignedError extends DatabaseError {
  public readonly code = "CONTRACT_NOT_SIGNED";
  constructor(contractId: string, cause?: unknown) {
    super(`Contract '${contractId}' has not been signed by required parties.`, cause, { contractId });
    this.name = "ContractNotSignedError";
  }
}

export class HandoverNotFoundError extends DatabaseError {
  public readonly code = "HANDOVER_NOT_FOUND";
  constructor(handoverId: string, cause?: unknown) {
    super(`Vehicle Handover '${handoverId}' was not found.`, cause, { handoverId });
    this.name = "HandoverNotFoundError";
  }
}

export class HandoverInvalidStateTransitionError extends DatabaseError {
  public readonly code = "HANDOVER_INVALID_STATE_TRANSITION";
  constructor(currentStatus: string, targetStatus: string, reason?: string, cause?: unknown) {
    super(
      `Cannot transition handover from state '${currentStatus}' to '${targetStatus}'.${reason ? ` Reason: ${reason}` : ""}`,
      cause,
      { currentStatus, targetStatus, reason }
    );
    this.name = "HandoverInvalidStateTransitionError";
  }
}

export class HandoverCheckpointsIncompleteError extends DatabaseError {
  public readonly code = "HANDOVER_CHECKPOINTS_INCOMPLETE";
  constructor(missingCheckpoints: string[], cause?: unknown) {
    super(`Cannot complete vehicle handover. Missing checkpoints: ${missingCheckpoints.join(", ")}`, cause, { missingCheckpoints });
    this.name = "HandoverCheckpointsIncompleteError";
  }
}

export class RentalNotFoundError extends DatabaseError {
  public readonly code = "RENTAL_NOT_FOUND";
  constructor(rentalId: string, cause?: unknown) {
    super(`Rental '${rentalId}' was not found.`, cause, { rentalId });
    this.name = "RentalNotFoundError";
  }
}

export class RentalAlreadyStartedError extends DatabaseError {
  public readonly code = "RENTAL_ALREADY_STARTED";
  constructor(rentalId: string, cause?: unknown) {
    super(`Rental '${rentalId}' is already started and cannot be initiated again.`, cause, { rentalId });
    this.name = "RentalAlreadyStartedError";
  }
}

export class RentalInvalidStateTransitionError extends DatabaseError {
  public readonly code = "RENTAL_INVALID_STATE_TRANSITION";
  constructor(currentStatus: string, targetStatus: string, reason?: string, cause?: unknown) {
    super(
      `Cannot transition rental from state '${currentStatus}' to '${targetStatus}'.${reason ? ` Reason: ${reason}` : ""}`,
      cause,
      { currentStatus, targetStatus, reason }
    );
    this.name = "RentalInvalidStateTransitionError";
  }
}

export class RentalNotEligibleToStartError extends DatabaseError {
  public readonly code = "RENTAL_NOT_ELIGIBLE_TO_START";
  constructor(reasons: string[], cause?: unknown) {
    super(`Rental dispatch rejected due to readiness blockers: ${reasons.join("; ")}`, cause, { reasons });
    this.name = "RentalNotEligibleToStartError";
  }
}

export class RentalAlreadyCompletedError extends DatabaseError {
  public readonly code = "RENTAL_ALREADY_COMPLETED";
  constructor(rentalId: string, cause?: unknown) {
    super(`Rental '${rentalId}' is already completed and cannot be modified.`, cause, { rentalId });
    this.name = "RentalAlreadyCompletedError";
  }
}

export class RentalNotActiveError extends DatabaseError {
  public readonly code = "RENTAL_NOT_ACTIVE";
  constructor(rentalId: string, currentState: string, cause?: unknown) {
    super(`Operation requires rental '${rentalId}' to be ACTIVE_ON_ROAD, but current state is '${currentState}'.`, cause, { rentalId, currentState });
    this.name = "RentalNotActiveError";
  }
}

export class RentalExtensionNotFoundError extends DatabaseError {
  public readonly code = "RENTAL_EXTENSION_NOT_FOUND";
  constructor(extensionId: string, cause?: unknown) {
    super(`Rental extension '${extensionId}' was not found.`, cause, { extensionId });
    this.name = "RentalExtensionNotFoundError";
  }
}

export class RentalExtensionInvalidStatusError extends DatabaseError {
  public readonly code = "RENTAL_EXTENSION_INVALID_STATUS";
  constructor(extensionId: string, currentStatus: string, expectedStatus: string, cause?: unknown) {
    super(`Rental extension '${extensionId}' is in status '${currentStatus}', expected '${expectedStatus}'.`, cause, { extensionId, currentStatus, expectedStatus });
    this.name = "RentalExtensionInvalidStatusError";
  }
}

export class RentalFinalCalculationImmutableError extends DatabaseError {
  public readonly code = "RENTAL_FINAL_CALCULATION_IMMUTABLE";
  constructor(rentalId: string, cause?: unknown) {
    super(`Final calculation for rental '${rentalId}' is sealed and immutable.`, cause, { rentalId });
    this.name = "RentalFinalCalculationImmutableError";
  }
}

export class RentalVehicleNotReceivedError extends DatabaseError {
  public readonly code = "RENTAL_VEHICLE_NOT_RECEIVED";
  constructor(rentalId: string, cause?: unknown) {
    super(`Cannot proceed: vehicle has not yet been checked-in / received for rental '${rentalId}'.`, cause, { rentalId });
    this.name = "RentalVehicleNotReceivedError";
  }
}

export class RentalDepositNotSettledError extends DatabaseError {
  public readonly code = "RENTAL_DEPOSIT_NOT_SETTLED";
  constructor(rentalId: string, details?: string, cause?: unknown) {
    super(`Cannot complete rental '${rentalId}': deposit reconciliation is pending.${details ? ` Details: ${details}` : ""}`, cause, { rentalId, details });
    this.name = "RentalDepositNotSettledError";
  }
}

// ============================================================================
// SPRINT 15: INSPECTIONS, DAMAGE & EVIDENCE ERRORS (DOM-003 §21-22)
// ============================================================================

export class InspectionNotFoundError extends DatabaseError {
  public readonly code = "INSPECTION_NOT_FOUND";
  constructor(id: string, cause?: unknown) {
    super(`Vehicle inspection with id '${id}' was not found.`, cause, { id });
    this.name = "InspectionNotFoundError";
  }
}

export class DamageCaseNotFoundError extends DatabaseError {
  public readonly code = "DAMAGE_CASE_NOT_FOUND";
  constructor(id: string, cause?: unknown) {
    super(`Damage case with id '${id}' was not found.`, cause, { id });
    this.name = "DamageCaseNotFoundError";
  }
}

export class InspectionTemplateNotFoundError extends DatabaseError {
  public readonly code = "INSPECTION_TEMPLATE_NOT_FOUND";
  constructor(idOrCode: string, cause?: unknown) {
    super(`Inspection checklist template '${idOrCode}' was not found.`, cause, { idOrCode });
    this.name = "InspectionTemplateNotFoundError";
  }
}

export class InspectionInvalidStateTransitionError extends DatabaseError {
  public readonly code = "INSPECTION_INVALID_STATE_TRANSITION";
  constructor(fromStatus: string, toStatus: string, cause?: unknown) {
    super(`Cannot transition inspection from status '${fromStatus}' to '${toStatus}'.`, cause, {
      fromStatus,
      toStatus,
    });
    this.name = "InspectionInvalidStateTransitionError";
  }
}

export class InspectionAlreadyCompletedError extends DatabaseError {
  public readonly code = "INSPECTION_ALREADY_COMPLETED";
  constructor(inspectionId: string, cause?: unknown) {
    super(`Inspection '${inspectionId}' is already sealed and completed. Immutable records cannot be modified directly without an explicit correction log.`, cause, { inspectionId });
    this.name = "InspectionAlreadyCompletedError";
  }
}

export class InspectionVoidedError extends DatabaseError {
  public readonly code = "INSPECTION_VOIDED";
  constructor(inspectionId: string, cause?: unknown) {
    super(`Inspection '${inspectionId}' has been voided and is permanently inactive.`, cause, { inspectionId });
    this.name = "InspectionVoidedError";
  }
}

export class InspectionOdometerRegressionError extends DatabaseError {
  public readonly code = "INSPECTION_ODOMETER_REGRESSION";
  constructor(newOdometer: number, previousOdometer: number, cause?: unknown) {
    super(
      `Recorded inspection odometer (${newOdometer} km) cannot be lower than the previous odometer (${previousOdometer} km).`,
      cause,
      { newOdometer, previousOdometer }
    );
    this.name = "InspectionOdometerRegressionError";
  }
}

export class InspectionInvalidFuelLevelError extends DatabaseError {
  public readonly code = "INSPECTION_INVALID_FUEL_LEVEL";
  constructor(fuelLevel: number, cause?: unknown) {
    super(
      `Inspection fuel level (${fuelLevel}%) must be an integer between 0 and 100.`,
      cause,
      { fuelLevel }
    );
    this.name = "InspectionInvalidFuelLevelError";
  }
}

export class InspectionMissingRequiredResponsesError extends DatabaseError {
  public readonly code = "INSPECTION_MISSING_REQUIRED_RESPONSES";
  constructor(missingItemCodes: string[], cause?: unknown) {
    super(
      `Inspection cannot be completed until all mandatory checklist items are answered. Missing items: ${missingItemCodes.join(", ")}`,
      cause,
      { missingItemCodes }
    );
    this.name = "InspectionMissingRequiredResponsesError";
  }
}

export class InspectionMissingRequiredEvidenceError extends DatabaseError {
  public readonly code = "INSPECTION_MISSING_REQUIRED_EVIDENCE";
  constructor(itemCode: string, cause?: unknown) {
    super(
      `Checklist item '${itemCode}' requires at least one photographic or document evidence attachment.`,
      cause,
      { itemCode }
    );
    this.name = "InspectionMissingRequiredEvidenceError";
  }
}

// SPRINT 17: MAINTENANCE MANAGEMENT DOMAIN ERRORS
export class MaintenanceNotFoundError extends DatabaseError {
  public readonly code = "MAINTENANCE_NOT_FOUND";
  constructor(maintenanceId: string, cause?: unknown) {
    super(`Maintenance work order '${maintenanceId}' not found.`, cause, { maintenanceId });
    this.name = "MaintenanceNotFoundError";
  }
}

export class MaintenanceInvalidStateTransitionError extends DatabaseError {
  public readonly code = "MAINTENANCE_INVALID_TRANSITION";
  constructor(fromStatus: string, toStatus: string, reason?: string, cause?: unknown) {
    super(
      `Illegal maintenance state transition from '${fromStatus}' to '${toStatus}'.${reason ? ` Reason: ${reason}` : ""}`,
      cause,
      { fromStatus, toStatus, reason }
    );
    this.name = "MaintenanceInvalidStateTransitionError";
  }
}

export class MaintenanceAlreadyCompletedError extends DatabaseError {
  public readonly code = "MAINTENANCE_ALREADY_COMPLETED";
  constructor(maintenanceId: string, currentStatus: string, cause?: unknown) {
    super(
      `Maintenance work order '${maintenanceId}' is already in terminal/completed status '${currentStatus}'.`,
      cause,
      { maintenanceId, currentStatus }
    );
    this.name = "MaintenanceAlreadyCompletedError";
  }
}

export class MaintenanceNotReadyForVerificationError extends DatabaseError {
  public readonly code = "MAINTENANCE_NOT_READY_FOR_VERIFICATION";
  constructor(reason: string, details?: Record<string, unknown>, cause?: unknown) {
    super(`Maintenance work order is not ready for verification: ${reason}`, cause, details);
    this.name = "MaintenanceNotReadyForVerificationError";
  }
}

export class MaintenanceRequiredTaskIncompleteError extends DatabaseError {
  public readonly code = "MAINTENANCE_REQUIRED_TASK_INCOMPLETE";
  constructor(incompleteTasks: string[], cause?: unknown) {
    super(
      `Cannot complete maintenance work order while mandatory tasks remain incomplete: ${incompleteTasks.join(", ")}`,
      cause,
      { incompleteTasks }
    );
    this.name = "MaintenanceRequiredTaskIncompleteError";
  }
}

export class MaintenanceScheduleConflictError extends DatabaseError {
  public readonly code = "MAINTENANCE_SCHEDULE_CONFLICT";
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "MaintenanceScheduleConflictError";
  }
}

export class MaintenanceOdometerInvalidError extends DatabaseError {
  public readonly code = "MAINTENANCE_ODOMETER_INVALID";
  constructor(message: string, currentOdometer?: number, suppliedOdometer?: number, cause?: unknown) {
    super(message, cause, { currentOdometer, suppliedOdometer });
    this.name = "MaintenanceOdometerInvalidError";
  }
}

export class MaintenanceCostInvalidError extends DatabaseError {
  public readonly code = "MAINTENANCE_COST_INVALID";
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "MaintenanceCostInvalidError";
  }
}

export class MaintenanceProviderNotFoundError extends DatabaseError {
  public readonly code = "MAINTENANCE_PROVIDER_NOT_FOUND";
  constructor(providerId: string, cause?: unknown) {
    super(`Service provider / garage '${providerId}' not found or inactive.`, cause, { providerId });
    this.name = "MaintenanceProviderNotFoundError";
  }
}

export class MaintenanceAvailabilityConflictError extends DatabaseError {
  public readonly code = "MAINTENANCE_AVAILABILITY_CONFLICT";
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "MaintenanceAvailabilityConflictError";
  }
}

export class MaintenanceScheduleNotFoundError extends DatabaseError {
  public readonly code = "MAINTENANCE_SCHEDULE_NOT_FOUND";
  constructor(scheduleId: string, cause?: unknown) {
    super(`Maintenance schedule '${scheduleId}' not found.`, cause, { scheduleId });
    this.name = "MaintenanceScheduleNotFoundError";
  }
}

export class MaintenanceConcurrencyConflictError extends DatabaseError {
  public readonly code = "MAINTENANCE_CONCURRENCY_CONFLICT";
  constructor(maintenanceId: string, expectedVersion: number, actualVersion: number, cause?: unknown) {
    super(
      `Concurrency conflict on maintenance work order '${maintenanceId}'. Expected version ${expectedVersion}, but found ${actualVersion}.`,
      cause,
      { maintenanceId, expectedVersion, actualVersion }
    );
    this.name = "MaintenanceConcurrencyConflictError";
  }
}

// ----------------------------------------------------------------------------
// SPRINT 19: OPERATIONAL FINANCE ERRORS
// ----------------------------------------------------------------------------

export class OperationalInvoiceNotFoundError extends DatabaseError {
  public readonly code = "OPERATIONAL_INVOICE_NOT_FOUND";
  constructor(invoiceId: string, cause?: unknown) {
    super(`Operational invoice '${invoiceId}' was not found.`, cause, { invoiceId });
    this.name = "OperationalInvoiceNotFoundError";
  }
}

export class OperationalInvoiceInvalidStateTransitionError extends DatabaseError {
  public readonly code = "OPERATIONAL_INVOICE_INVALID_STATE_TRANSITION";
  constructor(fromStatus: string, toStatus: string, reason?: string, cause?: unknown) {
    super(
      `Cannot transition operational invoice from status '${fromStatus}' to '${toStatus}'${reason ? `: ${reason}` : "."}`,
      cause,
      { fromStatus, toStatus, reason }
    );
    this.name = "OperationalInvoiceInvalidStateTransitionError";
  }
}

export class OperationalInvoiceImmutableError extends DatabaseError {
  public readonly code = "OPERATIONAL_INVOICE_IMMUTABLE";
  constructor(invoiceId: string, status: string, cause?: unknown) {
    super(
      `Operational invoice '${invoiceId}' is in status '${status}' and its financial source facts are immutable. Modifications must be made via Credit Notes or formal reversals.`,
      cause,
      { invoiceId, status }
    );
    this.name = "OperationalInvoiceImmutableError";
  }
}

export class CreditNoteNotFoundError extends DatabaseError {
  public readonly code = "CREDIT_NOTE_NOT_FOUND";
  constructor(creditNoteId: string, cause?: unknown) {
    super(`Credit note '${creditNoteId}' was not found.`, cause, { creditNoteId });
    this.name = "CreditNoteNotFoundError";
  }
}

export class CreditNoteInvalidStateTransitionError extends DatabaseError {
  public readonly code = "CREDIT_NOTE_INVALID_STATE_TRANSITION";
  constructor(fromStatus: string, toStatus: string, reason?: string, cause?: unknown) {
    super(
      `Cannot transition credit note from status '${fromStatus}' to '${toStatus}'${reason ? `: ${reason}` : "."}`,
      cause,
      { fromStatus, toStatus, reason }
    );
    this.name = "CreditNoteInvalidStateTransitionError";
  }
}

export class CreditNoteExceedsInvoiceTotalError extends DatabaseError {
  public readonly code = "CREDIT_NOTE_EXCEEDS_INVOICE_TOTAL";
  constructor(creditAmount: string, remainingUncredited: string, invoiceId: string, cause?: unknown) {
    super(
      `Credit note amount (${creditAmount}) exceeds the remaining creditable balance (${remainingUncredited}) on invoice '${invoiceId}'.`,
      cause,
      { creditAmount, remainingUncredited, invoiceId }
    );
    this.name = "CreditNoteExceedsInvoiceTotalError";
  }
}

export class CreditNoteInvoiceNotIssuedError extends DatabaseError {
  public readonly code = "CREDIT_NOTE_INVOICE_NOT_ISSUED";
  constructor(invoiceId: string, status: string, cause?: unknown) {
    super(
      `Credit notes can only be issued against invoices that have been ISSUED or PAID (invoice '${invoiceId}' is '${status}').`,
      cause,
      { invoiceId, status }
    );
    this.name = "CreditNoteInvoiceNotIssuedError";
  }
}

export class OperationalExpenseNotFoundError extends DatabaseError {
  public readonly code = "OPERATIONAL_EXPENSE_NOT_FOUND";
  constructor(expenseId: string, cause?: unknown) {
    super(`Operational expense '${expenseId}' was not found.`, cause, { expenseId });
    this.name = "OperationalExpenseNotFoundError";
  }
}

export class OperationalExpenseInvalidStateTransitionError extends DatabaseError {
  public readonly code = "OPERATIONAL_EXPENSE_INVALID_STATE_TRANSITION";
  constructor(fromStatus: string, toStatus: string, reason?: string, cause?: unknown) {
    super(
      `Cannot transition operational expense from status '${fromStatus}' to '${toStatus}'${reason ? `: ${reason}` : "."}`,
      cause,
      { fromStatus, toStatus, reason }
    );
    this.name = "OperationalExpenseInvalidStateTransitionError";
  }
}

export class OperationalExpenseFourEyesApprovalViolationError extends DatabaseError {
  public readonly code = "OPERATIONAL_EXPENSE_FOUR_EYES_APPROVAL_VIOLATION";
  constructor(expenseId: string, userId: string, cause?: unknown) {
    super(
      `Four-eyes control violation: User '${userId}' created expense '${expenseId}' and cannot approve their own expense.`,
      cause,
      { expenseId, userId }
    );
    this.name = "OperationalExpenseFourEyesApprovalViolationError";
  }
}

export class DepositPositionNotFoundError extends DatabaseError {
  public readonly code = "DEPOSIT_POSITION_NOT_FOUND";
  constructor(identifier: string, cause?: unknown) {
    super(`Deposit position for '${identifier}' was not found.`, cause, { identifier });
    this.name = "DepositPositionNotFoundError";
  }
}

export class DepositPositionExceededError extends DatabaseError {
  public readonly code = "DEPOSIT_POSITION_EXCEEDED";
  constructor(requested: string, available: string, cause?: unknown) {
    super(
      `Requested deposit deduction or refund (${requested}) exceeds available held deposit balance (${available}).`,
      cause,
      { requested, available }
    );
    this.name = "DepositPositionExceededError";
  }
}

export class RefundObligationNotFoundError extends DatabaseError {
  public readonly code = "REFUND_OBLIGATION_NOT_FOUND";
  constructor(refundId: string, cause?: unknown) {
    super(`Refund obligation '${refundId}' was not found.`, cause, { refundId });
    this.name = "RefundObligationNotFoundError";
  }
}

export class FinanceCurrencyMismatchError extends DatabaseError {
  public readonly code = "FINANCE_CURRENCY_MISMATCH";
  constructor(expected: string, actual: string, cause?: unknown) {
    super(
      `Currency mismatch: Expected currency '${expected}', but got '${actual}'.`,
      cause,
      { expected, actual }
    );
    this.name = "FinanceCurrencyMismatchError";
  }
}

export class FinanceConcurrencyConflictError extends DatabaseError {
  public readonly code = "FINANCE_CONCURRENCY_CONFLICT";
  constructor(entity: string, id: string, expectedVersion: number, actualVersion: number, cause?: unknown) {
    super(
      `Concurrency conflict on ${entity} '${id}'. Expected version ${expectedVersion}, but found ${actualVersion}.`,
      cause,
      { entity, id, expectedVersion, actualVersion }
    );
    this.name = "FinanceConcurrencyConflictError";
  }
}

// ----------------------------------------------------------------------------
// SPRINT 20: GENERAL LEDGER & DOUBLE-ENTRY ERRORS
// ----------------------------------------------------------------------------

export class LedgerAccountNotFoundError extends DatabaseError {
  public readonly code = "LEDGER_ACCOUNT_NOT_FOUND";
  constructor(accountRef: string, cause?: unknown) {
    super(`Ledger account '${accountRef}' was not found.`, cause, { accountRef });
    this.name = "LedgerAccountNotFoundError";
  }
}

export class LedgerAccountCodeAlreadyExistsError extends DatabaseError {
  public readonly code = "LEDGER_ACCOUNT_CODE_ALREADY_EXISTS";
  constructor(accountCode: string, cause?: unknown) {
    super(`A ledger account with code '${accountCode}' already exists in this workspace.`, cause, { accountCode });
    this.name = "LedgerAccountCodeAlreadyExistsError";
  }
}

export class JournalTransactionNotFoundError extends DatabaseError {
  public readonly code = "JOURNAL_TRANSACTION_NOT_FOUND";
  constructor(journalRef: string, cause?: unknown) {
    super(`Journal transaction '${journalRef}' was not found.`, cause, { journalRef });
    this.name = "JournalTransactionNotFoundError";
  }
}

export class LedgerUnbalancedPostingError extends DatabaseError {
  public readonly code = "LEDGER_UNBALANCED_POSTING";
  constructor(totalDebit: string, totalCredit: string, cause?: unknown) {
    super(
      `Balanced-posting invariant failed: total debits (${totalDebit}) do not equal total credits (${totalCredit}).`,
      cause,
      { totalDebit, totalCredit }
    );
    this.name = "LedgerUnbalancedPostingError";
  }
}

export class JournalAlreadyPostedError extends DatabaseError {
  public readonly code = "JOURNAL_ALREADY_POSTED";
  constructor(journalId: string, cause?: unknown) {
    super(`Journal transaction '${journalId}' has already been posted and is immutable.`, cause, { journalId });
    this.name = "JournalAlreadyPostedError";
  }
}

export class JournalAlreadyReversedError extends DatabaseError {
  public readonly code = "JOURNAL_ALREADY_REVERSED";
  constructor(journalId: string, cause?: unknown) {
    super(`Journal transaction '${journalId}' has already been reversed.`, cause, { journalId });
    this.name = "JournalAlreadyReversedError";
  }
}

export class LedgerAccountSuspendedOrClosedError extends DatabaseError {
  public readonly code = "LEDGER_ACCOUNT_INACTIVE";
  constructor(accountCode: string, status: string, cause?: unknown) {
    super(`Cannot post to ledger account '${accountCode}' because its status is '${status}'.`, cause, { accountCode, status });
    this.name = "LedgerAccountSuspendedOrClosedError";
  }
}

export class LedgerAccountCurrencyMismatchError extends DatabaseError {
  public readonly code = "LEDGER_ACCOUNT_CURRENCY_MISMATCH";
  constructor(accountCode: string, accountCurrency: string, journalCurrency: string, cause?: unknown) {
    super(
      `Ledger account '${accountCode}' currency '${accountCurrency}' does not match journal currency '${journalCurrency}'.`,
      cause,
      { accountCode, accountCurrency, journalCurrency }
    );
    this.name = "LedgerAccountCurrencyMismatchError";
  }
}

export class LedgerDuplicateTransactionError extends DatabaseError {
  public readonly code = "LEDGER_DUPLICATE_TRANSACTION";
  constructor(key: string, cause?: unknown) {
    super(`Duplicate ledger transaction posting attempt detected for key '${key}'.`, cause, { key });
    this.name = "LedgerDuplicateTransactionError";
  }
}

export class LedgerAccountHasTransactionsError extends DatabaseError {
  public readonly code = "LEDGER_ACCOUNT_HAS_TRANSACTIONS";
  constructor(accountCode: string, cause?: unknown) {
    super(`Cannot delete ledger account '${accountCode}' because transactions have already been posted to it.`, cause, { accountCode });
    this.name = "LedgerAccountHasTransactionsError";
  }
}

export class LedgerSystemAccountImmutableError extends DatabaseError {
  public readonly code = "LEDGER_SYSTEM_ACCOUNT_IMMUTABLE";
  constructor(accountCode: string, cause?: unknown) {
    super(`System ledger account '${accountCode}' cannot be deleted or reclassified.`, cause, { accountCode });
    this.name = "LedgerSystemAccountImmutableError";
  }
}

export class LedgerPostingValidationError extends DatabaseError {
  public readonly code = "LEDGER_POSTING_VALIDATION_ERROR";
  constructor(reason: string, cause?: unknown) {
    super(`Ledger posting rejected: ${reason}`, cause);
    this.name = "LedgerPostingValidationError";
  }
}

// ============================================================================
// SPRINT 21: VEHICLE OWNER SETTLEMENTS & PAYOUT OBLIGATIONS ERRORS
// ============================================================================

export class SettlementNotFoundError extends DatabaseError {
  public readonly code = "SETTLEMENT_NOT_FOUND";
  constructor(id: string, cause?: unknown) {
    super(`Owner settlement with identifier '${id}' was not found.`, cause, { id });
    this.name = "SettlementNotFoundError";
  }
}

export class SettlementPeriodNotFoundError extends DatabaseError {
  public readonly code = "SETTLEMENT_PERIOD_NOT_FOUND";
  constructor(id: string, cause?: unknown) {
    super(`Owner settlement period with identifier '${id}' was not found.`, cause, { id });
    this.name = "SettlementPeriodNotFoundError";
  }
}

export class SettlementPeriodClosedError extends DatabaseError {
  public readonly code = "SETTLEMENT_PERIOD_CLOSED";
  constructor(periodNumber: string, status: string, cause?: unknown) {
    super(`Cannot generate settlements for period '${periodNumber}' because it is in '${status}' state.`, cause, { periodNumber, status });
    this.name = "SettlementPeriodClosedError";
  }
}

export class SettlementPeriodOverlappingError extends DatabaseError {
  public readonly code = "SETTLEMENT_PERIOD_OVERLAPPING";
  constructor(startDate: string, endDate: string, existingPeriodNumber: string, cause?: unknown) {
    super(`Settlement period ${startDate} to ${endDate} overlaps with existing period '${existingPeriodNumber}'.`, cause, { startDate, endDate, existingPeriodNumber });
    this.name = "SettlementPeriodOverlappingError";
  }
}

export class SettlementDuplicatePeriodError extends DatabaseError {
  public readonly code = "SETTLEMENT_ALREADY_EXISTS";
  constructor(ownerId: string, startDate: string, endDate: string, cause?: unknown) {
    super(`A settlement already exists for owner '${ownerId}' covering period ${startDate} to ${endDate}.`, cause, { ownerId, startDate, endDate });
    this.name = "SettlementDuplicatePeriodError";
  }
}

export class SettlementAlreadyApprovedError extends DatabaseError {
  public readonly code = "SETTLEMENT_ALREADY_APPROVED";
  constructor(settlementNumber: string, cause?: unknown) {
    super(`Owner settlement '${settlementNumber}' is already approved and immutable.`, cause, { settlementNumber });
    this.name = "SettlementAlreadyApprovedError";
  }
}

export class SettlementAlreadyPaidError extends DatabaseError {
  public readonly code = "SETTLEMENT_ALREADY_PAID";
  constructor(settlementNumber: string, cause?: unknown) {
    super(`Owner settlement '${settlementNumber}' has already been paid and settled.`, cause, { settlementNumber });
    this.name = "SettlementAlreadyPaidError";
  }
}

export class SettlementDisputedBlockedError extends DatabaseError {
  public readonly code = "SETTLEMENT_DISPUTED_BLOCKED";
  constructor(settlementNumber: string, action: string, cause?: unknown) {
    super(`Cannot ${action} settlement '${settlementNumber}' while in DISPUTED status. Dispute must be resolved first.`, cause, { settlementNumber, action });
    this.name = "SettlementDisputedBlockedError";
  }
}

export class SettlementNotApprovedError extends DatabaseError {
  public readonly code = "SETTLEMENT_NOT_APPROVED";
  constructor(settlementNumber: string, status: string, cause?: unknown) {
    super(`Cannot execute payout for settlement '${settlementNumber}' because current status is '${status}' (must be APPROVED or PAYMENT_PENDING).`, cause, { settlementNumber, status });
    this.name = "SettlementNotApprovedError";
  }
}

export class SettlementPayableNotFoundError extends DatabaseError {
  public readonly code = "SETTLEMENT_PAYABLE_NOT_FOUND";
  constructor(payableId: string, cause?: unknown) {
    super(`Payable obligation '${payableId}' was not found.`, cause, { payableId });
    this.name = "SettlementPayableNotFoundError";
  }
}

// ============================================================================
// SPRINT 22: PAYMENT ABSTRACTION & PROVIDER CONTRACT ERRORS
// ============================================================================

export class PaymentNotFoundError extends DatabaseError {
  public readonly code = "PAYMENT_NOT_FOUND";
  constructor(id: string, cause?: unknown) {
    super(`Payment '${id}' was not found.`, cause, { id });
    this.name = "PaymentNotFoundError";
  }
}

export class PaymentAttemptNotFoundError extends DatabaseError {
  public readonly code = "PAYMENT_ATTEMPT_NOT_FOUND";
  constructor(id: string, cause?: unknown) {
    super(`Payment attempt '${id}' was not found.`, cause, { id });
    this.name = "PaymentAttemptNotFoundError";
  }
}

export class PaymentAttemptExpiredError extends DatabaseError {
  public readonly code = "PAYMENT_ATTEMPT_EXPIRED";
  constructor(id: string, expiresAt?: string, cause?: unknown) {
    super(`Payment attempt '${id}' has expired at ${expiresAt}.`, cause, { id, expiresAt });
    this.name = "PaymentAttemptExpiredError";
  }
}

export class PaymentAttemptAlreadyCompletedError extends DatabaseError {
  public readonly code = "PAYMENT_ATTEMPT_ALREADY_COMPLETED";
  constructor(id: string, status: string, cause?: unknown) {
    super(`Payment attempt '${id}' is already completed in status '${status}'.`, cause, { id, status });
    this.name = "PaymentAttemptAlreadyCompletedError";
  }
}

export class PaymentVerificationFailedError extends DatabaseError {
  public readonly code = "PAYMENT_VERIFICATION_FAILED";
  constructor(reason: string, cause?: unknown) {
    super(`Payment verification failed: ${reason}`, cause, { reason });
    this.name = "PaymentVerificationFailedError";
  }
}

export class PaymentAllocationExceededError extends DatabaseError {
  public readonly code = "PAYMENT_ALLOCATION_EXCEEDED";
  constructor(requested: string, available: string, cause?: unknown) {
    super(`Requested allocation of ${requested} exceeds unallocated payment amount ${available}.`, cause, { requested, available });
    this.name = "PaymentAllocationExceededError";
  }
}

export class PaymentAlreadyFullyAllocatedError extends DatabaseError {
  public readonly code = "PAYMENT_ALREADY_FULLY_ALLOCATED";
  constructor(paymentId: string, cause?: unknown) {
    super(`Payment '${paymentId}' is already fully allocated.`, cause, { paymentId });
    this.name = "PaymentAlreadyFullyAllocatedError";
  }
}

export class PaymentCurrencyMismatchError extends DatabaseError {
  public readonly code = "PAYMENT_CURRENCY_MISMATCH";
  constructor(expected: string, actual: string, cause?: unknown) {
    super(`Payment currency mismatch: expected '${expected}', got '${actual}'.`, cause, { expected, actual });
    this.name = "PaymentCurrencyMismatchError";
  }
}

export class RefundExceedsPaymentError extends DatabaseError {
  public readonly code = "REFUND_EXCEEDS_PAYMENT";
  constructor(requested: string, refundable: string, cause?: unknown) {
    super(`Requested refund of ${requested} exceeds remaining refundable payment balance ${refundable}.`, cause, { requested, refundable });
    this.name = "RefundExceedsPaymentError";
  }
}

export class RefundNotFoundError extends DatabaseError {
  public readonly code = "REFUND_NOT_FOUND";
  constructor(id: string, cause?: unknown) {
    super(`Refund record '${id}' was not found.`, cause, { id });
    this.name = "RefundNotFoundError";
  }
}

export class DuplicateProviderTransactionError extends DatabaseError {
  public readonly code = "DUPLICATE_PROVIDER_TRANSACTION";
  constructor(provider: string, transactionId: string, cause?: unknown) {
    super(`A verified payment with ${provider} transaction reference '${transactionId}' already exists.`, cause, { provider, transactionId });
    this.name = "DuplicateProviderTransactionError";
  }
}

export class InvalidWebhookSignatureError extends DatabaseError {
  public readonly code = "INVALID_WEBHOOK_SIGNATURE";
  constructor(provider: string, cause?: unknown) {
    super(`Invalid or missing webhook signature from provider '${provider}'.`, cause, { provider });
    this.name = "InvalidWebhookSignatureError";
  }
}

export class ClientPaymentEvidenceRejectedError extends DatabaseError {
  public readonly code = "CLIENT_PAYMENT_EVIDENCE_REJECTED";
  constructor(message: string = "A client/browser success notification is not authoritative payment evidence. Server-side verification is required.", cause?: unknown) {
    super(message, cause);
    this.name = "ClientPaymentEvidenceRejectedError";
  }
}

export class ReportExecutionNotFoundError extends DatabaseError {
  public readonly code = "REPORT_EXECUTION_NOT_FOUND";
  constructor(id: string, tenantId?: string) {
    super(`Report execution '${id}' not found${tenantId ? ` for tenant '${tenantId}'` : ""}.`);
    this.name = "ReportExecutionNotFoundError";
  }
}

export class SavedReportNotFoundError extends DatabaseError {
  public readonly code = "SAVED_REPORT_NOT_FOUND";
  constructor(id: string, tenantId?: string) {
    super(`Saved report '${id}' not found${tenantId ? ` for tenant '${tenantId}'` : ""}.`);
    this.name = "SavedReportNotFoundError";
  }
}

export class ReportScheduleNotFoundError extends DatabaseError {
  public readonly code = "REPORT_SCHEDULE_NOT_FOUND";
  constructor(id: string, tenantId?: string) {
    super(`Report schedule '${id}' not found${tenantId ? ` for tenant '${tenantId}'` : ""}.`);
    this.name = "ReportScheduleNotFoundError";
  }
}

export class InvalidReportQueryError extends DatabaseError {
  public readonly code = "INVALID_REPORT_QUERY";
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "InvalidReportQueryError";
  }
}



/**
 * Maps raw driver/ORM errors to safe domain-level DatabaseErrors
 */
export function mapDatabaseError(error: unknown, fallbackMessage = "Database operation failed"): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }

  const errObj = error as { code?: string; message?: string; meta?: { target?: string[]; constraint?: string } };

  // PostgreSQL GiST Exclusion Constraint violation (23P01)
  if (errObj?.code === "23P01" || errObj?.message?.includes("exclusion constraint") || errObj?.message?.includes("uq_no_overlapping_vehicle_allocations")) {
    return new AvailabilityConflictError(
      "The requested vehicle is already allocated or blocked for the requested time window.",
      undefined,
      undefined,
      error
    );
  }

  // Common PostgreSQL/Prisma error codes
  if (errObj?.code === "P2002" || errObj?.code === "23505") {
    const target = errObj.meta?.target?.join(", ") || "field";
    return new UniqueConstraintViolationError(target, undefined, error);
  }

  if (errObj?.code === "P2003" || errObj?.code === "23503") {
    return new ForeignKeyConstraintViolationError("relation", error);
  }

  if (errObj?.code === "P2025") {
    return new RecordNotFoundError("Record", "specified identifier", error);
  }

  if (errObj?.code === "ECONNREFUSED" || errObj?.code === "P1001" || errObj?.code === "P1002") {
    return new DatabaseUnavailableError("Unable to establish database connection.", error);
  }

  return new InternalDatabaseError(fallbackMessage, error);
}

