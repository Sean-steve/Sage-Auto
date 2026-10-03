// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENT APPLICATION SERVICE (Sprint 21: DOM-003 §41-45)
// Domain Orchestration for Periods, Batches, Calculations, Approvals, Disputes,
// Ledger Postings, Payables and Financial Read Models
// ============================================================================

import type {
  OwnerSettlement,
  OwnerSettlementPeriod,
  OwnerSettlementBatch,
  SettlementPayable,
  OwnerSettlementStatementReadModel,
  VehicleProfitabilityItem,
  VehicleProfitabilityReportReadModel,
  ListOwnerSettlementsFilter,
  ListOwnerSettlementPeriodsFilter,
  ListSettlementPayablesFilter,
  VehicleProfitabilityQueryDto,
  VehicleOwner,
  Vehicle,
  SettledRentalRevenueComponent,
} from "@carhire/types";
import type {
  CreateOwnerSettlementPeriodDto,
  CalculateOwnerSettlementDto,
  GenerateSettlementBatchDto,
  ApproveOwnerSettlementDto,
  DisputeOwnerSettlementDto,
  ResolveSettlementDisputeDto,
  AddSettlementAdjustmentDto,
  ExecuteSettlementPayoutDto,
} from "@carhire/contracts";
import {
  IOwnerSettlementRepository,
  IOwnerSettlementPeriodRepository,
  IOwnerSettlementBatchRepository,
  IVehicleOwnerRepository,
  IVehicleOwnershipRepository,
  IVehicleRepository,
  IRentalRepository,
  IExpenseRepository,
  IAuditRepository,
  SettlementNotFoundError,
  SettlementPeriodNotFoundError,
  SettlementPeriodOverlappingError,
  SettlementDuplicatePeriodError,
  SettlementAlreadyApprovedError,
  SettlementDisputedBlockedError,
  RecordNotFoundError,
} from "@carhire/database";
import { SettlementCalculationEngine } from "../domain/settlement-calculation-engine";
import { OwnerSettlementStateMachine } from "../domain/owner-settlement-state-machine";
import { SettlementPostingContractFactory } from "../domain/settlement-posting-contract.factory";
import { LedgerService } from "../../ledger/application/ledger.service";
import type { FinanceService } from "../../finance/application/finance.service";

export interface SettlementActor {
  userId: string;
  email?: string;
}

export class OwnerSettlementsService {
  constructor(
    private readonly settlementRepo: IOwnerSettlementRepository,
    private readonly periodRepo: IOwnerSettlementPeriodRepository,
    private readonly batchRepo: IOwnerSettlementBatchRepository,
    private readonly ownerRepo: IVehicleOwnerRepository,
    private readonly ownershipRepo: IVehicleOwnershipRepository,
    private readonly vehicleRepo: IVehicleRepository,
    private readonly rentalRepo: IRentalRepository,
    private readonly expenseRepo: IExpenseRepository,
    private readonly ledgerService?: LedgerService,
    private readonly auditRepo?: IAuditRepository,
    private readonly financeService?: Pick<FinanceService, "getSettledRentalRevenueComponents">
  ) {}

  // --------------------------------------------------------------------------
  // 1. SETTLEMENT PERIOD MANAGEMENT
  // --------------------------------------------------------------------------

  async createPeriod(
    tenantId: string,
    dto: CreateOwnerSettlementPeriodDto,
    actor: SettlementActor
  ): Promise<OwnerSettlementPeriod> {
    // 1. Check for overlapping period
    const overlapping = await this.periodRepo.findOverlappingPeriod(dto.startDate, dto.endDate, tenantId);
    if (overlapping) {
      throw new SettlementPeriodOverlappingError(
        dto.startDate,
        dto.endDate,
        overlapping.periodNumber
      );
    }

    // 2. Persist period
    const period = await this.periodRepo.create({
      tenantId,
      periodType: dto.periodType,
      description: dto.description || dto.name,
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: "OPEN",
      settlementCount: 0,
      totalGrossRevenue: "0.0000",
      totalOwnerPayout: "0.0000",
      totalOperatorRevenue: "0.0000",
      totalDeductions: "0.0000",
    });

    return period;
  }

  async getPeriod(tenantId: string, id: string): Promise<OwnerSettlementPeriod> {
    const period = await this.periodRepo.findById(id, tenantId);
    if (!period) {
      throw new SettlementPeriodNotFoundError(id);
    }
    return period;
  }

  async listPeriods(
    tenantId: string,
    filter?: ListOwnerSettlementPeriodsFilter
  ): Promise<OwnerSettlementPeriod[]> {
    return this.periodRepo.listByTenant(tenantId, filter);
  }

