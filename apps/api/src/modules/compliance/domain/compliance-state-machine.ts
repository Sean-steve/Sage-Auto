// ============================================================================
// CAR HIRE OS — COMPLIANCE RECORD STATE MACHINE (DEV-006, DEV-009)
// Document Verification, Lifecycle & Expiry Transitions
// ============================================================================

import type {
  ComplianceRecord,
  ComplianceRecordStatus,
  ComplianceVerificationStatus,
  ComplianceRequirement,
} from "@carhire/types";
import { evaluateExpiryState, normalizeExpiryBoundary, normalizeStartBoundary } from "./clock";

export class InvalidComplianceTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidComplianceTransitionError";
  }
}

export class FourEyesComplianceViolationError extends Error {
  constructor(message: string = "A user cannot verify a compliance document they submitted themselves.") {
    super(message);
    this.name = "FourEyesComplianceViolationError";
  }
}

export interface VerificationCommand {
  verifiedBy: string;
  verificationMethod?: string;
  notes?: string;
  verifiedAt?: string;
  submitterId?: string;
  enforceFourEyes?: boolean;
}

export interface RejectionCommand {
  rejectedBy: string;
  reason: string;
  notes?: string;
}

export interface RevocationCommand {
  revokedBy: string;
  reason: string;
  effectiveRevocationAt?: string;
  notes?: string;
}

export class ComplianceStateMachine {
  /**
   * Recalculates the dynamic status of a compliance record according to its verification
   * status and current time relative to expiry.
   */
  static recalculateStatus(
    record: ComplianceRecord,
    requirement: ComplianceRequirement,
    asOfTime: Date
  ): { status: ComplianceRecordStatus; verificationStatus: ComplianceVerificationStatus } {
    if (record.verificationStatus === "REVOKED") {
      return { status: "REJECTED", verificationStatus: "REVOKED" };
    }
    if (record.verificationStatus === "REJECTED") {
      return { status: "REJECTED", verificationStatus: "REJECTED" };
    }
    if (record.verificationStatus === "UNVERIFIED" || record.verificationStatus === "PENDING") {
      return { status: "PENDING", verificationStatus: record.verificationStatus };
    }

    // Record is VERIFIED
    if (!requirement.expiryRequired || !record.expiresAt) {
      return { status: "VALID", verificationStatus: "VERIFIED" };
    }

    const calculatedState = evaluateExpiryState(record.expiresAt, requirement.warningThresholdDays, asOfTime);
    return { status: calculatedState, verificationStatus: "VERIFIED" };
  }

  /**
   * Transitions a record to VERIFIED.
   */
  static applyVerification(
    record: ComplianceRecord,
    requirement: ComplianceRequirement,
    cmd: VerificationCommand,
    asOfTime: Date
  ): Partial<ComplianceRecord> {
    if (record.verificationStatus === "VERIFIED") {
      throw new InvalidComplianceTransitionError(`Record ${record.id} is already VERIFIED.`);
    }
    if (record.verificationStatus === "REVOKED") {
      throw new InvalidComplianceTransitionError(`Cannot verify record ${record.id} which has been REVOKED.`);
    }

    if (cmd.enforceFourEyes && cmd.submitterId && cmd.verifiedBy === cmd.submitterId) {
      throw new FourEyesComplianceViolationError();
    }

    const verifiedAt = cmd.verifiedAt || asOfTime.toISOString();
    const expiryStatus = requirement.expiryRequired && record.expiresAt
      ? evaluateExpiryState(record.expiresAt, requirement.warningThresholdDays, asOfTime)
      : "VALID";

    return {
      verificationStatus: "VERIFIED",
      status: expiryStatus,
      verifiedBy: cmd.verifiedBy,
      verifiedAt,
      verificationMethod: cmd.verificationMethod || "MANUAL_DOCUMENT_AUDIT",
      notes: cmd.notes ? `${record.notes ? record.notes + "\n" : ""}${cmd.notes}` : record.notes,
    };
  }

  /**
   * Transitions a record to REJECTED.
   */
  static applyRejection(
    record: ComplianceRecord,
    cmd: RejectionCommand
  ): Partial<ComplianceRecord> {
    if (!cmd.reason || cmd.reason.trim().length === 0) {
      throw new InvalidComplianceTransitionError("Rejection reason is mandatory.");
    }
    if (record.verificationStatus === "VERIFIED") {
      throw new InvalidComplianceTransitionError("A verified document cannot be rejected; it must be revoked.");
    }

    return {
      verificationStatus: "REJECTED",
      status: "REJECTED",
      rejectionReason: cmd.reason.trim(),
      notes: cmd.notes ? `${record.notes ? record.notes + "\n" : ""}${cmd.notes}` : record.notes,
    };
  }

  /**
   * Transitions a VERIFIED record to REVOKED.
   */
  static applyRevocation(
    record: ComplianceRecord,
    cmd: RevocationCommand,
    asOfTime: Date
  ): Partial<ComplianceRecord> {
    if (!cmd.reason || cmd.reason.trim().length === 0) {
      throw new InvalidComplianceTransitionError("Revocation reason is mandatory.");
    }
    if (record.verificationStatus !== "VERIFIED") {
      throw new InvalidComplianceTransitionError(
        `Only VERIFIED compliance records can be revoked. Current status is ${record.verificationStatus}.`
      );
    }

    return {
      verificationStatus: "REVOKED",
      status: "REJECTED",
      revocationReason: cmd.reason.trim(),
      revokedAt: cmd.effectiveRevocationAt || asOfTime.toISOString(),
      notes: cmd.notes ? `${record.notes ? record.notes + "\n" : ""}${cmd.notes}` : record.notes,
    };
  }
}
