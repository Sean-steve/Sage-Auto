import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — COMPLIANCE REQUIREMENT REPOSITORY (DEV-006, DEV-009, DOM-003 §21-24)
// Regulatory & Operational Requirement Catalog Persistence
// ============================================================================

import type {
  ComplianceRequirement,
  ComplianceSubjectType,
  ComplianceRequirementType,
  ComplianceBlockingPolicy,
} from "@carhire/types";
import { RecordNotFoundError, CrossTenantViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IComplianceRequirementRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<ComplianceRequirement | null>;
  findByCode(code: string, tenantId?: string, tx?: TransactionContext): Promise<ComplianceRequirement | null>;
  list(tenantId: string, subjectType?: ComplianceSubjectType, activeOnly?: boolean, tx?: TransactionContext): Promise<ComplianceRequirement[]>;
  create(data: Omit<ComplianceRequirement, "id" | "createdAt" | "updatedAt" | "version">, tx?: TransactionContext): Promise<ComplianceRequirement>;
  update(id: string, tenantId: string | undefined, data: Partial<ComplianceRequirement>, tx?: TransactionContext): Promise<ComplianceRequirement>;
  delete(id: string, tenantId?: string, tx?: TransactionContext): Promise<void>;
}

export const CANONICAL_SYSTEM_REQUIREMENTS: Omit<ComplianceRequirement, "id" | "createdAt" | "updatedAt" | "version">[] = [
  {
    code: "VEHICLE_INSURANCE",
    name: "Commercial PSV / Hire Insurance",
    description: "Mandatory third-party or comprehensive commercial motor insurance coverage for commercial vehicle operations.",
    subjectType: "VEHICLE",
    requirementType: "INSURANCE",
    jurisdiction: "NATIONAL",
    mandatory: false,
    blockingPolicy: "BLOCK_ALL_NEW_OPERATIONS",
    verificationRequired: true,
    expiryRequired: true,
    warningThresholdDays: 30,
    isActive: true,
  },
  {
    code: "VEHICLE_INSPECTION_CERTIFICATE",
    name: "Statutory Roadworthiness Inspection",
    description: "Annual motor vehicle safety inspection certificate issued by statutory transport inspection authorities.",
    subjectType: "VEHICLE",
    requirementType: "INSPECTION",
    jurisdiction: "NATIONAL",
    mandatory: false,
    blockingPolicy: "BLOCK_RENTAL_START",
    verificationRequired: true,
    expiryRequired: true,
    warningThresholdDays: 30,
    isActive: true,
  },
  {
    code: "PSV_ROAD_LICENSE",
    name: "Commercial Transport / Road Service Permit",
    description: "Statutory transport license or carrier permit authorizing vehicle for commercial passenger carriage.",
    subjectType: "VEHICLE",
    requirementType: "PERMIT",
    jurisdiction: "NATIONAL",
    mandatory: false,
    blockingPolicy: "BLOCK_RENTAL_START",
    verificationRequired: true,
    expiryRequired: true,
    warningThresholdDays: 14,
    isActive: true,
  },
  {
    code: "SPEED_GOVERNOR_CERT",
    name: "Speed Governor Calibration Certificate",
    description: "Mandatory speed limiter inspection, telemetry calibration, and compliance certificate.",
    subjectType: "VEHICLE",
    requirementType: "CERTIFICATION",
    jurisdiction: "NATIONAL",
    mandatory: false,
    blockingPolicy: "BLOCK_HANDOVER",
    verificationRequired: true,
    expiryRequired: true,
    warningThresholdDays: 14,
    isActive: true,
  },
  {
    code: "LOGBOOK",
    name: "Vehicle Registration Logbook",
    description: "Official vehicle ownership title deed / registration book issued by national registrar.",
    subjectType: "VEHICLE",
    requirementType: "DOCUMENT",
    jurisdiction: "NATIONAL",
    mandatory: false,
    blockingPolicy: "BLOCK_ALL_NEW_OPERATIONS",
    verificationRequired: true,
    expiryRequired: false,
    warningThresholdDays: 0,
    isActive: true,
  },
  {
    code: "DRIVER_DRIVING_LICENSE",
    name: "Driver's Valid Driving License",
    description: "Official driver's license with matching class endorsement for passenger or commercial vehicles.",
    subjectType: "DRIVER",
    requirementType: "LICENCE",
    jurisdiction: "NATIONAL",
    mandatory: false,
    blockingPolicy: "BLOCK_HANDOVER",
    verificationRequired: true,
    expiryRequired: true,
    warningThresholdDays: 30,
    isActive: true,
  },
  {
    code: "DRIVER_PSV_BADGE",
    name: "PSV Driver Special Endorsement / Badge",
    description: "Commercial public service vehicle driver badge and statutory police clearance certification.",
    subjectType: "DRIVER",
    requirementType: "CERTIFICATION",
    jurisdiction: "NATIONAL",
    mandatory: false,
    blockingPolicy: "BLOCK_HANDOVER",
    verificationRequired: true,
    expiryRequired: true,
    warningThresholdDays: 30,
    isActive: true,
  },
  {
    code: "DRIVER_MEDICAL_FITNESS",
    name: "Driver Medical & Vision Fitness Certificate",
    description: "Periodic medical examination certificate certifying physical and vision fitness for commercial driving.",
    subjectType: "DRIVER",
    requirementType: "CERTIFICATION",
    jurisdiction: "NATIONAL",
    mandatory: false,
    blockingPolicy: "WARNING_ONLY",
    verificationRequired: true,
    expiryRequired: true,
    warningThresholdDays: 30,
    isActive: true,
  },
  {
    code: "NATIONAL_ID",
    name: "National Identity Card",
    description: "Government-issued National ID document for primary or designated driver/customer.",
    subjectType: "CUSTOMER",
    requirementType: "DOCUMENT",
    jurisdiction: "NATIONAL",
    mandatory: true,
    blockingPolicy: "BLOCK_HANDOVER",
    verificationRequired: true,
    expiryRequired: false,
    warningThresholdDays: 0,
    isActive: true,
  },
  {
    code: "PASSPORT",
    name: "International Travel Passport",
    description: "Valid international passport for international drivers or corporate signatories.",
    subjectType: "CUSTOMER",
    requirementType: "DOCUMENT",
    jurisdiction: "INTERNATIONAL",
    mandatory: false,
    blockingPolicy: "BLOCK_HANDOVER",
    verificationRequired: true,
    expiryRequired: true,
    warningThresholdDays: 60,
    isActive: true,
  },
];

