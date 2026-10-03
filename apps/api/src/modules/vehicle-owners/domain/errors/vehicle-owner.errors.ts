// ============================================================================
// CAR HIRE OS — VEHICLE OWNER DOMAIN ERRORS (DEV-009, DOM-001)
// ============================================================================

import { ERROR_CODES } from "@carhire/constants";

export class VehicleOwnerDomainError extends Error {
  public readonly isOperational: boolean = true;
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "VehicleOwnerDomainError";
  }
}

export class VehicleOwnerNotFoundError extends VehicleOwnerDomainError {
  constructor(ownerId: string) {
    super(`Vehicle owner with ID '${ownerId}' was not found.`, ERROR_CODES.VEHICLE_OWNER_NOT_FOUND, 404);
  }
}

export class VehicleOwnershipNotFoundError extends VehicleOwnerDomainError {
  constructor(id: string) {
    super(`Vehicle ownership agreement with ID '${id}' was not found.`, ERROR_CODES.VEHICLE_OWNERSHIP_NOT_FOUND, 404);
  }
}

export class InvalidRevenueShareError extends VehicleOwnerDomainError {
  constructor(share: number) {
    super(
      `Revenue share percentage must be between 0.0000% and 100.0000% (received: ${share}%).`,
      ERROR_CODES.INVALID_REVENUE_SHARE,
      422
    );
  }
}

export class VehicleOwnershipConflictError extends VehicleOwnerDomainError {
  constructor(vehicleId: string, reason: string) {
    super(
      `Ownership conflict for vehicle '${vehicleId}': ${reason}`,
      ERROR_CODES.VEHICLE_OWNERSHIP_CONFLICT,
      409
    );
  }
}
