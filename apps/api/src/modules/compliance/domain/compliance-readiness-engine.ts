// ============================================================================
// CAR HIRE OS — COMPLIANCE READINESS EVALUATION ENGINE (DEV-009, DOM-003, BRS-001)
// Operational Context Gating, Interval Verification & Override Application
// ============================================================================

import type {
  ComplianceBlockingPolicy,
  ComplianceIssue,
  ComplianceIssueSeverity,
  ComplianceIssueType,
  ComplianceOperationContext,
  ComplianceOverride,
  ComplianceReadinessIssueItem,
  ComplianceReadinessResult,
  ComplianceRecord,
  ComplianceRequirement,
  ComplianceSubjectType,
} from "@carhire/types";
import { calculateDaysRemaining, evaluateExpiryState } from "./clock";
import { evaluateIntervalCoverage, TemporalInterval } from "./continuous-coverage";

export interface EvaluationSubjectInput {
  subjectType: ComplianceSubjectType;
  subjectId: string;
  name?: string;
  requirements: ComplianceRequirement[];
  records: ComplianceRecord[];
  activeIssues: ComplianceIssue[];
  activeOverrides: ComplianceOverride[];
}

export interface OperationalEvaluationOptions {
  context: ComplianceOperationContext;
  interval?: TemporalInterval;
  asOfTime: Date;
}

/**
 * Maps a requirement's blocking policy against the active operation context
 * to determine whether a failure is a hard blocker vs a warning.
 */
export function isBlockingInContext(
  policy: ComplianceBlockingPolicy,
  context: ComplianceOperationContext
): boolean {
  if (policy === "WARNING_ONLY") return false;

  // Invariant: The RETURN operation is NEVER blocked by compliance failures
  if (context === "RETURN") return false;

  switch (context) {
    case "BOOKING_CONFIRMATION":
      return policy === "BLOCK_NEW_BOOKING" || policy === "BLOCK_ALL_NEW_OPERATIONS";

    case "VEHICLE_ALLOCATION":
      return (
        policy === "BLOCK_NEW_BOOKING" ||
        policy === "BLOCK_HANDOVER" ||
        policy === "BLOCK_RENTAL_START" ||
        policy === "BLOCK_VEHICLE_OPERATION" ||
        policy === "BLOCK_ALL_NEW_OPERATIONS"
      );

    case "HANDOVER":
      return (
        policy === "BLOCK_HANDOVER" ||
        policy === "BLOCK_RENTAL_START" ||
        policy === "BLOCK_VEHICLE_OPERATION" ||
        policy === "BLOCK_ALL_NEW_OPERATIONS"
      );

    case "RENTAL_START":
      return (
        policy === "BLOCK_RENTAL_START" ||
        policy === "BLOCK_VEHICLE_OPERATION" ||
        policy === "BLOCK_ALL_NEW_OPERATIONS"
      );

    case "RENTAL_EXTENSION":
      return (
        policy === "BLOCK_RENTAL_START" ||
        policy === "BLOCK_VEHICLE_OPERATION" ||
        policy === "BLOCK_ALL_NEW_OPERATIONS"
      );

    case "POST_MAINTENANCE_RELEASE":
      return policy === "BLOCK_VEHICLE_OPERATION" || policy === "BLOCK_ALL_NEW_OPERATIONS";

    case "ACTIVE_RENTAL":
      // Active rental operations (monitoring) do not halt the vehicle in motion
      return false;

    default:
      return false;
  }
}

