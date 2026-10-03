// ============================================================================
// CAR HIRE OS — COMPLIANCE READINESS APPLICATION SERVICE (DEV-009, DOM-003, BRS-001)
// Operational Eligibility Gatekeeper & Public Evaluation Queries
// ============================================================================

import type {
  ComplianceDashboardSummary,
  ComplianceOperationContext,
  ComplianceReadinessResult,
  ComplianceSubjectType,
} from "@carhire/types";
import {
  ComplianceRequirementRepository,
  ComplianceRecordRepository,
  ComplianceIssueRepository,
  ComplianceOverrideRepository,
  VehicleRepository,
  DriverRepository,
  CustomerRepository,
} from "@carhire/database";
import { IClock, SystemClock } from "../domain/clock";
import { ComplianceReadinessEngine } from "../domain/compliance-readiness-engine";
import { TemporalInterval } from "../domain/continuous-coverage";

export interface EvaluateRentalStartParams {
  vehicleId: string;
  driverId?: string;
  customerId: string;
  interval: {
    start: string;
    end: string;
  };
}

export interface RentalStartReadinessSummary {
  isReady: boolean;
  blockers: string[];
  warnings: string[];
  vehicleReadiness: ComplianceReadinessResult;
  driverReadiness?: ComplianceReadinessResult;
  customerReadiness: ComplianceReadinessResult;
}

export class ComplianceReadinessService {
  constructor(
    private readonly requirementRepo: ComplianceRequirementRepository,
    private readonly recordRepo: ComplianceRecordRepository,
    private readonly issueRepo: ComplianceIssueRepository,
    private readonly overrideRepo: ComplianceOverrideRepository,
    private readonly vehicleRepo: VehicleRepository,
    private readonly driverRepo: DriverRepository,
    private readonly customerRepo: CustomerRepository,
    private readonly clock: IClock = new SystemClock()
  ) {}

  /**
   * Evaluates operational eligibility for a vehicle.
   */
  async evaluateVehicle(
    tenantId: string,
    vehicleId: string,
    context: ComplianceOperationContext,
    interval?: TemporalInterval
  ): Promise<ComplianceReadinessResult> {
    const asOfTime = this.clock.now();
    const requirements = await this.requirementRepo.list(tenantId, "VEHICLE", true);
    const records = await this.recordRepo.findBySubject("VEHICLE", vehicleId, tenantId);
    const activeIssues = await this.issueRepo.findBySubject("VEHICLE", vehicleId, tenantId);
    const activeOverrides = await this.overrideRepo.findBySubject("VEHICLE", vehicleId, tenantId);

    return ComplianceReadinessEngine.evaluateSubjectReadiness(
      {
        subjectType: "VEHICLE",
        subjectId: vehicleId,
        requirements,
        records,
        activeIssues,
        activeOverrides,
      },
      {
        context,
        interval,
        asOfTime,
      }
    );
  }

  /**
   * Evaluates operational eligibility for a driver.
   */
  async evaluateDriver(
    tenantId: string,
    driverId: string,
    context: ComplianceOperationContext,
    interval?: TemporalInterval
  ): Promise<ComplianceReadinessResult> {
    const asOfTime = this.clock.now();
    const requirements = await this.requirementRepo.list(tenantId, "DRIVER", true);
    const records = await this.recordRepo.findBySubject("DRIVER", driverId, tenantId);
    const activeIssues = await this.issueRepo.findBySubject("DRIVER", driverId, tenantId);
    const activeOverrides = await this.overrideRepo.findBySubject("DRIVER", driverId, tenantId);

    return ComplianceReadinessEngine.evaluateSubjectReadiness(
      {
        subjectType: "DRIVER",
        subjectId: driverId,
        requirements,
        records,
        activeIssues,
        activeOverrides,
      },
      {
        context,
        interval,
        asOfTime,
      }
    );
  }

  /**
   * Evaluates operational eligibility for a customer (Identity / Verification).
   */
  async evaluateCustomer(
    tenantId: string,
    customerId: string,
    context: ComplianceOperationContext
  ): Promise<ComplianceReadinessResult> {
    const asOfTime = this.clock.now();
    const requirements = await this.requirementRepo.list(tenantId, "CUSTOMER", true);
    const records = await this.recordRepo.findBySubject("CUSTOMER", customerId, tenantId);
    const activeIssues = await this.issueRepo.findBySubject("CUSTOMER", customerId, tenantId);
    const activeOverrides = await this.overrideRepo.findBySubject("CUSTOMER", customerId, tenantId);

    return ComplianceReadinessEngine.evaluateSubjectReadiness(
      {
        subjectType: "CUSTOMER",
        subjectId: customerId,
        requirements,
        records,
        activeIssues,
        activeOverrides,
      },
      {
        context,
        asOfTime,
      }
    );
  }

