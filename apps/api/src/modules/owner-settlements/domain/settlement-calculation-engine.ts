// ============================================================================
// CAR HIRE OS — SETTLEMENT CALCULATION ENGINE (Sprint 21: DOM-003 §41-45)
// Exact 4-Decimal Scaled Arithmetic, Historical Commercial Terms Resolution,
// Revenue Sharing, Excluded Revenue Separation, and Expense Allocation
// ============================================================================

import type {
  VehicleOwner,
  VehicleOwnership,
  Vehicle,
  Rental,
  OperationalExpense,
  OwnerSettlementRentalLine,
  OwnerSettlementExpenseLine,
  OwnerSettlementAdjustmentLine,
  OwnerSettlementTermsSnapshot,
  SettledRentalRevenueComponent,
  Money,
} from "@carhire/types";
import {
  createMoney,
  toScaledBigInt,
  fromScaledBigInt,
  addMoney,
  subtractMoney,
  multiplyMoney,
} from "@carhire/utils";

export interface CalculationInput {
  owner: VehicleOwner;
  ownerships: VehicleOwnership[];
  vehicles: Vehicle[];
  rentals: Rental[];
  rentalRevenueFacts: Map<string, SettledRentalRevenueComponent>;
  expenses: OperationalExpense[];
  adjustments?: Array<Omit<OwnerSettlementAdjustmentLine, "id" | "settlementId" | "createdAt">>;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  currency: string;
}

export interface CalculationResult {
  totalEligibleRentalRevenue: string; // NUMERIC(19,4)
  totalExcludedRevenue: string;
  grossRevenue: string;
  ownerGrossRevenueShare: string;
  operatorGrossRevenueShare: string;
  totalOwnerBorneExpenses: string;
  totalSharedExpenses: string;
  totalDeductions: string;
  totalAdjustments: string;
  netPayoutAmount: string;
  operatorNetRevenue: string;
  carriedForwardBalance: string;
  termsSnapshot: OwnerSettlementTermsSnapshot;
  termsSnapshots: OwnerSettlementTermsSnapshot[];
  rentalLines: OwnerSettlementRentalLine[];
  expenseLines: OwnerSettlementExpenseLine[];
  adjustmentLines: OwnerSettlementAdjustmentLine[];
}

export class SettlementCalculationEngine {
  /**
   * Resolves the historical VehicleOwnership term effective during the rental period.
   * CRITICAL INVARIANT: Settlement MUST use the ownership agreement that governed the
   * rental event date, NOT the latest/currently active agreement.
   */
  static resolveHistoricalOwnership(
    vehicleId: string,
    ownerId: string,
    eventDate: string,
    ownerships: VehicleOwnership[]
  ): VehicleOwnership | null {
    // 1. Look for contract bounded by startDate and endDate
    const matching = ownerships.find(
      (o) =>
        o.vehicleId === vehicleId &&
        o.ownerId === ownerId &&
        o.startDate <= eventDate &&
        (!o.endDate || o.endDate >= eventDate)
    );
    // Historical settlement authority is strict: current or arbitrary terms
    // must never substitute for the agreement that governed the rental event.
    return matching || null;
  }

