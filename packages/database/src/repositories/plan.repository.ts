import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PLAN REPOSITORY (SaaS Control Plane Foundation)
// ============================================================================

import type { Plan, PlanStatus, CreatePlanDto, UpdatePlanDto } from "@carhire/types";
import { UniqueConstraintViolationError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IPlanRepository {
  findById(id: string, tx?: TransactionContext): Promise<Plan | null>;
  findByCode(code: string, tx?: TransactionContext): Promise<Plan | null>;
  listAll(tx?: TransactionContext): Promise<Plan[]>;
  getAll(tx?: TransactionContext): Promise<Plan[]>;
  listActive(tx?: TransactionContext): Promise<Plan[]>;
  create(dto: CreatePlanDto, tx?: TransactionContext): Promise<Plan>;
  update(id: string, updates: UpdatePlanDto, tx?: TransactionContext): Promise<Plan>;
  archive(id: string, tx?: TransactionContext): Promise<Plan>;
}

export class PlanRepository implements IPlanRepository {
  private static store = createRecordStore<string, Plan>("plan.repository:store");

  static initializeSeed(seedPlans?: Plan[]) {
    if (seedPlans && seedPlans.length > 0) {
      seedPlans.forEach((p) => {
        this.store.set(p.id, { ...p, version: p.version ?? 1 });
      });
      return;
    }

    // Default Seed Plans if none provided
    const defaults: Plan[] = [
      {
        id: "plan-starter",
        code: "STARTER",
        name: "Starter Tier",
        description: "Essential fleet tracking, basic dispatch, and simple invoicing for small rental operators.",
        status: "ACTIVE",
        currency: "KES",
        price: 2500.0,
        monthlyPrice: 2500.0,
        annualPrice: 25000.0,
        billingInterval: "MONTHLY",
        trialDurationDays: 14,
        isPublic: true,
        sortOrder: 1,
        maxVehicles: 5,
        maxMembers: 3,
        allowCustomDomain: false,
        allowDoubleEntryLedger: false,
        allowOwnerSettlements: false,
        allowPublicWebsite: true,
        allowMpesaDaraja: true,
        features: [
          "Up to 5 Vehicles",
          "3 Team Members",
          "Public Website Booking",
          "M-Pesa STK Push Gateway",
          "Standard Inspections (OPS-001)",
        ],
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "plan-growth",
        code: "GROWTH",
        name: "Growth Tier",
        description: "Multi-branch fleet operations, owner revenue splits, and general ledger double-entry bookkeeping.",
        status: "ACTIVE",
        currency: "KES",
        price: 6500.0,
        monthlyPrice: 6500.0,
        annualPrice: 65000.0,
        billingInterval: "MONTHLY",
        trialDurationDays: 14,
        isPublic: true,
        sortOrder: 2,
        maxVehicles: 25,
        maxMembers: 10,
        allowCustomDomain: true,
        allowDoubleEntryLedger: true,
        allowOwnerSettlements: true,
        allowPublicWebsite: true,
        allowMpesaDaraja: true,
        features: [
          "Up to 25 Vehicles",
          "10 Team Members",
          "Vehicle Owner Split Settlement Statements",
          "Double-Entry General Ledger (FIN-001)",
          "Custom Subdomain & Brand Theming",
          "Multi-role Granular RBAC",
        ],
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "plan-enterprise",
        code: "ENTERPRISE",
        name: "Enterprise Pro",
        description: "Unlimited fleet scaling, multi-location cross-branch telemetry, and priority 24/7 dedicated support.",
        status: "ACTIVE",
        currency: "KES",
        price: 15000.0,
        monthlyPrice: 15000.0,
        annualPrice: 150000.0,
        billingInterval: "MONTHLY",
        trialDurationDays: 30,
        isPublic: true,
        sortOrder: 3,
        maxVehicles: 100,
        maxMembers: 50,
        allowCustomDomain: true,
        allowDoubleEntryLedger: true,
        allowOwnerSettlements: true,
        allowPublicWebsite: true,
        allowMpesaDaraja: true,
        features: [
          "Up to 100 Vehicles (Expandable)",
          "50+ Team Members",
          "Custom Apex Root Domain Mapping",
          "Audited Impersonation & Dedicated SLA",
          "Full REST API & Webhook Dispatch",
          "Automated Revenue Reconciliation",
        ],
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "plan-enterprise-plus",
        code: "ENTERPRISE_PLUS",
        name: "Enterprise Plus Dedicated",
        description: "Unlimited fleet scaling, custom SLA guarantees, multi-region failover, and dedicated solution engineering.",
        status: "ACTIVE",
        currency: "KES",
        price: 35000.0,
        monthlyPrice: 35000.0,
        annualPrice: 350000.0,
        billingInterval: "MONTHLY",
        trialDurationDays: 30,
        isPublic: false,
        sortOrder: 4,
        maxVehicles: 999999,
        maxMembers: 999999,
        allowCustomDomain: true,
        allowDoubleEntryLedger: true,
        allowOwnerSettlements: true,
        allowPublicWebsite: true,
        allowMpesaDaraja: true,
        features: [
          "Unlimited Vehicles",
          "Unlimited Team Members",
          "Dedicated Infrastructure & SLA",
          "Double-Entry General Ledger",
          "Custom Domain & White-labeling",
        ],
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    defaults.forEach((p) => {
      this.store.set(p.id, p);
    });
  }

  async findById(id: string): Promise<Plan | null> {
    const p = PlanRepository.store.get(id);
    return p ? { ...p } : null;
  }

  async findByCode(code: string): Promise<Plan | null> {
    const normalized = code.trim().toUpperCase();
    for (const plan of PlanRepository.store.values()) {
      if (plan.code.toUpperCase() === normalized) {
        return { ...plan };
      }
    }
    return null;
  }

  async listAll(): Promise<Plan[]> {
    return Array.from(PlanRepository.store.values())
      .map((p) => ({ ...p }))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  async getAll(): Promise<Plan[]> {
    return this.listAll();
  }

  async listActive(): Promise<Plan[]> {
    return Array.from(PlanRepository.store.values())
      .filter((p) => p.status === "ACTIVE")
      .map((p) => ({ ...p }))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  async create(dto: CreatePlanDto): Promise<Plan> {
    const existing = await this.findByCode(dto.code);
    if (existing) {
      throw new UniqueConstraintViolationError("code", dto.code);
    }

    const now = new Date().toISOString();
    const id = `plan-${dto.code.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
    const monthlyPrice = dto.price;
    const annualPrice = dto.billingInterval === "YEARLY" || dto.billingInterval === "ANNUAL" 
      ? dto.price 
      : dto.price * 10;

    const newPlan: Plan = {
      id,
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      description: dto.description || "",
      status: "ACTIVE",
      currency: dto.currency || "KES",
      price: dto.price,
      monthlyPrice,
      annualPrice,
      billingInterval: dto.billingInterval || "MONTHLY",
      trialDurationDays: dto.trialDurationDays ?? 14,
      isPublic: dto.isPublic ?? true,
      sortOrder: dto.sortOrder ?? (PlanRepository.store.size + 1),
      maxVehicles: dto.maxVehicles ?? 10,
      maxMembers: dto.maxMembers ?? 5,
      allowCustomDomain: dto.allowCustomDomain ?? false,
      allowDoubleEntryLedger: dto.allowDoubleEntryLedger ?? false,
      allowOwnerSettlements: dto.allowOwnerSettlements ?? false,
      allowPublicWebsite: dto.allowPublicWebsite ?? true,
      allowMpesaDaraja: dto.allowMpesaDaraja ?? true,
      features: dto.features ?? [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    PlanRepository.store.set(newPlan.id, newPlan);
    return { ...newPlan };
  }

  async update(id: string, updates: UpdatePlanDto): Promise<Plan> {
    const plan = await this.findById(id);
    if (!plan) {
      throw new RecordNotFoundError("Plan", id);
    }

    const now = new Date().toISOString();
    const updated: Plan = {
      ...plan,
      name: updates.name !== undefined ? updates.name.trim() : plan.name,
      description: updates.description !== undefined ? updates.description : plan.description,
      status: updates.status !== undefined ? updates.status : plan.status,
      price: updates.price !== undefined ? updates.price : plan.price,
      monthlyPrice: updates.price !== undefined ? updates.price : plan.monthlyPrice,
      annualPrice: updates.price !== undefined ? updates.price * 10 : plan.annualPrice,
      isPublic: updates.isPublic !== undefined ? updates.isPublic : plan.isPublic,
      sortOrder: updates.sortOrder !== undefined ? updates.sortOrder : plan.sortOrder,
      maxVehicles: updates.maxVehicles !== undefined ? updates.maxVehicles : plan.maxVehicles,
      maxMembers: updates.maxMembers !== undefined ? updates.maxMembers : plan.maxMembers,
      allowCustomDomain: updates.allowCustomDomain !== undefined ? updates.allowCustomDomain : plan.allowCustomDomain,
      allowDoubleEntryLedger: updates.allowDoubleEntryLedger !== undefined ? updates.allowDoubleEntryLedger : plan.allowDoubleEntryLedger,
      allowOwnerSettlements: updates.allowOwnerSettlements !== undefined ? updates.allowOwnerSettlements : plan.allowOwnerSettlements,
      allowPublicWebsite: updates.allowPublicWebsite !== undefined ? updates.allowPublicWebsite : plan.allowPublicWebsite,
      allowMpesaDaraja: updates.allowMpesaDaraja !== undefined ? updates.allowMpesaDaraja : plan.allowMpesaDaraja,
      features: updates.features !== undefined ? updates.features : plan.features,
      version: (plan.version || 1) + 1,
      updatedAt: now,
    };

    PlanRepository.store.set(id, updated);
    return { ...updated };
  }

  async archive(id: string): Promise<Plan> {
    return this.update(id, { status: "ARCHIVED" });
  }

  static clearStore() {
    this.store.clear();
  }
}
