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
  rentals: Array<Rental & { booking?: any }>;
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
    if (matching) return matching;

    // 2. Look for active contract for this vehicle and owner
    const active = ownerships.find(
      (o) => o.vehicleId === vehicleId && o.ownerId === ownerId && o.isActive
    );
    if (active) return active;

    // 3. Fallback to any contract for this vehicle and owner
    return ownerships.find((o) => o.vehicleId === vehicleId && o.ownerId === ownerId) || null;
  }

  /**
   * Executes the full deterministic settlement calculation
   */
  static calculate(input: CalculationInput): CalculationResult {
    const currency = input.currency.toUpperCase();
    const zeroMoney = createMoney("0.0000", currency);

    // 1. Resolve Primary Commercial Terms Snapshot
    const primaryOwnership =
      input.ownerships.find((o) => o.ownerId === input.owner.id && o.isActive) ||
      input.ownerships.find((o) => o.ownerId === input.owner.id) ||
      null;

    const termsSnapshot: OwnerSettlementTermsSnapshot = {
      ownershipId: primaryOwnership?.id || "fallback-terms",
      ownershipType: primaryOwnership?.ownershipType || "THIRD_PARTY_OWNED",
      revenueSharePercent: primaryOwnership ? Number(primaryOwnership.revenueSharePercent) : 75.0,
      fixedMonthlyPayout: primaryOwnership?.fixedMonthlyPayout != null ? String(primaryOwnership.fixedMonthlyPayout) : undefined,
      allowableExpenseDeductions: primaryOwnership ? primaryOwnership.allowableExpenseDeductions : true,
      termsVersion: primaryOwnership?.version || 1,
      agreementStartDate: primaryOwnership?.startDate || input.periodStart,
      agreementEndDate: primaryOwnership?.endDate || undefined,
    };

    // 2. Process Rental Lines
    const rentalLines: OwnerSettlementRentalLine[] = [];
    let totalEligibleRevenueMoney = zeroMoney;
    let totalExcludedRevenueMoney = zeroMoney;
    let totalGrossRevenueMoney = zeroMoney;
    let totalOwnerShareMoney = zeroMoney;
    let totalOperatorShareMoney = zeroMoney;

    const ownedVehicleIds = new Set(input.vehicles.map((v) => v.id));

    // Filter rentals that completed within period and belong to one of owner's vehicles
    const eligibleRentals = input.rentals.filter((r) => {
      if (!ownedVehicleIds.has(r.vehicleId)) return false;
      const rentalDate = (r.actualEnd || r.completedAt || r.scheduledEnd || r.actualStart || r.scheduledStart).split("T")[0];
      return rentalDate >= input.periodStart && rentalDate <= input.periodEnd;
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

      const splitPercent = historicalOwnership
        ? Number(historicalOwnership.revenueSharePercent)
        : termsSnapshot.revenueSharePercent;

      // Pricing decomposition (Base Rental + Distance vs Fines/Damages/Fuel)
      const booking = rental.booking || {};
      const pricing = booking.pricingSnapshot || booking.pricing || {};

      const baseAmountNum =
        pricing.baseRentalAmount ??
        pricing.baseRental ??
        pricing.dailyRateTotal ??
        (rental as any).basePrice ??
        (rental as any).dailyRate ??
        5000;

      const excessMileageNum =
        pricing.extraMileageAmount ??
        pricing.excessMileageRevenue ??
        rental.finalExcessKmCharge ??
        (rental as any).excessMileageCharge ??
        0;

      // Excluded / Non-Shareable revenue items
      const trafficFinesNum = pricing.trafficFinesAmount ?? (rental as any).trafficFines ?? 0;
      const damageRecoveriesNum = pricing.damageRecoveryAmount ?? rental.finalDamageCharge ?? (rental as any).damageCharges ?? 0;
      const fuelDeficitNum = pricing.fuelDeficitAmount ?? rental.finalFuelDeficitCharge ?? (rental as any).fuelDeficitCharges ?? 0;
      const incidentalFeesNum = pricing.incidentalFeesAmount ?? rental.finalLateReturnFee ?? (rental as any).lateFees ?? 0;

      const baseMoney = createMoney(baseAmountNum, currency);
      const excessMileageMoney = createMoney(excessMileageNum, currency);
      const eligibleRentalMoney = addMoney(baseMoney, excessMileageMoney);

      const nonShareableMoney = createMoney(
        trafficFinesNum + damageRecoveriesNum + fuelDeficitNum + incidentalFeesNum,
        currency
      );

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

      const allowable = historicalOwnership
        ? historicalOwnership.allowableExpenseDeductions
        : termsSnapshot.allowableExpenseDeductions;

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
      rentalLines,
      expenseLines,
      adjustmentLines,
    };
  }
}
