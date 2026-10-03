// ============================================================================
// CAR HIRE OS — FLEET DOMAIN ERRORS (DEV-009, DOM-001)
// ============================================================================

import { ERROR_CODES } from "@carhire/constants";

export class FleetDomainError extends Error {
  public readonly isOperational: boolean = true;
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "FleetDomainError";
  }
}

export class VehicleNotFoundError extends FleetDomainError {
  constructor(vehicleId: string) {
    super(`Vehicle with ID '${vehicleId}' was not found.`, ERROR_CODES.VEHICLE_NOT_FOUND, 404);
  }
}

export class VehicleRegistrationPlateConflictError extends FleetDomainError {
  constructor(plate: string) {
    super(
      `A vehicle with registration plate '${plate}' already exists in this tenant.`,
      ERROR_CODES.VEHICLE_REGISTRATION_EXISTS,
      409
    );
  }
}

export class VehicleVinConflictError extends FleetDomainError {
  constructor(vin: string) {
    super(`A vehicle with VIN '${vin}' already exists in this tenant.`, ERROR_CODES.VEHICLE_VIN_EXISTS, 409);
  }
}

export class VehicleInvalidStatusTransitionError extends FleetDomainError {
  constructor(fromStatus: string, toStatus: string, reason?: string) {
    super(
      `Invalid vehicle status transition from '${fromStatus}' to '${toStatus}'${reason ? `: ${reason}` : "."}`,
      ERROR_CODES.VEHICLE_INVALID_STATUS_TRANSITION,
      422
    );
  }
}

export class VehicleNotOperationalError extends FleetDomainError {
  constructor(vehicleId: string, currentStatus: string) {
    super(
      `Vehicle '${vehicleId}' is not operational (current status: '${currentStatus}').`,
      ERROR_CODES.VEHICLE_NOT_OPERATIONAL,
      422
    );
  }
}

export class VehicleQuotaExceededError extends FleetDomainError {
  constructor(currentCount: number, maxAllowed: number) {
    super(
      `Vehicle fleet limit reached (${currentCount}/${maxAllowed}). Please upgrade your subscription plan to add more vehicles.`,
      ERROR_CODES.VEHICLE_LIMIT_REACHED,
      403,
      { currentCount, maxAllowed }
    );
  }
}

export class VehicleOptimisticLockError extends FleetDomainError {
  constructor(expectedVersion: number, actualVersion?: number) {
    super(
      `Concurrency conflict: Vehicle was modified concurrently (expected version: ${expectedVersion}, actual version: ${actualVersion}).`,
      ERROR_CODES.VEHICLE_CONCURRENCY_CONFLICT,
      409
    );
  }
}