  /**
   * Evaluates aggregate readiness for RENTAL_START across vehicle, driver, and customer.
   */
  async evaluateRentalStart(
    tenantId: string,
    params: EvaluateRentalStartParams
  ): Promise<RentalStartReadinessSummary> {
    const vehicleReadiness = await this.evaluateVehicle(
      tenantId,
      params.vehicleId,
      "RENTAL_START",
      params.interval
    );

    let driverReadiness: ComplianceReadinessResult | undefined;
    if (params.driverId) {
      driverReadiness = await this.evaluateDriver(
        tenantId,
        params.driverId,
        "RENTAL_START",
        params.interval
      );
    }

    const customerReadiness = await this.evaluateCustomer(
      tenantId,
      params.customerId,
      "RENTAL_START"
    );

    const blockers: string[] = [];
    const warnings: string[] = [];

    // Aggregate vehicle blockers & warnings
    vehicleReadiness.blockingIssues.forEach((b) => blockers.push(`Vehicle: ${b.message}`));
    vehicleReadiness.warnings.forEach((w) => warnings.push(`Vehicle: ${w.message}`));

    // Aggregate driver blockers & warnings
    if (driverReadiness) {
      driverReadiness.blockingIssues.forEach((b) => blockers.push(`Driver: ${b.message}`));
      driverReadiness.warnings.forEach((w) => warnings.push(`Driver: ${w.message}`));
    }

    // Aggregate customer blockers & warnings
    customerReadiness.blockingIssues.forEach((b) => blockers.push(`Customer: ${b.message}`));
    customerReadiness.warnings.forEach((w) => warnings.push(`Customer: ${w.message}`));

    const isReady = blockers.length === 0;

    return {
      isReady,
      blockers,
      warnings,
      vehicleReadiness,
      driverReadiness,
      customerReadiness,
    };
  }

  /**
   * Retrieves high-level dashboard metrics for tenant compliance.
   */
  async getDashboardSummary(tenantId: string): Promise<ComplianceDashboardSummary> {
    const records = await this.recordRepo.list(tenantId);
    const issues = await this.issueRepo.list(tenantId);
    const overrides = await this.overrideRepo.list(tenantId);

    const now = this.clock.now().getTime();
    const activeOverrides = overrides.filter((o) => new Date(o.validUntil).getTime() > now);

    const totalRecords = records.length;
    const validRecords = records.filter((r) => r.status === "VALID").length;
    const dueSoonRecords = records.filter((r) => r.status === "DUE_SOON").length;
    const expiredRecords = records.filter((r) => r.status === "EXPIRED").length;
    const unverifiedRecords = records.filter((r) => r.verificationStatus === "UNVERIFIED" || r.verificationStatus === "PENDING").length;

    const openIssues = issues.filter((i) => i.status === "OPEN" || i.status === "IN_REMEDIATION");
    const criticalIssuesCount = openIssues.filter((i) => i.severity === "CRITICAL").length;
    const blockingIssuesCount = openIssues.filter((i) => i.blockingPolicy !== "WARNING_ONLY").length;

    // Calculate quick readiness percentages
    const vRes = (this.vehicleRepo as any).findAll
      ? await (this.vehicleRepo as any).findAll(tenantId)
      : { vehicles: await (this.vehicleRepo as any).list(tenantId) };
    const vehicles: any[] = vRes.vehicles || (Array.isArray(vRes) ? vRes : []);

    let readyVehicles = 0;
    for (const v of vehicles) {
      const vIssues = openIssues.filter((i) => i.subjectType === "VEHICLE" && i.subjectId === v.id && i.blockingPolicy !== "WARNING_ONLY");
      if (vIssues.length === 0) readyVehicles++;
    }

    const dRes = (this.driverRepo as any).findAll
      ? await (this.driverRepo as any).findAll(tenantId)
      : { drivers: await (this.driverRepo as any).list(tenantId) };
    const drivers: any[] = dRes.drivers || (Array.isArray(dRes) ? dRes : []);

    let readyDrivers = 0;
    for (const d of drivers) {
      const dIssues = openIssues.filter((i) => i.subjectType === "DRIVER" && i.subjectId === d.id && i.blockingPolicy !== "WARNING_ONLY");
      if (dIssues.length === 0) readyDrivers++;
    }

    const vehicleReadinessRate = vehicles.length > 0 ? Math.round((readyVehicles / vehicles.length) * 100) : 100;
    const driverReadinessRate = drivers.length > 0 ? Math.round((readyDrivers / drivers.length) * 100) : 100;

    return {
      totalRecords,
      validRecords,
      dueSoonRecords,
      expiredRecords,
      unverifiedRecords,
      openIssuesCount: openIssues.length,
      criticalIssuesCount,
      blockingIssuesCount,
      activeOverridesCount: activeOverrides.length,
      vehicleReadinessRate,
      driverReadinessRate,
    };
  }
}