  /**
   * Executes the full deterministic settlement calculation
   */
  static calculate(input: CalculationInput): CalculationResult {
    const currency = input.currency.toUpperCase();
    const zeroMoney = createMoney("0.0000", currency);

    // 1. Resolve Primary Commercial Terms Snapshot
    const primaryOwnership = input.ownerships.find(
      (o) =>
        o.ownerId === input.owner.id &&
        o.startDate <= input.periodEnd &&
        (!o.endDate || o.endDate >= input.periodStart)
    );

    if (!primaryOwnership) {
      throw new Error(
        `No historical ownership agreement covers settlement period ${input.periodStart} to ${input.periodEnd} for owner ${input.owner.id}.`
      );
    }

    const unsupportedFixedTerms = input.ownerships.find(
      (o) =>
        o.ownerId === input.owner.id &&
        o.startDate <= input.periodEnd &&
        (!o.endDate || o.endDate >= input.periodStart) &&
        o.fixedMonthlyPayout != null
    );
    if (unsupportedFixedTerms) {
      throw new Error(
        `Ownership agreement ${unsupportedFixedTerms.id} uses fixedMonthlyPayout. A fixed/minimum/tier settlement strategy must be explicitly modeled before calculation; percentage revenue share cannot be substituted.`
      );
    }

    const termsSnapshot: OwnerSettlementTermsSnapshot = {
      ownershipId: primaryOwnership.id,
      ownershipType: primaryOwnership.ownershipType,
      revenueSharePercent: Number(primaryOwnership.revenueSharePercent),
      fixedMonthlyPayout:
        primaryOwnership.fixedMonthlyPayout != null
          ? String(primaryOwnership.fixedMonthlyPayout)
          : undefined,
      allowableExpenseDeductions: primaryOwnership.allowableExpenseDeductions,
      termsVersion: primaryOwnership.version || 1,
      agreementStartDate: primaryOwnership.startDate,
      agreementEndDate: primaryOwnership.endDate || undefined,
    };

    const termsSnapshots: OwnerSettlementTermsSnapshot[] = input.ownerships
      .filter(
        (o) =>
          o.ownerId === input.owner.id &&
          o.startDate <= input.periodEnd &&
          (!o.endDate || o.endDate >= input.periodStart)
      )
      .map((o) => ({
        ownershipId: o.id,
        ownershipType: o.ownershipType,
        revenueSharePercent: Number(o.revenueSharePercent),
        fixedMonthlyPayout:
          o.fixedMonthlyPayout != null ? String(o.fixedMonthlyPayout) : undefined,
        allowableExpenseDeductions: o.allowableExpenseDeductions,
        termsVersion: o.version || 1,
        agreementStartDate: o.startDate,
        agreementEndDate: o.endDate || undefined,
      }));

    // 2. Process Rental Lines
    const rentalLines: OwnerSettlementRentalLine[] = [];
    let totalEligibleRevenueMoney = zeroMoney;
    let totalExcludedRevenueMoney = zeroMoney;
    let totalGrossRevenueMoney = zeroMoney;
    let totalOwnerShareMoney = zeroMoney;
    let totalOperatorShareMoney = zeroMoney;

    const ownedVehicleIds = new Set(input.vehicles.map((v) => v.id));

    // Only completed rentals backed by settled Finance facts are eligible for owner payout.
    const eligibleRentals = input.rentals.filter((r) => {
      if (!ownedVehicleIds.has(r.vehicleId)) return false;
      if (!["COMPLETED", "RETURN_COMPLETED"].includes(r.state)) return false;
      const rentalDate = (r.actualEnd || r.completedAt || r.scheduledEnd || r.actualStart || r.scheduledStart).split("T")[0];
      const financeFact = input.rentalRevenueFacts.get(r.id);
      return (
        rentalDate >= input.periodStart &&
        rentalDate <= input.periodEnd &&
        Boolean(financeFact?.isPaidOrSettled)
      );
    });

    for (let i = 0; i < eligibleRentals.length; i++) {
      const rental = eligibleRentals[i];
      const vehicle = input.vehicles.find((v) => v.id === rental.vehicleId);
      const vehiclePlate = vehicle?.registrationPlate || "UNKNOWN-PLATE";

      const startIso = rental.actualStart || rental.scheduledStart;
      const endIso = rental.actualEnd || rental.completedAt || rental.scheduledEnd;
      const rentalStartDateStr = startIso.split("T")[0];
      const rentalEndDateStr = endIso.split("T")[0];

      // Historical agreement resolution for this exact rental event
      const historicalOwnership = this.resolveHistoricalOwnership(
        rental.vehicleId,
        input.owner.id,
        rentalStartDateStr,
        input.ownerships
      );

      if (!historicalOwnership) {
        throw new Error(
          `Missing historical ownership terms for vehicle ${rental.vehicleId} on rental ${rental.rentalNumber} (${rentalStartDateStr}).`
        );
      }
      const splitPercent = Number(historicalOwnership.revenueSharePercent);

      // Finance is the commercial authority. Settlement never re-prices a rental
      // and never invents a fallback daily rate.
      const financeFact = input.rentalRevenueFacts.get(rental.id);
      if (!financeFact || !financeFact.isPaidOrSettled) {
        throw new Error(
          `Rental ${rental.rentalNumber} has no settled Finance revenue fact and cannot enter owner settlement.`
        );
      }
      if (financeFact.currency.toUpperCase() !== currency) {
        throw new Error(
          `Settlement currency ${currency} does not match invoice ${financeFact.invoiceNumber} currency ${financeFact.currency}.`
        );
      }

      const baseAmountNum =
        Number(financeFact.baseRentalGross) + Number(financeFact.extensionsGross);
      const excessMileageNum = Number(financeFact.excessMileageGross);
      const eligibleAmountNum = baseAmountNum + excessMileageNum;
      const totalGrossNum = Number(financeFact.totalGross);
      const nonShareableAmountNum = Math.max(0, totalGrossNum - eligibleAmountNum);

      const baseMoney = createMoney(baseAmountNum, currency);
      const excessMileageMoney = createMoney(excessMileageNum, currency);
      const eligibleRentalMoney = addMoney(baseMoney, excessMileageMoney);
      const nonShareableMoney = createMoney(nonShareableAmountNum, currency);

      // Revenue share calculations using exact BigInt math
      const ownerShareMoney = multiplyMoney(eligibleRentalMoney, splitPercent / 100);
      const operatorShareMoney = subtractMoney(eligibleRentalMoney, ownerShareMoney);

      totalEligibleRevenueMoney = addMoney(totalEligibleRevenueMoney, eligibleRentalMoney);
      totalExcludedRevenueMoney = addMoney(totalExcludedRevenueMoney, nonShareableMoney);
      totalGrossRevenueMoney = addMoney(totalGrossRevenueMoney, addMoney(eligibleRentalMoney, nonShareableMoney));
      totalOwnerShareMoney = addMoney(totalOwnerShareMoney, ownerShareMoney);
      totalOperatorShareMoney = addMoney(totalOperatorShareMoney, operatorShareMoney);

      // Calculate duration days
      const sDate = new Date(startIso);
      const eDate = new Date(endIso);
      const diffDays = Math.max(1, Math.ceil((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)));

      rentalLines.push({
        id: `srl_${Date.now()}_${i}`,
        settlementId: "",
        rentalId: rental.id,
        contractId: rental.contractId,
        bookingId: rental.bookingId,
        vehicleId: rental.vehicleId,
        vehiclePlate,
        rentalNumber: rental.rentalNumber || `RENT-${rental.id.slice(-6)}`,
        rentalStartDate: startIso,
        rentalEndDate: endIso,
        eligibleDays: diffDays,
        invoiceId: financeFact.invoiceId,
        invoiceNumber: financeFact.invoiceNumber,
        financeSourceSettled: financeFact.isPaidOrSettled,
        baseRentalRevenue: baseMoney.amount,
        excessMileageRevenue: excessMileageMoney.amount,
        totalRentalRevenue: eligibleRentalMoney.amount,
        nonShareableRevenue: nonShareableMoney.amount,
        ownershipId: historicalOwnership?.id || termsSnapshot.ownershipId,
        revenueSharePercent: splitPercent,
        ownerShareAmount: ownerShareMoney.amount,
        operatorShareAmount: operatorShareMoney.amount,
        sortOrder: i,
      });
    }

    // 3. Process Expense Lines & Deductions
    const expenseLines: OwnerSettlementExpenseLine[] = [];
    let totalOwnerBorneMoney = zeroMoney;
    let totalSharedExpenseMoney = zeroMoney;
    let totalDeductionsMoney = zeroMoney;

    const allowableExpenses = input.expenses.filter((e) => {
      if (!e.vehicleId || !ownedVehicleIds.has(e.vehicleId)) return false;
      if (e.status !== "APPROVED") return false;
      if (e.currency.toUpperCase() !== currency) return false;
      const expenseDate = (e.expenseDate || (e as any).createdAt || "").split("T")[0];
      return expenseDate >= input.periodStart && expenseDate <= input.periodEnd;
    });

    for (let j = 0; j < allowableExpenses.length; j++) {
      const exp = allowableExpenses[j];
      const vehicleId = exp.vehicleId || "";
      const vehicle = input.vehicles.find((v) => v.id === vehicleId);
      const vehiclePlate = vehicle?.registrationPlate || "UNKNOWN-PLATE";

      const expDate = (exp.expenseDate || (exp as any).createdAt || "").split("T")[0];
      const historicalOwnership = this.resolveHistoricalOwnership(
        vehicleId,
        input.owner.id,
        expDate,
        input.ownerships
      );

      if (exp.ownerDeductible && !historicalOwnership) {
        throw new Error(
          `Owner-deductible expense ${exp.expenseNumber || exp.id} has no historical ownership terms for ${expDate}.`
        );
      }
      const allowable = Boolean(exp.ownerDeductible) && Boolean(historicalOwnership?.allowableExpenseDeductions);

      const grossMoney = createMoney(exp.grossAmount, currency);

      // Determine allocation type: default based on category and agreement terms
      let allocationType: "OWNER_BORNE" | "OPERATOR_BORNE" | "SHARED" = "OWNER_BORNE";
      let ownerPercent = 100.0;
      let ownerDeductionMoney = zeroMoney;
      let operatorBorneMoney = zeroMoney;

      if (!allowable) {
        // If agreement states no deductions, operator bears all expenses
        allocationType = "OPERATOR_BORNE";
        ownerPercent = 0.0;
        operatorBorneMoney = grossMoney;
      } else {
        // Categorical allocation rules:
        // ROUTINE_MAINTENANCE & MAJOR_REPAIR -> OWNER_BORNE or SHARED per terms
        // SALES_COMMISSION & ADMIN_FEES -> OPERATOR_BORNE
        // FUEL & CLEANING -> SHARED or OPERATOR
        if (exp.category === "OFFICE" || exp.category === "DRIVER" || exp.category === "MARKETING") {
          allocationType = "OPERATOR_BORNE";
          ownerPercent = 0.0;
          operatorBorneMoney = grossMoney;
        } else if (exp.category === "FUEL" || exp.category === "CLEANING") {
          allocationType = "SHARED";
          ownerPercent = historicalOwnership ? Number(historicalOwnership.revenueSharePercent) : 50.0;
          ownerDeductionMoney = multiplyMoney(grossMoney, ownerPercent / 100);
          operatorBorneMoney = subtractMoney(grossMoney, ownerDeductionMoney);
          totalSharedExpenseMoney = addMoney(totalSharedExpenseMoney, grossMoney);
        } else {
          // Maintenance, repairs, insurance, licensing -> Owner borne
          allocationType = "OWNER_BORNE";
          ownerPercent = 100.0;
          ownerDeductionMoney = grossMoney;
          totalOwnerBorneMoney = addMoney(totalOwnerBorneMoney, grossMoney);
        }
      }

      totalDeductionsMoney = addMoney(totalDeductionsMoney, ownerDeductionMoney);

      expenseLines.push({
        id: `sel_${Date.now()}_${j}`,
        settlementId: "",
        expenseId: exp.id,
        maintenanceId: exp.maintenanceId || undefined,
        vehicleId,
        vehiclePlate,
        category: exp.category,
        description: exp.description || `Vehicle operating expense for ${vehiclePlate}`,
        expenseDate: expDate,
        grossAmount: grossMoney.amount,
        allocationType,
        ownerSharePercent: ownerPercent,
        ownerDeductionAmount: ownerDeductionMoney.amount,
        operatorBorneAmount: operatorBorneMoney.amount,
        sortOrder: j,
      });
    }

    // 4. Process Adjustments
    const adjustmentLines: OwnerSettlementAdjustmentLine[] = [];
    let netAdjustmentsMoney = zeroMoney;

    if (input.adjustments && input.adjustments.length > 0) {
      for (let k = 0; k < input.adjustments.length; k++) {
        const adj = input.adjustments[k];
        const adjMoney = createMoney(adj.amount, currency);

        if (adj.type === "CREDIT_ADJUSTMENT" || adj.type === "DISPUTE_SETTLEMENT") {
          netAdjustmentsMoney = addMoney(netAdjustmentsMoney, adjMoney);
        } else {
          // DEBIT_ADJUSTMENT, CARRYOVER_DEDUCTION, HOLD
          netAdjustmentsMoney = subtractMoney(netAdjustmentsMoney, adjMoney);
        }

        adjustmentLines.push({
          id: `sadj_${Date.now()}_${k}`,
          settlementId: "",
          type: adj.type,
          amount: adjMoney.amount,
          currency,
          reason: adj.reason,
          createdBy: adj.createdBy || "system",
          createdAt: new Date().toISOString(),
        });
      }
    }

    // 5. Net Disbursable Payout & Operator Net Margin Calculation
    // Net = OwnerGrossShare - Deductions + Adjustments
    const netBeforeAdjustment = subtractMoney(totalOwnerShareMoney, totalDeductionsMoney);
    const calculatedNetPayout = addMoney(netBeforeAdjustment, netAdjustmentsMoney);

    let netPayoutMoney = calculatedNetPayout;
    let carriedForwardMoney = zeroMoney;

    // Check for negative net payout (deductions exceed revenue share)
    const netScaled = toScaledBigInt(calculatedNetPayout);
    if (netScaled < 0n) {
      netPayoutMoney = zeroMoney;
      carriedForwardMoney = fromScaledBigInt(-netScaled, currency);
    }

    // Operator Net Revenue = OperatorGrossShare + RecoveredDeductions
    const operatorNetRevenueMoney = addMoney(totalOperatorShareMoney, totalDeductionsMoney);

    return {
      totalEligibleRentalRevenue: totalEligibleRevenueMoney.amount,
      totalExcludedRevenue: totalExcludedRevenueMoney.amount,
      grossRevenue: totalGrossRevenueMoney.amount,
      ownerGrossRevenueShare: totalOwnerShareMoney.amount,
      operatorGrossRevenueShare: totalOperatorShareMoney.amount,
      totalOwnerBorneExpenses: totalOwnerBorneMoney.amount,
      totalSharedExpenses: totalSharedExpenseMoney.amount,
      totalDeductions: totalDeductionsMoney.amount,
      totalAdjustments: netAdjustmentsMoney.amount,
      netPayoutAmount: netPayoutMoney.amount,
      operatorNetRevenue: operatorNetRevenueMoney.amount,
      carriedForwardBalance: carriedForwardMoney.amount,
      termsSnapshot,
      termsSnapshots,
      rentalLines,
      expenseLines,
      adjustmentLines,
    };
  }
}