export class ComplianceReadinessEngine {
  /**
   * Evaluates operational readiness for a single subject entity (Vehicle, Driver, Customer).
   */
  static evaluateSubjectReadiness(
    input: EvaluationSubjectInput,
    options: OperationalEvaluationOptions
  ): ComplianceReadinessResult {
    const { subjectType, subjectId, requirements, records, activeOverrides } = input;
    const { context, interval, asOfTime } = options;

    const blockingIssues: ComplianceReadinessIssueItem[] = [];
    const warnings: ComplianceReadinessIssueItem[] = [];
    let verifiedCount = 0;

    // Filter to active requirements applicable to this subject type
    const applicableRequirements = requirements.filter(
      (r) => r.isActive && r.subjectType === subjectType
    );

    for (const req of applicableRequirements) {
      // Find all records matching this requirement
      const matchingRecords = records.filter(
        (rec) => rec.requirementCode === req.code || rec.requirementId === req.id
      );

      // Check if an active emergency override exists for this specific requirement & context
      const activeOverride = activeOverrides.find(
        (o) =>
          o.requirementCode === req.code &&
          o.operationContext === context &&
          new Date(o.validUntil).getTime() > asOfTime.getTime()
      );

      // 1. Missing Record Check
      if (matchingRecords.length === 0) {
        if (req.mandatory) {
          const issueItem: ComplianceReadinessIssueItem = {
            requirementCode: req.code,
            requirementName: req.name,
            issueType: "MISSING",
            severity: "CRITICAL",
            blockingPolicy: req.blockingPolicy,
            message: `Mandatory requirement '${req.name}' has no submitted documents.`,
            remediationAction: `Upload and verify a valid ${req.name}.`,
          };

          if (activeOverride) {
            warnings.push({
              ...issueItem,
              message: `${issueItem.message} (OVERRIDDEN by ${activeOverride.approvedBy}: ${activeOverride.reason})`,
            });
          } else if (isBlockingInContext(req.blockingPolicy, context)) {
            blockingIssues.push(issueItem);
          } else {
            warnings.push(issueItem);
          }
        }
        continue;
      }

      // 2. Unverified / Rejected / Revoked Check
      const verifiedRecords = matchingRecords.filter(
        (r) => r.verificationStatus === "VERIFIED"
      );

      if (verifiedRecords.length === 0) {
        const latestRecord = matchingRecords[0];
        let issueType: ComplianceIssueType = "UNVERIFIED";
        let severity: ComplianceIssueSeverity = "HIGH";
        let message = `Document for '${req.name}' is unverified (${latestRecord.verificationStatus}).`;

        if (latestRecord.verificationStatus === "REJECTED") {
          issueType = "REJECTED";
          message = `Document for '${req.name}' was REJECTED: ${latestRecord.rejectionReason || "Verification failed"}.`;
        } else if (latestRecord.verificationStatus === "REVOKED") {
          issueType = "REVOKED";
          severity = "CRITICAL";
          message = `Document for '${req.name}' was REVOKED: ${latestRecord.revocationReason || "Revoked by authority"}.`;
        }

        const issueItem: ComplianceReadinessIssueItem = {
          requirementCode: req.code,
          requirementName: req.name,
          issueType,
          severity,
          blockingPolicy: req.blockingPolicy,
          message,
          remediationAction: `Perform verification or upload replacement document for ${req.name}.`,
        };

        if (activeOverride) {
          warnings.push({
            ...issueItem,
            message: `${issueItem.message} (OVERRIDDEN by ${activeOverride.approvedBy}: ${activeOverride.reason})`,
          });
        } else if (req.verificationRequired && isBlockingInContext(req.blockingPolicy, context)) {
          blockingIssues.push(issueItem);
        } else {
          warnings.push(issueItem);
        }
        continue;
      }

      // 3. Expiry & Date Boundary Check
      if (!req.expiryRequired) {
        // No expiry needed and verified
        verifiedCount++;
        continue;
      }

      // Evaluate temporal coverage:
      // If a specific operational interval [start, end] is requested, check continuous coverage
      if (interval && interval.start && interval.end) {
        const coverage = evaluateIntervalCoverage(verifiedRecords, interval);

        if (!coverage.isFullyCovered) {
          const gapMsg = coverage.gaps
            .map((g) => `${new Date(g.gapStart).toLocaleDateString()} to ${new Date(g.gapEnd).toLocaleDateString()}`)
            .join(", ");

          const issueItem: ComplianceReadinessIssueItem = {
            requirementCode: req.code,
            requirementName: req.name,
            issueType: "COVERAGE_GAP",
            severity: "HIGH",
            blockingPolicy: req.blockingPolicy,
            message: `'${req.name}' does not provide continuous coverage for the operational interval. Coverage gaps: ${gapMsg}`,
            remediationAction: `Submit renewal document covering the full duration until ${new Date(interval.end).toLocaleDateString()}.`,
          };

          if (activeOverride) {
            warnings.push({
              ...issueItem,
              message: `${issueItem.message} (OVERRIDDEN by ${activeOverride.approvedBy}: ${activeOverride.reason})`,
            });
          } else if (isBlockingInContext(req.blockingPolicy, context)) {
            blockingIssues.push(issueItem);
          } else {
            warnings.push(issueItem);
          }
          continue;
        }

        // Fully covered throughout interval
        verifiedCount++;
        continue;
      }

      // If no interval provided, evaluate against asOfTime
      // Find latest verified record
      const activeRecord = verifiedRecords[0];
      const expiryState = evaluateExpiryState(activeRecord.expiresAt, req.warningThresholdDays, asOfTime);
      const daysLeft = calculateDaysRemaining(activeRecord.expiresAt, asOfTime);

      if (expiryState === "EXPIRED") {
        const issueItem: ComplianceReadinessIssueItem = {
          requirementCode: req.code,
          requirementName: req.name,
          issueType: "EXPIRED",
          severity: "CRITICAL",
          blockingPolicy: req.blockingPolicy,
          message: `'${req.name}' expired on ${new Date(activeRecord.expiresAt).toLocaleDateString()} (${Math.abs(daysLeft)} days ago).`,
          expiresAt: activeRecord.expiresAt,
          daysRemaining: daysLeft,
          remediationAction: `Renew ${req.name} immediately.`,
        };

        if (activeOverride) {
          warnings.push({
            ...issueItem,
            message: `${issueItem.message} (OVERRIDDEN by ${activeOverride.approvedBy}: ${activeOverride.reason})`,
          });
        } else if (isBlockingInContext(req.blockingPolicy, context)) {
          blockingIssues.push(issueItem);
        } else {
          warnings.push(issueItem);
        }
      } else if (expiryState === "DUE_SOON") {
        // Warning only (does not block unless specified)
        warnings.push({
          requirementCode: req.code,
          requirementName: req.name,
          issueType: "EXPIRING_SOON",
          severity: daysLeft <= 7 ? "HIGH" : "MEDIUM",
          blockingPolicy: req.blockingPolicy,
          message: `'${req.name}' is due to expire in ${daysLeft} days (${new Date(activeRecord.expiresAt).toLocaleDateString()}).`,
          expiresAt: activeRecord.expiresAt,
          daysRemaining: daysLeft,
          remediationAction: `Prepare renewal document for ${req.name}.`,
        });
        verifiedCount++;
      } else {
        // Valid
        verifiedCount++;
      }
    }

    const isReady = blockingIssues.length === 0;

    return {
      isReady,
      subjectType,
      subjectId,
      operationContext: context,
      evaluatedAt: asOfTime.toISOString(),
      blockingIssues,
      warnings,
      verifiedItemsCount: verifiedCount,
      totalRequirementsCount: applicableRequirements.length,
    };
  }
}