  async closePeriod(
    tenantId: string,
    periodId: string,
    actor: SettlementActor
  ): Promise<OwnerSettlementPeriod> {
    const period = await this.getPeriod(tenantId, periodId);
    if (period.status === "CLOSED") {
      return period;
    }

    // Ensure all settlements are approved or paid
    const settlements = await this.settlementRepo.listByTenant(tenantId, { periodId });
    const pendingSettlement = settlements.find(
      (s) => s.status === "PENDING" || s.status === "CALCULATED" || s.status === "DISPUTED"
    );
    if (pendingSettlement) {
      throw new Error(
        `Cannot close period ${period.periodNumber}. Settlement ${pendingSettlement.settlementNumber} is in status ${pendingSettlement.status}.`
      );
    }

    const updated = await this.periodRepo.update(periodId, tenantId, {
      status: "CLOSED",
      closedAt: new Date().toISOString(),
    });

    return updated;
  }

  // --------------------------------------------------------------------------
  // 2. SETTLEMENT CALCULATION & RE-CALCULATION
  // --------------------------------------------------------------------------

  async calculateSettlement(
    tenantId: string,
    dto: CalculateOwnerSettlementDto,
    actor: SettlementActor
  ): Promise<OwnerSettlement> {
    // 1. Validate Owner
    const owner = await this.ownerRepo.findById(dto.ownerId, tenantId);
    if (!owner) {
      throw new RecordNotFoundError("VehicleOwner", dto.ownerId);
    }

    // 2. Resolve Period dates
    let periodStart = dto.periodStart;
    let periodEnd = dto.periodEnd;
    let periodId = dto.periodId;

    if (periodId) {
      const period = await this.periodRepo.findById(periodId, tenantId);
      if (period) {
        periodStart = period.startDate;
        periodEnd = period.endDate;
      }
    }

    if (!periodStart || !periodEnd) {
      throw new Error("Settlement period start and end dates must be provided.");
    }

    // 3. Duplicate Prevention & Immutability Check
    const existingSettlement = await this.settlementRepo.findByOwnerAndPeriod(
      dto.ownerId,
      periodStart,
      periodEnd,
      tenantId
    );

    let existingToUpdate: OwnerSettlement | null = null;

    if (existingSettlement) {
      if (
        existingSettlement.status === "APPROVED" ||
        existingSettlement.status === "PAID" ||
        existingSettlement.status === "PAYMENT_PENDING"
      ) {
        throw new SettlementDuplicatePeriodError(
          owner.name,
          `${periodStart} - ${periodEnd}`,
          existingSettlement.settlementNumber
        );
      }
      existingToUpdate = existingSettlement;
    }

    // 4. Fetch Context Data
    const ownerships = await this.ownershipRepo.findByOwnerId(dto.ownerId, tenantId);
    const { vehicles } = await this.vehicleRepo.findAll(tenantId);
    const ownerVehicleIds = new Set(ownerships.map((o) => o.vehicleId));
    const ownerVehicles = vehicles.filter((v) => ownerVehicleIds.has(v.id));

    // Fetch all tenant rentals and expenses.
    const { items: allRentals } = await this.rentalRepo.findMany(tenantId, { limit: 1000 });
    const allExpenses = await this.expenseRepo.listByTenant(tenantId);

    if (!this.financeService) {
      const err: any = new Error("Owner Settlement requires the Tenant Finance revenue read contract.");
      err.statusCode = 503;
      throw err;
    }

    // Tenant Finance is the commercial authority. Gather only settled revenue facts
    // for completed rentals in this owner's period; Settlement never re-prices a Rental.
    const candidateRentals = allRentals.filter((r) => {
      if (!ownerVehicleIds.has(r.vehicleId)) return false;
      if (!["COMPLETED", "RETURN_COMPLETED"].includes(r.state)) return false;
      const eventDate = (r.actualEnd || r.completedAt || r.scheduledEnd || r.actualStart || r.scheduledStart).split("T")[0];
      return eventDate >= periodStart && eventDate <= periodEnd;
    });

    const rentalRevenueFacts = new Map<string, SettledRentalRevenueComponent>();
    const currencies = new Set<string>();
    for (const rental of candidateRentals) {
      const fact = await this.financeService.getSettledRentalRevenueComponents(tenantId, rental.id);
      if (fact?.isPaidOrSettled) {
        rentalRevenueFacts.set(rental.id, fact);
        currencies.add(fact.currency.toUpperCase());
      }
    }

    if (rentalRevenueFacts.size === 0) {
      throw new Error(
        `No paid/settled Tenant Finance revenue facts exist for ${owner.name} in ${periodStart} to ${periodEnd}.`
      );
    }
    if (currencies.size !== 1) {
      throw new Error(
        `Owner settlement period contains multiple currencies (${Array.from(currencies).join(", ")}). Settle each currency separately.`
      );
    }
    const settlementCurrency = Array.from(currencies)[0];

    // 5. Execute Calculation via Domain Engine
    const calculation = SettlementCalculationEngine.calculate({
      owner,
      ownerships,
      vehicles: ownerVehicles,
      rentals: candidateRentals,
      rentalRevenueFacts,
      expenses: allExpenses,
      adjustments: existingToUpdate?.adjustmentLines || [],
      periodStart,
      periodEnd,
      currency: settlementCurrency,
    });

    // 6. Persist or Update Settlement Aggregate
    if (existingToUpdate) {
      OwnerSettlementStateMachine.assertCanRecalculate(existingToUpdate.status, existingToUpdate.settlementNumber);

      const updated = await this.settlementRepo.update(existingToUpdate.id, tenantId, {
        status: "CALCULATED",
        calculatedAt: new Date().toISOString(),
        calculatedBy: actor.userId,
        totalEligibleRentalRevenue: calculation.totalEligibleRentalRevenue,
        totalExcludedRevenue: calculation.totalExcludedRevenue,
        grossRevenue: calculation.grossRevenue,
        ownerGrossRevenueShare: calculation.ownerGrossRevenueShare,
        operatorGrossRevenueShare: calculation.operatorGrossRevenueShare,
        totalOwnerBorneExpenses: calculation.totalOwnerBorneExpenses,
        totalSharedExpenses: calculation.totalSharedExpenses,
        totalDeductions: calculation.totalDeductions,
        totalAdjustments: calculation.totalAdjustments,
        netPayoutAmount: calculation.netPayoutAmount,
        operatorNetRevenue: calculation.operatorNetRevenue,
        carriedForwardBalance: calculation.carriedForwardBalance,
        termsSnapshot: calculation.termsSnapshot,
        rentalLines: calculation.rentalLines,
        expenseLines: calculation.expenseLines,
        adjustmentLines: calculation.adjustmentLines,
      });

      return updated;
    }

    // Create New Settlement
    const created = await this.settlementRepo.create({
      tenantId,
      ownerId: dto.ownerId,
      ownerName: owner.name,
      periodId,
      periodStart,
      periodEnd,
      currency: settlementCurrency,
      status: "CALCULATED",
      calculatedAt: new Date().toISOString(),
      calculatedBy: actor.userId,
      totalEligibleRentalRevenue: calculation.totalEligibleRentalRevenue,
      totalExcludedRevenue: calculation.totalExcludedRevenue,
      grossRevenue: calculation.grossRevenue,
      ownerGrossRevenueShare: calculation.ownerGrossRevenueShare,
      operatorGrossRevenueShare: calculation.operatorGrossRevenueShare,
      totalOwnerBorneExpenses: calculation.totalOwnerBorneExpenses,
      totalSharedExpenses: calculation.totalSharedExpenses,
      totalDeductions: calculation.totalDeductions,
      totalAdjustments: calculation.totalAdjustments,
      netPayoutAmount: calculation.netPayoutAmount,
      operatorNetRevenue: calculation.operatorNetRevenue,
      carriedForwardBalance: calculation.carriedForwardBalance,
      termsSnapshot: calculation.termsSnapshot,
      rentalLines: calculation.rentalLines,
      expenseLines: calculation.expenseLines,
      adjustmentLines: calculation.adjustmentLines,
    });

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OWNER_SETTLEMENT_CALCULATED",
      resourceType: "OWNER_SETTLEMENT",
      resourceId: created.id,
      description: `Calculated ${created.settlementNumber} from settled Finance facts and historical ownership terms`,
      payload: {
        ownerId: created.ownerId,
        periodStart: created.periodStart,
        periodEnd: created.periodEnd,
        netPayoutAmount: created.netPayoutAmount,
      },
    });

    return created;
  }

  // --------------------------------------------------------------------------
  // 3. IDEMPOTENT SETTLEMENT BATCH GENERATION
  // --------------------------------------------------------------------------

  async listBatches(
    tenantId: string,
    periodId?: string
  ): Promise<OwnerSettlementBatch[]> {
    return this.batchRepo.listByTenant(tenantId, periodId);
  }

  async generateBatch(
    tenantId: string,
    dto: GenerateSettlementBatchDto,
    actor: SettlementActor
  ): Promise<{ batch: OwnerSettlementBatch; settlements: OwnerSettlement[] }> {
    // 1. Idempotency Check
    const existingBatch = await this.batchRepo.findByIdempotencyKey(dto.idempotencyKey, tenantId);
    if (existingBatch) {
      const existingSettlements = await this.settlementRepo.listByTenant(tenantId, {
        periodId: existingBatch.periodId,
      });
      return { batch: existingBatch, settlements: existingSettlements };
    }

    // 2. Validate Period
    const period = await this.getPeriod(tenantId, dto.periodId);
    if (period.status === "CLOSED") {
      throw new Error(`Cannot generate batch for closed period ${period.periodNumber}.`);
    }

    // Update Period to SETTLING
    await this.periodRepo.update(period.id, tenantId, { status: "SETTLING" });

    // 3. Fetch all active vehicle owners
    const { owners } = await this.ownerRepo.findAll(tenantId, { status: "ACTIVE" } as any);
    const targetOwners = dto.ownerIds && dto.ownerIds.length > 0
      ? owners.filter((o) => dto.ownerIds!.includes(o.id))
      : owners;

    const generatedSettlements: OwnerSettlement[] = [];

    // 4. Calculate for each owner
    for (const owner of targetOwners) {
      try {
        const settlement = await this.calculateSettlement(
          tenantId,
          {
            ownerId: owner.id,
            periodId: period.id,
            periodStart: period.startDate,
            periodEnd: period.endDate,
          },
          actor
        );
        generatedSettlements.push(settlement);
      } catch (err: any) {
        // Log & proceed if owner had no rentals or valid agreement
        console.warn(`[SettlementBatch] Skipping owner ${owner.id}:`, err.message);
      }
    }

    // 5. Aggregate Batch Totals
    let totalEligible = 0;
    let totalOwner = 0;
    let totalOperator = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const s of generatedSettlements) {
      totalEligible += parseFloat(s.totalEligibleRentalRevenue || "0");
      totalOwner += parseFloat(s.ownerGrossRevenueShare || "0");
      totalOperator += parseFloat(s.operatorGrossRevenueShare || "0");
      totalDeductions += parseFloat(String(s.totalDeductions || "0"));
      totalNet += parseFloat(String(s.netPayoutAmount || "0"));
    }

    // 6. Persist Batch
    const batch = await this.batchRepo.create({
      tenantId,
      periodId: period.id,
      status: "COMPLETED",
      idempotencyKey: dto.idempotencyKey,
      totalSettlements: generatedSettlements.length,
      totalEligibleRevenue: totalEligible.toFixed(4),
      totalOwnerShare: totalOwner.toFixed(4),
      totalOperatorShare: totalOperator.toFixed(4),
      totalDeductions: totalDeductions.toFixed(4),
      totalNetPayout: totalNet.toFixed(4),
      currency: period.settlementCount > 0 ? "KES" : "KES",
      initiatedBy: actor.userId,
    });

    // 7. Update Period totals
    await this.periodRepo.update(period.id, tenantId, {
      settlementCount: generatedSettlements.length,
      totalGrossRevenue: totalEligible.toFixed(4),
      totalOwnerPayout: totalNet.toFixed(4),
      totalOperatorRevenue: totalOperator.toFixed(4),
      totalDeductions: totalDeductions.toFixed(4),
    });

    return { batch, settlements: generatedSettlements };
  }

  // --------------------------------------------------------------------------
  // 4. APPROVAL WORKFLOW & FINANCIAL IMMUTABILITY
  // --------------------------------------------------------------------------

  async approveSettlement(
    tenantId: string,
    settlementId: string,
    dto: ApproveOwnerSettlementDto,
    actor: SettlementActor
  ): Promise<OwnerSettlement> {
    const settlement = await this.settlementRepo.findById(settlementId, tenantId);
    if (!settlement) {
      throw new SettlementNotFoundError(settlementId);
    }

    if (settlement.status === "APPROVED") {
      throw new SettlementAlreadyApprovedError(settlement.settlementNumber);
    }
    if (settlement.status === "DISPUTED") {
      throw new SettlementDisputedBlockedError(settlement.settlementNumber, "approval");
    }
    if (settlement.calculatedBy && settlement.calculatedBy === actor.userId) {
      const err: any = new Error("Settlement approval requires a different authorized user from the calculator.");
      err.code = "SEPARATION_OF_DUTIES";
      err.statusCode = 409;
      throw err;
    }

    OwnerSettlementStateMachine.assertTransition(settlement.status, "APPROVED", settlement.settlementNumber);

    const approvedAt = new Date().toISOString();

    // 1. Transition Settlement to APPROVED
    const updated = await this.settlementRepo.update(settlementId, tenantId, {
      status: "APPROVED",
      approvedAt,
      approvedBy: actor.userId,
      notes: dto.approvalNotes,
    });

    // 2. Create Payable Obligation
    const owner = await this.ownerRepo.findById(settlement.ownerId, tenantId);
    const recipientName = owner?.companyName || owner?.name || settlement.ownerName || "Vehicle Owner";
    const payoutMethod = (dto.payoutMethod as any) || (owner?.payoutMpesaNumber ? "MPESA_B2C" : "BANK_TRANSFER");
    const netAmountStr = String(settlement.netPayoutAmount);

    await this.settlementRepo.createPayable({
      tenantId,
      settlementId: settlement.id,
      ownerId: settlement.ownerId,
      payableNumber: `PAY-${settlement.settlementNumber}`,
      amount: netAmountStr,
      currency: settlement.currency,
      recipientName,
      payoutMethod,
      destinationBank: owner?.payoutBank,
      destinationAccount: owner?.payoutAccountNumber,
      destinationMpesaNumber: owner?.payoutMpesaNumber,
      taxWithholdingAmount: "0.0000",
      netDisbursementAmount: netAmountStr,
      status: "PENDING",
      retryCount: 0,
      createdBy: actor.userId,
    });

    // 3. Post to General Ledger (Debit 5100, Credit 2150, Credit 5110)
    if (this.ledgerService) {
      try {
        const postingContract = SettlementPostingContractFactory.createApprovalPosting(updated);
        await this.ledgerService.postFromSourceContract(tenantId, postingContract, actor);
      } catch (ledgerErr: any) {
        console.error(`[OwnerSettlement] Ledger posting failed for ${settlement.settlementNumber}:`, ledgerErr.message);
      }
    }

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OWNER_SETTLEMENT_APPROVED",
      resourceType: "OWNER_SETTLEMENT",
      resourceId: updated.id,
      description: `Approved ${updated.settlementNumber}; payable obligation created`,
      payload: { ownerId: updated.ownerId, netPayoutAmount: updated.netPayoutAmount },
    });

    return updated;
  }

  // --------------------------------------------------------------------------
  // 5. DISPUTE & ADJUSTMENT WORKFLOW
  // --------------------------------------------------------------------------

  async disputeSettlement(
    tenantId: string,
    settlementId: string,
    dto: DisputeOwnerSettlementDto,
    actor: SettlementActor
  ): Promise<OwnerSettlement> {
    const settlement = await this.settlementRepo.findById(settlementId, tenantId);
    if (!settlement) {
      throw new SettlementNotFoundError(settlementId);
    }

    if (settlement.status === "PAID") {
      throw new Error(`Cannot dispute paid settlement ${settlement.settlementNumber}.`);
    }

    OwnerSettlementStateMachine.assertTransition(settlement.status, "DISPUTED", settlement.settlementNumber);

    const updated = await this.settlementRepo.update(settlementId, tenantId, {
      status: "DISPUTED",
      disputedAt: new Date().toISOString(),
      disputedBy: actor.userId,
      disputeReason: dto.reason || dto.disputeReason || "Disputed by owner",
    });

    return updated;
  }

  async resolveDispute(
    tenantId: string,
    settlementId: string,
    dto: ResolveSettlementDisputeDto,
    actor: SettlementActor
  ): Promise<OwnerSettlement> {
    const settlement = await this.settlementRepo.findById(settlementId, tenantId);
    if (!settlement) {
      throw new SettlementNotFoundError(settlementId);
    }

    if (settlement.status !== "DISPUTED") {
      throw new Error(`Settlement ${settlement.settlementNumber} is not under dispute.`);
    }

    const notes = dto.resolutionNotes || dto.disputeResolutionNotes || "Dispute resolved";

    // If adjustment was specified, add it
    if (dto.adjustmentAmount && parseFloat(dto.adjustmentAmount) > 0) {
      await this.settlementRepo.addAdjustment(settlementId, tenantId, {
        type: dto.adjustmentType || "DISPUTE_SETTLEMENT",
        amount: dto.adjustmentAmount,
        currency: settlement.currency,
        reason: dto.adjustmentReason || `Dispute Resolution: ${notes}`,
        createdBy: actor.userId,
      });
    }

    // Recalculate settlement with the adjustment
    const refreshed = await this.calculateSettlement(
      tenantId,
      {
        ownerId: settlement.ownerId,
        periodId: settlement.periodId,
        periodStart: settlement.periodStart,
        periodEnd: settlement.periodEnd,
      },
      actor
    );

    // Dispute resolution returns the settlement to CALCULATED. Approval is a
    // separate four-eyes command and is the only path that creates a payable.
    const resolved = await this.settlementRepo.update(refreshed.id, tenantId, {
      status: "CALCULATED",
      disputeResolvedAt: new Date().toISOString(),
      disputeResolutionNotes: notes,
      approvedAt: undefined,
      approvedBy: undefined,
    });

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OWNER_SETTLEMENT_DISPUTE_RESOLVED",
      resourceType: "OWNER_SETTLEMENT",
      resourceId: resolved.id,
      description: `Resolved dispute for ${resolved.settlementNumber}; returned to CALCULATED for independent approval`,
      payload: { resolutionNotes: notes },
    });

    return resolved;
  }

  async addAdjustment(
    tenantId: string,
    settlementId: string,
    dto: AddSettlementAdjustmentDto,
    actor: SettlementActor
  ): Promise<OwnerSettlement> {
    const settlement = await this.settlementRepo.findById(settlementId, tenantId);
    if (!settlement) {
      throw new SettlementNotFoundError(settlementId);
    }

    if (settlement.status === "APPROVED" || settlement.status === "PAYMENT_PENDING" || settlement.status === "PAID") {
      throw new Error(`Cannot add adjustments to finalized settlement ${settlement.settlementNumber}.`);
    }

    await this.settlementRepo.addAdjustment(settlementId, tenantId, {
      type: (dto.type || dto.adjustmentType)!,
      amount: dto.amount,
      currency: settlement.currency,
      reason: dto.reason,
      createdBy: actor.userId,
    });

    // Recalculate settlement
    return this.calculateSettlement(
      tenantId,
      {
        ownerId: settlement.ownerId,
        periodId: settlement.periodId,
        periodStart: settlement.periodStart,
        periodEnd: settlement.periodEnd,
      },
      actor
    );
  }

  // --------------------------------------------------------------------------
  // 6. PAYOUT EXECUTION & PAYMENT BOUNDARY
  // --------------------------------------------------------------------------

  async executePayout(
    tenantId: string,
    settlementId: string,
    _dto: ExecuteSettlementPayoutDto,
    _actor: SettlementActor
  ): Promise<OwnerSettlement> {
    const settlement = await this.settlementRepo.findById(settlementId, tenantId);
    if (!settlement) {
      throw new SettlementNotFoundError(settlementId);
    }
    const err: any = new Error(
      "Direct settlement payout is disabled. Execute the approved payable through the Payments provider boundary."
    );
    err.code = "SETTLEMENT_PAYOUT_REQUIRES_PAYMENT_PROVIDER";
    err.statusCode = 409;
    throw err;
  }

  async listPayables(
    tenantId: string,
    filter?: ListSettlementPayablesFilter
  ): Promise<SettlementPayable[]> {
    return this.settlementRepo.listPayables(tenantId, filter);
  }

  // --------------------------------------------------------------------------
  // 7. STATEMENTS & VEHICLE PROFITABILITY READ MODELS
  // --------------------------------------------------------------------------

  private async resolveOwnerSelf(tenantId: string, actor: SettlementActor): Promise<VehicleOwner> {
    if (!actor.email) {
      const err: any = new Error("Vehicle Owner self-service requires a linked membership email.");
      err.statusCode = 403;
      throw err;
    }
    const owner = await this.ownerRepo.findByEmail(actor.email, tenantId);
    if (!owner) {
      const err: any = new Error("No Vehicle Owner record is linked to this user.");
      err.statusCode = 403;
      throw err;
    }
    return owner;
  }

  async listMySettlements(tenantId: string, actor: SettlementActor): Promise<OwnerSettlement[]> {
    const owner = await this.resolveOwnerSelf(tenantId, actor);
    return this.settlementRepo.listByTenant(tenantId, { ownerId: owner.id });
  }

  async getMyStatement(
    tenantId: string,
    settlementId: string,
    actor: SettlementActor
  ): Promise<OwnerSettlementStatementReadModel> {
    const owner = await this.resolveOwnerSelf(tenantId, actor);
    const settlement = await this.getSettlement(tenantId, settlementId);
    if (settlement.ownerId !== owner.id) {
      const err: any = new Error("Forbidden: Settlement does not belong to the linked Vehicle Owner.");
      err.statusCode = 403;
      throw err;
    }
    return this.getStatement(tenantId, settlementId);
  }

  async disputeMySettlement(
    tenantId: string,
    settlementId: string,
    reason: string,
    actor: SettlementActor
  ): Promise<OwnerSettlement> {
    const owner = await this.resolveOwnerSelf(tenantId, actor);
    const settlement = await this.getSettlement(tenantId, settlementId);
    if (settlement.ownerId !== owner.id) {
      const err: any = new Error("Forbidden: Settlement does not belong to the linked Vehicle Owner.");
      err.statusCode = 403;
      throw err;
    }
    return this.disputeSettlement(tenantId, settlementId, { reason }, actor);
  }

  async getSettlement(tenantId: string, id: string): Promise<OwnerSettlement> {
    const settlement = await this.settlementRepo.findById(id, tenantId);
    if (!settlement) {
      throw new SettlementNotFoundError(id);
    }
    return settlement;
  }

  async listSettlements(
    tenantId: string,
    filter?: ListOwnerSettlementsFilter
  ): Promise<OwnerSettlement[]> {
    return this.settlementRepo.listByTenant(tenantId, filter);
  }

  async getStatement(
    tenantId: string,
    settlementId: string
  ): Promise<OwnerSettlementStatementReadModel> {
    const settlement = await this.getSettlement(tenantId, settlementId);
    const owner = await this.ownerRepo.findById(settlement.ownerId, tenantId);

    // Group rental lines by vehicle for breakdown
    const vehicleTotals = new Map<
      string,
      { plate: string; eligibleRevenue: number; ownerShare: number; deductionTotal: number }
    >();

    for (const rl of settlement.rentalLines || []) {
      const existing = vehicleTotals.get(rl.vehicleId) || {
        plate: rl.vehiclePlate,
        eligibleRevenue: 0,
        ownerShare: 0,
        deductionTotal: 0,
      };
      existing.eligibleRevenue += parseFloat(rl.totalRentalRevenue);
      existing.ownerShare += parseFloat(rl.ownerShareAmount);
      vehicleTotals.set(rl.vehicleId, existing);
    }

    for (const el of settlement.expenseLines || []) {
      const existing = vehicleTotals.get(el.vehicleId) || {
        plate: el.vehiclePlate,
        eligibleRevenue: 0,
        ownerShare: 0,
        deductionTotal: 0,
      };
      existing.deductionTotal += parseFloat(el.ownerDeductionAmount);
      vehicleTotals.set(el.vehicleId, existing);
    }

    const vehicleBreakdown = Array.from(vehicleTotals.entries()).map(([vehicleId, item]) => ({
      vehicleId,
      registrationPlate: item.plate,
      eligibleRevenue: item.eligibleRevenue.toFixed(4),
      ownerGrossShare: item.ownerShare.toFixed(4),
      deductions: item.deductionTotal.toFixed(4),
      netContribution: (item.ownerShare - item.deductionTotal).toFixed(4),
    }));

    return {
      settlementNumber: settlement.settlementNumber,
      statementDate: new Date().toISOString(),
      period: {
        startDate: settlement.periodStart,
        endDate: settlement.periodEnd,
      },
      owner: {
        id: settlement.ownerId,
        name: owner?.name || settlement.ownerName || "Unknown Owner",
        companyName: owner?.companyName,
        email: owner?.email || "",
        phone: owner?.phone || "",
        taxPin: owner?.taxPinNumber,
        payoutBank: owner?.payoutBank,
        payoutAccountNumber: owner?.payoutAccountNumber,
        payoutMpesaNumber: owner?.payoutMpesaNumber,
      },
      commercialTerms: settlement.termsSnapshot || {
        ownershipId: "terms",
        ownershipType: "THIRD_PARTY_OWNED",
        revenueSharePercent: 75,
        allowableExpenseDeductions: true,
        termsVersion: 1,
        agreementStartDate: settlement.periodStart,
      },
      currency: settlement.currency,
      financialSummary: {
        totalEligibleRentalRevenue: settlement.totalEligibleRentalRevenue || "0.0000",
        totalExcludedRevenue: settlement.totalExcludedRevenue || "0.0000",
        grossRevenue: settlement.grossRevenue || "0.0000",
        ownerGrossShare: settlement.ownerGrossRevenueShare || "0.0000",
        operatorGrossShare: settlement.operatorGrossRevenueShare || "0.0000",
        totalDeductions: String(settlement.totalDeductions || "0.0000"),
        totalAdjustments: settlement.totalAdjustments || "0.0000",
        netPayoutAmount: String(settlement.netPayoutAmount || "0.0000"),
      },
      rentalBreakdown: settlement.rentalLines || [],
      expenseDeductions: settlement.expenseLines || [],
      adjustments: settlement.adjustmentLines || [],
      vehicleBreakdown,
      paymentStatus: {
        status: settlement.status,
        approvedAt: settlement.approvedAt,
        paidAt: settlement.paidAt,
        payoutReference: settlement.payoutReference,
        payoutMethod: settlement.payoutMethod,
      },
    };
  }

  async getVehicleProfitability(
    tenantId: string,
    query: VehicleProfitabilityQueryDto
  ): Promise<VehicleProfitabilityReportReadModel> {
    const { vehicles } = await this.vehicleRepo.findAll(tenantId);
    const settlements = await this.settlementRepo.listByTenant(tenantId, {
      fromDate: query.startDate,
      toDate: query.endDate,
    });
    const allExpenses = await this.expenseRepo.listByTenant(tenantId, {
      fromDate: query.startDate,
      toDate: query.endDate,
    });

    const targetVehicles = query.vehicleId
      ? vehicles.filter((v) => v.id === query.vehicleId)
      : vehicles;

    const items: VehicleProfitabilityItem[] = [];

    let reportRentalRevenue = 0;
    let reportOwnerPayouts = 0;
    let reportMaintenance = 0;
    let reportOtherExpenses = 0;
    let reportNetProfit = 0;

    for (const v of targetVehicles) {
      // Aggregate rental lines from settlements
      let grossRevenue = 0;
      let ownerPayouts = 0;
      let rentalDays = 0;

      for (const s of settlements) {
        for (const rl of s.rentalLines || []) {
          if (rl.vehicleId === v.id) {
            grossRevenue += parseFloat(rl.totalRentalRevenue);
            ownerPayouts += parseFloat(rl.ownerShareAmount);
            rentalDays += rl.eligibleDays;
          }
        }
      }

      // Aggregate direct expenses
      let maintenanceExpenses = 0;
      let otherExpenses = 0;

      const vehicleExpenses = allExpenses.filter((e) => e.vehicleId === v.id);
      for (const exp of vehicleExpenses) {
        const amt = parseFloat(exp.grossAmount);
        if (exp.category === "MAINTENANCE") {
          maintenanceExpenses += amt;
        } else {
          otherExpenses += amt;
        }
      }

      const totalDirectExpenses = maintenanceExpenses + otherExpenses;
      const netProfit = grossRevenue - ownerPayouts - totalDirectExpenses;
      const profitMarginPercent = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

      // Calculate days in period
      const sDate = new Date(query.startDate);
      const eDate = new Date(query.endDate);
      const periodDays = Math.max(1, Math.ceil((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)));
      const utilizationRate = Math.min(100, Math.round((rentalDays / periodDays) * 100));

      items.push({
        vehicleId: v.id,
        registrationPlate: v.registrationPlate,
        make: v.make,
        model: v.model,
        ownershipType: (v as any).ownershipType || "THIRD_PARTY_OWNED",
        ownerName: (v as any).ownerName || "Third-Party Owner",
        grossRentalRevenue: grossRevenue.toFixed(4),
        ownerPayouts: ownerPayouts.toFixed(4),
        maintenanceExpenses: maintenanceExpenses.toFixed(4),
        otherExpenses: otherExpenses.toFixed(4),
        netProfit: netProfit.toFixed(4),
        profitMarginPercent: Math.round(profitMarginPercent * 100) / 100,
        rentalDays,
        utilizationRate,
        currency: "KES",
      });

      reportRentalRevenue += grossRevenue;
      reportOwnerPayouts += ownerPayouts;
      reportMaintenance += maintenanceExpenses;
      reportOtherExpenses += otherExpenses;
      reportNetProfit += netProfit;
    }

    const overallMargin = reportRentalRevenue > 0 ? (reportNetProfit / reportRentalRevenue) * 100 : 0;

    return {
      periodStart: query.startDate,
      periodEnd: query.endDate,
      currency: "KES",
      items,
      summary: {
        totalVehicles: items.length,
        totalGrossRentalRevenue: reportRentalRevenue.toFixed(4),
        totalOwnerPayouts: reportOwnerPayouts.toFixed(4),
        totalMaintenanceExpenses: reportMaintenance.toFixed(4),
        totalOtherExpenses: reportOtherExpenses.toFixed(4),
        totalNetProfit: reportNetProfit.toFixed(4),
        averageProfitMarginPercent: Math.round(overallMargin * 100) / 100,
      },
    };
  }
}
