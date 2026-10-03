// ============================================================================
// CAR HIRE OS — DETERMINISTIC RATE CALCULATION ENGINE (DEV-006, DEV-007, BRS-001)
// Pure Domain Computation Engine for Price Quotes & Immutable Snapshots
// ============================================================================

import type {
  PricingRequest,
  PricingResult,
  PricingSnapshot,
  RatePlan,
  RatePlanRate,
  SeasonalRateRule,
  DurationTierRule,
  PricingFeeRule,
  PromoCode,
  DayRateItem,
  ItemizedFeeItem,
  AppliedDiscountItem,
} from "@carhire/types";
import { PricingMoney } from "./pricing-money";
import { BillableDurationCalculator } from "./duration-calculator";

export interface RateCalculationContext {
  request: PricingRequest;
  ratePlan: RatePlan;
  rateLine: RatePlanRate;
  seasonalRules?: SeasonalRateRule[];
  durationTiers?: DurationTierRule[];
  availableFees?: PricingFeeRule[];
  promoCode?: PromoCode | null;
  corporateDiscountPercent?: number;
  taxRatePercent?: number;
}

export class RateCalculator {
  static calculate(ctx: RateCalculationContext): PricingResult {
    const {
      request,
      ratePlan,
      rateLine,
      seasonalRules = [],
      durationTiers = [],
      availableFees = [],
      promoCode,
      corporateDiscountPercent = 0,
      taxRatePercent = 16,
    } = ctx;

    const currency = ratePlan.currency || "KES";
    const ruleTrace: string[] = [];
    ruleTrace.push(`Resolved RatePlan: [${ratePlan.code}] v${ratePlan.version} (${ratePlan.name})`);

    // 1. Duration calculation
    const duration = BillableDurationCalculator.calculate(
      request.pickupDateTime,
      request.returnDateTime
    );
    const billableDays = duration.billableDays;
    ruleTrace.push(
      `Duration: ${duration.totalHours} hrs -> ${billableDays} billable day(s) (Grace applied: ${duration.partialDayGraceApplied})`
    );

    // 2. Base Daily Rate & Tier resolution
    let standardDailyRate = rateLine.dailyRate;
    let appliedRateUnit: "DAILY" | "WEEKLY" | "MONTHLY" | "TIERED" = "DAILY";
    let matchedTier: DurationTierRule | null = null;

    // Check duration tiers
    for (const tier of durationTiers) {
      if (billableDays >= tier.minDays && billableDays <= tier.maxDays) {
        matchedTier = tier;
        break;
      }
    }

    if (matchedTier?.customDailyRate) {
      standardDailyRate = matchedTier.customDailyRate;
      appliedRateUnit = "TIERED";
      ruleTrace.push(`Applied Duration Tier custom daily rate: ${standardDailyRate}`);
    } else if (billableDays >= 28 && rateLine.monthlyDailyRate) {
      standardDailyRate = rateLine.monthlyDailyRate;
      appliedRateUnit = "MONTHLY";
      ruleTrace.push(`Applied Monthly long-term daily rate: ${standardDailyRate}`);
    } else if (billableDays >= 7 && rateLine.weeklyDailyRate) {
      standardDailyRate = rateLine.weeklyDailyRate;
      appliedRateUnit = "WEEKLY";
      ruleTrace.push(`Applied Weekly discounted daily rate: ${standardDailyRate}`);
    } else {
      ruleTrace.push(`Applied Standard daily rate: ${standardDailyRate}`);
    }

    // 3. Day-by-Day Breakdown (Seasonality, Weekend overrides)
    const dayBreakdown: DayRateItem[] = [];
    let baseRentalMoney = PricingMoney.zero(currency);

    for (const day of duration.dayList) {
      let dayBaseRate = standardDailyRate;
      let dayType: "WEEKDAY" | "WEEKEND" | "SEASONAL_PEAK" | "STANDARD" = day.isWeekend
        ? "WEEKEND"
        : "WEEKDAY";

      // Check weekend daily rate override if applicable and not on tiered/monthly/weekly plan
      if (day.isWeekend && rateLine.weekendDailyRate && appliedRateUnit === "DAILY") {
        dayBaseRate = rateLine.weekendDailyRate;
      }

      // Check seasonal rule match
      let seasonalMultiplier = 1.0;
      for (const season of seasonalRules) {
        if (
          season.isActive &&
          day.date >= season.startDate &&
          day.date <= season.endDate &&
          (!season.vehicleCategoryId || season.vehicleCategoryId === request.vehicleCategoryId)
        ) {
          seasonalMultiplier = season.multiplier;
          dayType = "SEASONAL_PEAK";
          ruleTrace.push(`Applied Season [${season.name}] on ${day.date} (x${seasonalMultiplier})`);
          break;
        }
      }

      const effectiveRate = PricingMoney.roundTo4(dayBaseRate * seasonalMultiplier);
      baseRentalMoney = baseRentalMoney.add(effectiveRate);

      dayBreakdown.push({
        date: day.date,
        dayType,
        baseRate: dayBaseRate,
        seasonalMultiplier,
        effectiveRate,
      });
    }

    const appliedAverageDailyRate =
      billableDays > 0
        ? PricingMoney.roundTo4(baseRentalMoney.amount / billableDays)
        : standardDailyRate;

    // 4. Driver Charges
    let primaryDriverMoney = PricingMoney.zero(currency);
    let additionalDriversMoney = PricingMoney.zero(currency);
    let chauffeurMoney = PricingMoney.zero(currency);
    let youngDriverMoney = PricingMoney.zero(currency);

    // Young or senior driver surcharge (age < 25 or > 70)
    if (request.primaryDriverAge !== undefined) {
      if (request.primaryDriverAge < 25) {
        youngDriverMoney = baseRentalMoney.percentage(15); // 15% risk surcharge
        ruleTrace.push(`Young Driver (<25) Risk Surcharge applied: ${youngDriverMoney.format()}`);
      } else if (request.primaryDriverAge > 70) {
        youngDriverMoney = baseRentalMoney.percentage(10);
        ruleTrace.push(`Senior Driver (>70) Surcharge applied: ${youngDriverMoney.format()}`);
      }
    }

    // Additional Drivers: e.g. 500 KES/day per additional driver
    const addCount = request.additionalDriversCount ?? (request.hasAdditionalDriver ? 1 : 0);
    if (addCount > 0) {
      const addDriverFeeRule = availableFees.find(
        (f) => f.code === "ADDITIONAL_DRIVER" && f.isActive
      );
      const feePerDay = addDriverFeeRule ? addDriverFeeRule.amount : 500;
      additionalDriversMoney = new PricingMoney(
        addCount * feePerDay * billableDays,
        currency
      );
      ruleTrace.push(
        `Additional Drivers (${addCount}x @ ${feePerDay}/day): ${additionalDriversMoney.format()}`
      );
    }

    // Chauffeur / Dedicated Driver Service: e.g. 3,500 KES/day
    if (request.driverServiceRequested || request.hasChauffeur) {
      const chauffeurFeeRule = availableFees.find(
        (f) => (f.code === "CHAUFFEUR_SERVICE" || f.code === "CHAUFFEUR") && f.isActive
      );
      const feePerDay = chauffeurFeeRule ? chauffeurFeeRule.amount : 3500;
      chauffeurMoney = new PricingMoney(feePerDay * billableDays, currency);
      ruleTrace.push(
        `Professional Chauffeur Service (${billableDays} days @ ${feePerDay}/day): ${chauffeurMoney.format()}`
      );
    }

    const totalDriverMoney = primaryDriverMoney
      .add(additionalDriversMoney)
      .add(chauffeurMoney)
      .add(youngDriverMoney);

    // 5. Location & Delivery Charges
    let deliveryMoney = PricingMoney.zero(currency);
    let collectionMoney = PricingMoney.zero(currency);
    let oneWayMoney = PricingMoney.zero(currency);

    if (request.deliveryRequested) {
      const baseFee = 1500;
      const perKm = 50;
      const distanceKm = request.deliveryDistanceKm || 0;
      deliveryMoney = new PricingMoney(baseFee + distanceKm * perKm, currency);
      ruleTrace.push(`Delivery Service (${distanceKm} km): ${deliveryMoney.format()}`);
    }

    if (request.collectionRequested) {
      const baseFee = 1500;
      const perKm = 50;
      const distanceKm = request.collectionDistanceKm || 0;
      collectionMoney = new PricingMoney(baseFee + distanceKm * perKm, currency);
      ruleTrace.push(`Collection Service (${distanceKm} km): ${collectionMoney.format()}`);
    }

    if (
      request.pickupLocationId &&
      request.returnLocationId &&
      request.pickupLocationId !== request.returnLocationId
    ) {
      oneWayMoney = new PricingMoney(5000, currency);
      ruleTrace.push(`One-Way Repositioning Fee: ${oneWayMoney.format()}`);
    }

    const totalLocationMoney = deliveryMoney.add(collectionMoney).add(oneWayMoney);

    // 6. Itemized Ancillary Fees & Add-ons
    const itemizedFees: ItemizedFeeItem[] = [];
    let totalFeesMoney = PricingMoney.zero(currency);

    if (request.selectedFeeCodes && request.selectedFeeCodes.length > 0) {
      for (const feeCode of request.selectedFeeCodes) {
        const feeRule = availableFees.find(
          (f) => f.code.toUpperCase() === feeCode.toUpperCase() && f.isActive
        );
        if (feeRule) {
          let feeTotal = 0;
          let units = 1;

          switch (feeRule.calculationType) {
            case "DAILY":
              units = billableDays;
              feeTotal = feeRule.amount * billableDays;
              break;
            case "PERCENTAGE_OF_BASE":
              units = 1;
              feeTotal = (baseRentalMoney.amount * feeRule.amount) / 100;
              break;
            case "FLAT_PER_RENTAL":
            default:
              units = 1;
              feeTotal = feeRule.amount;
              break;
          }

          const feeAmount = new PricingMoney(feeTotal, currency);
          totalFeesMoney = totalFeesMoney.add(feeAmount);

          itemizedFees.push({
            code: feeRule.code,
            name: feeRule.name,
            type: feeRule.feeType,
            calculationType: feeRule.calculationType,
            unitAmount: feeRule.amount,
            units,
            amount: feeAmount.amount,
            isTaxable: feeRule.isTaxable,
          });

          ruleTrace.push(`Added Ancillary Fee [${feeRule.name}]: ${feeAmount.format()}`);
        }
      }
    }

    // 7. Discounts & Promo Code Evaluation
    const appliedDiscounts: AppliedDiscountItem[] = [];
    let totalDiscountMoney = PricingMoney.zero(currency);

    // Duration Tier Percentage Discount (if specified in tier)
    if (matchedTier?.discountPercent && matchedTier.discountPercent > 0) {
      const tierDisc = baseRentalMoney.percentage(matchedTier.discountPercent);
      totalDiscountMoney = totalDiscountMoney.add(tierDisc);
      appliedDiscounts.push({
        description: `Duration Tier (${matchedTier.minDays}-${matchedTier.maxDays} days) - ${matchedTier.discountPercent}% off`,
        type: "DURATION_TIER",
        amount: tierDisc.amount,
      });
      ruleTrace.push(`Duration Tier discount: ${tierDisc.format()}`);
    }

    // Corporate Account Negotiated Discount
    if (corporateDiscountPercent > 0) {
      const corpDisc = baseRentalMoney.percentage(corporateDiscountPercent);
      totalDiscountMoney = totalDiscountMoney.add(corpDisc);
      appliedDiscounts.push({
        description: `Corporate Agreement (${corporateDiscountPercent}% discount on rental)`,
        type: "CORPORATE",
        amount: corpDisc.amount,
      });
      ruleTrace.push(`Corporate discount: ${corpDisc.format()}`);
    }

    // Promo Code
    if (promoCode && promoCode.status === "ACTIVE") {
      let promoValid = true;

      if (promoCode.minRentalDays && billableDays < promoCode.minRentalDays) {
        promoValid = false;
        ruleTrace.push(
          `Promo code [${promoCode.code}] rejected: requires min ${promoCode.minRentalDays} rental days`
        );
      }

      if (
        promoCode.minSubtotalAmount &&
        baseRentalMoney.amount < promoCode.minSubtotalAmount
      ) {
        promoValid = false;
        ruleTrace.push(
          `Promo code [${promoCode.code}] rejected: requires min subtotal ${promoCode.minSubtotalAmount}`
        );
      }

      if (promoValid) {
        let promoDiscAmount = 0;
        const targetBase =
          promoCode.applicableTo === "TOTAL_SUBTOTAL"
            ? baseRentalMoney.add(totalFeesMoney).add(totalDriverMoney)
            : baseRentalMoney;

        if (promoCode.discountType === "PERCENTAGE") {
          promoDiscAmount = (targetBase.amount * promoCode.discountValue) / 100;
        } else {
          promoDiscAmount = promoCode.discountValue;
        }

        if (promoCode.maxDiscountAmount && promoDiscAmount > promoCode.maxDiscountAmount) {
          promoDiscAmount = promoCode.maxDiscountAmount;
        }

        const promoMoney = new PricingMoney(promoDiscAmount, currency);
        totalDiscountMoney = totalDiscountMoney.add(promoMoney);

        appliedDiscounts.push({
          code: promoCode.code,
          description: promoCode.description || `Promo code ${promoCode.code}`,
          type: "PROMO_CODE",
          amount: promoMoney.amount,
        });
        ruleTrace.push(`Promo code [${promoCode.code}] applied: ${promoMoney.format()}`);
      }
    }

    // Manual Discount if authorized
    if (request.manualDiscountPercent && request.manualDiscountPercent > 0) {
      const manualDisc = baseRentalMoney.percentage(request.manualDiscountPercent);
      totalDiscountMoney = totalDiscountMoney.add(manualDisc);
      appliedDiscounts.push({
        description: `Manual Discount (${request.manualDiscountPercent}%)`,
        type: "MANUAL",
        amount: manualDisc.amount,
      });
      ruleTrace.push(`Manual discount: ${manualDisc.format()}`);
    } else if (request.manualDiscountAmount && request.manualDiscountAmount > 0) {
      const manualDisc = new PricingMoney(request.manualDiscountAmount, currency);
      totalDiscountMoney = totalDiscountMoney.add(manualDisc);
      appliedDiscounts.push({
        description: "Manual Fixed Discount",
        type: "MANUAL",
        amount: manualDisc.amount,
      });
      ruleTrace.push(`Manual fixed discount: ${manualDisc.format()}`);
    }

    // 8. Net Rental Subtotal Calculation
    const grossComponents = baseRentalMoney
      .add(totalDriverMoney)
      .add(totalLocationMoney)
      .add(totalFeesMoney);

    let netRentalSubtotal = grossComponents.subtract(totalDiscountMoney);
    if (netRentalSubtotal.isNegative()) {
      netRentalSubtotal = PricingMoney.zero(currency);
    }

    // 9. Taxes (Inclusive vs Exclusive)
    let taxableAmount: PricingMoney;
    let taxAmount: PricingMoney;
    let grossRentalTotal: PricingMoney;

    if (ratePlan.taxInclusive) {
      // In tax-inclusive mode, netRentalSubtotal already includes tax
      grossRentalTotal = netRentalSubtotal;
      taxAmount = grossRentalTotal.calculateInclusiveTaxPortion(taxRatePercent);
      taxableAmount = grossRentalTotal.subtract(taxAmount);
      ruleTrace.push(
        `Tax Inclusive (${taxRatePercent}% VAT): Gross ${grossRentalTotal.format()}, Tax portion: ${taxAmount.format()}`
      );
    } else {
      // In tax-exclusive mode, tax is added on top of taxable subtotal
      taxableAmount = netRentalSubtotal;
      taxAmount = taxableAmount.calculateExclusiveTax(taxRatePercent);
      grossRentalTotal = taxableAmount.add(taxAmount);
      ruleTrace.push(
        `Tax Exclusive (${taxRatePercent}% VAT): Subtotal ${taxableAmount.format()} + Tax ${taxAmount.format()} = Gross ${grossRentalTotal.format()}`
      );
    }

    // 10. Security Deposit
    let depositAmount = rateLine.depositAmount;
    if (rateLine.depositModel === "PERCENTAGE" && rateLine.depositPercent) {
      depositAmount = (grossRentalTotal.amount * rateLine.depositPercent) / 100;
    }
    const depositMoney = new PricingMoney(depositAmount, currency);
    ruleTrace.push(`Security Deposit (${rateLine.depositModel}): ${depositMoney.format()}`);

    // 11. Mileage Allowance
    const includedKm =
      rateLine.mileageAllowanceModel === "DAILY_CAPPED"
        ? (rateLine.includedKmPerDay || 200) * billableDays
        : rateLine.mileageAllowanceModel === "FIXED_TOTAL"
        ? rateLine.includedKmTotal || 500
        : 0;

    const excessKmRate = rateLine.excessKmRate || 35;

    // 12. Build Snapshot and Final Result
    const calculatedAt = request.evaluationTime || new Date().toISOString();
    const snapshotId = `psnap-${crypto.randomUUID()}`;

    const pricingSnapshot: PricingSnapshot = {
      snapshotId,
      calculatedAt,
      ratePlanId: ratePlan.id,
      ratePlanCode: ratePlan.code,
      ratePlanName: ratePlan.name,
      ratePlanVersion: ratePlan.version,
      currency,
      pickupDateTime: request.pickupDateTime,
      returnDateTime: request.returnDateTime,
      totalHours: duration.totalHours,
      billableDays,
      baseDailyRate: standardDailyRate,
      appliedAverageDailyRate,
      baseRentalAmount: baseRentalMoney.amount,
      dayBreakdown,
      driverCharges: {
        primaryDriverCharge: primaryDriverMoney.amount,
        additionalDriversCharge: additionalDriversMoney.amount,
        chauffeurCharge: chauffeurMoney.amount,
        youngDriverSurcharge: youngDriverMoney.amount,
        totalDriverCharges: totalDriverMoney.amount,
      },
      locationCharges: {
        deliveryCharge: deliveryMoney.amount,
        collectionCharge: collectionMoney.amount,
        oneWayFee: oneWayMoney.amount,
        totalLocationCharges: totalLocationMoney.amount,
      },
      fees: itemizedFees,
      totalFees: totalFeesMoney.amount,
      discounts: appliedDiscounts,
      totalDiscount: totalDiscountMoney.amount,
      netRentalSubtotal: netRentalSubtotal.amount,
      tax: {
        taxRatePercent,
        isTaxInclusive: ratePlan.taxInclusive,
        taxableAmount: taxableAmount.amount,
        taxAmount: taxAmount.amount,
      },
      grossRentalTotal: grossRentalTotal.amount,
      securityDeposit: {
        required: depositMoney.amount > 0,
        model: rateLine.depositModel,
        amount: depositMoney.amount,
        isRefundable: true,
      },
      mileageAllowance: {
        model: rateLine.mileageAllowanceModel,
        includedKm,
        excessKmRate,
      },
      appliedRules: ruleTrace,
    };

    return {
      currency,
      rentalDuration: {
        totalHours: duration.totalHours,
        billableDays,
        partialDayGraceApplied: duration.partialDayGraceApplied,
      },
      ratePlanSummary: {
        id: ratePlan.id,
        code: ratePlan.code,
        name: ratePlan.name,
        version: ratePlan.version,
        isCorporateNegotiated: corporateDiscountPercent > 0,
      },
      baseRate: {
        standardDailyRate,
        appliedAverageDailyRate,
        rateUnit: appliedRateUnit,
      },
      baseRentalAmount: baseRentalMoney.amount,
      dayBreakdown,
      driverCharges: {
        primaryDriverCharge: primaryDriverMoney.amount,
        additionalDriversCharge: additionalDriversMoney.amount,
        chauffeurCharge: chauffeurMoney.amount,
        youngDriverSurcharge: youngDriverMoney.amount,
        totalDriverCharges: totalDriverMoney.amount,
      },
      locationCharges: {
        deliveryCharge: deliveryMoney.amount,
        collectionCharge: collectionMoney.amount,
        oneWayFee: oneWayMoney.amount,
        totalLocationCharges: totalLocationMoney.amount,
      },
      itemizedFees,
      totalFees: totalFeesMoney.amount,
      appliedDiscounts,
      totalDiscount: totalDiscountMoney.amount,
      netRentalSubtotal: netRentalSubtotal.amount,
      taxCalculation: {
        taxRatePercent,
        isTaxInclusive: ratePlan.taxInclusive,
        taxableAmount: taxableAmount.amount,
        taxAmount: taxAmount.amount,
      },
      grossRentalTotal: grossRentalTotal.amount,
      securityDeposit: {
        required: depositMoney.amount > 0,
        model: rateLine.depositModel,
        amount: depositMoney.amount,
        isRefundable: true,
      },
      totalDueAtBooking: grossRentalTotal.amount,
      mileageAllowance: {
        model: rateLine.mileageAllowanceModel,
        includedKm,
        excessKmRate,
      },
      pricingVersion: ratePlan.version,
      appliedRuleTrace: ruleTrace,
      calculatedAt,
      pricingSnapshot,
    };
  }
}