export class ComplianceRequirementRepository implements IComplianceRequirementRepository {
  private static store = createRecordStore<string, ComplianceRequirement>("compliance-requirement.repository:store");
  private static initialized = false;

  constructor() {
    this.ensureInitialized();
  }

  private ensureInitialized(): void {
    if (ComplianceRequirementRepository.initialized) return;
    const now = new Date().toISOString();
    for (const req of CANONICAL_SYSTEM_REQUIREMENTS) {
      const id = `req-${req.code.toLowerCase().replace(/_/g, "-")}`;
      ComplianceRequirementRepository.store.set(id, {
        ...req,
        id,
        tenantId: undefined, // system wide
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    ComplianceRequirementRepository.initialized = true;
  }

  async findById(id: string, tenantId?: string): Promise<ComplianceRequirement | null> {
    const item = ComplianceRequirementRepository.store.get(id);
    if (!item) return null;
    if (item.tenantId && tenantId && item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(item.tenantId, tenantId);
    }
    return { ...item };
  }

  async findByCode(code: string, tenantId?: string): Promise<ComplianceRequirement | null> {
    const items = Array.from(ComplianceRequirementRepository.store.values()).filter(
      (r) => r.code === code && (!r.tenantId || !tenantId || r.tenantId === tenantId)
    );
    // Tenant-specific override takes precedence over platform default
    const tenantSpecific = items.find((r) => r.tenantId === tenantId);
    if (tenantSpecific) return { ...tenantSpecific };
    const platformDefault = items.find((r) => !r.tenantId);
    return platformDefault ? { ...platformDefault } : null;
  }

  async list(
    tenantId: string,
    subjectType?: ComplianceSubjectType,
    activeOnly: boolean = false
  ): Promise<ComplianceRequirement[]> {
    const all = Array.from(ComplianceRequirementRepository.store.values());
    // Filter to platform-wide requirements OR this tenant's custom requirements
    const applicable = all.filter((r) => !r.tenantId || r.tenantId === tenantId);

    // If tenant has an override with identical code, prioritize tenant's version
    const byCode = new Map<string, ComplianceRequirement>();
    for (const item of applicable) {
      if (!byCode.has(item.code) || item.tenantId === tenantId) {
        byCode.set(item.code, item);
      }
    }

    let results = Array.from(byCode.values());
    if (subjectType) {
      results = results.filter((r) => r.subjectType === subjectType);
    }
    if (activeOnly) {
      results = results.filter((r) => r.isActive);
    }
    return results.sort((a, b) => a.code.localeCompare(b.code)).map((r) => ({ ...r }));
  }

  async create(
    data: Omit<ComplianceRequirement, "id" | "createdAt" | "updatedAt" | "version">
  ): Promise<ComplianceRequirement> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const item: ComplianceRequirement = {
      ...data,
      id,
      mandatory: data.mandatory ?? true,
      blockingPolicy: data.blockingPolicy ?? "BLOCK_RENTAL_START",
      verificationRequired: data.verificationRequired ?? true,
      expiryRequired: data.expiryRequired ?? true,
      warningThresholdDays: data.warningThresholdDays ?? 30,
      isActive: data.isActive ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    ComplianceRequirementRepository.store.set(id, item);
    return { ...item };
  }

  async update(
    id: string,
    tenantId: string | undefined,
    data: Partial<ComplianceRequirement>
  ): Promise<ComplianceRequirement> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("compliance_requirements", id);
    }
    if (existing.tenantId && tenantId && existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    const updated: ComplianceRequirement = {
      ...existing,
      ...data,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };
    ComplianceRequirementRepository.store.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId?: string): Promise<void> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return;
    ComplianceRequirementRepository.store.delete(id);
  }

  // Helper for testing resets
  static _reset(): void {
    ComplianceRequirementRepository.store.clear();
    ComplianceRequirementRepository.initialized = false;
  }
}
