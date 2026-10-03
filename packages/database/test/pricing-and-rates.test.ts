// ============================================================================
// CAR HIRE OS — SPRINT 11 PRICING & RATE ENGINE TEST SUITE (DEV-006, DEV-007, BRS-001)
// Production-grade Rate Plans, Rules, Arithmetic, Discounts, Taxes & Snapshot Freeze
// ============================================================================

import { runDurationCalculatorTests } from "../../../apps/api/src/modules/pricing/domain/__tests__/duration-calculator.spec";
import { runPricingMoneyTests } from "../../../apps/api/src/modules/pricing/domain/__tests__/pricing-money.spec";
import { runRateCalculatorTests } from "../../../apps/api/src/modules/pricing/domain/__tests__/rate-calculator.spec";
import {
  RatePlanRepository,
  PromoCodeRepository,
  PricingRuleRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { PricingService } from "../../../apps/api/src/modules/pricing/application/pricing.service";
import { RateCalculator } from "../../../apps/api/src/modules/pricing/domain/rate-calculator";
import { PricingMoney } from "../../../apps/api/src/modules/pricing/domain/pricing-money";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runAllPricingTests() {
  console.log("\n=======================================================");
  console.log("🚀 CAR HIRE OS — PRICING & RATE ENGINE TEST SUITE");
  console.log("=======================================================\n");

  // --------------------------------------------------------------------------
  // 1. Pure Domain Logic & Value Object Tests
  // --------------------------------------------------------------------------
  console.log("▶ Running PricingMoney Value Object tests...");
  runPricingMoneyTests();
  console.log("  ✔ PricingMoney 4-decimal scale arithmetic & rounding passed.");

  console.log("▶ Running BillableDurationCalculator tests...");
  runDurationCalculatorTests();
  console.log("  ✔ BillableDurationCalculator 24h & grace window logic passed.");

  console.log("▶ Running RateCalculator Domain Engine tests...");
  runRateCalculatorTests();
  console.log("  ✔ RateCalculator multi-tier, seasonal & promo calculations passed.");

  // --------------------------------------------------------------------------
  // 2. Integration / Service Level Tests with Repositories
  // --------------------------------------------------------------------------
  console.log("\n▶ Running PricingService Integration tests...");
  const pricingService = new PricingService();
  const tenantId = "tenant-nairobi";

  // Test 2.1: Create Rate Plan
  const plan = await pricingService.createRatePlan(
    tenantId,
    {
      code: "SAFARI_2026",
      name: "Safari Expedition 2026",
      currency: "KES",
      priority: 20,
      isDefault: false,
      effectiveFrom: "2026-01-01T00:00:00Z",
    },
    "usr-admin-1"
  );
  assert(plan.code === "SAFARI_2026", "Plan code must match");
  assert(plan.status === "DRAFT", "New plan must start as DRAFT");
  console.log("  ✔ Rate plan created in DRAFT state.");

  // Test 2.2: Add Rate Line for SUV category
  const rateLine = await pricingService.setRatePlanRate(
    tenantId,
    plan.id,
    {
      vehicleCategoryId: "cat-suv",
      dailyRate: 18000,
      weeklyDailyRate: 16000,
      monthlyDailyRate: 14000,
      weekendDailyRate: 20000,
      mileageAllowanceModel: "UNLIMITED",
      depositAmount: 50000,
      depositModel: "FIXED",
    },
    "usr-admin-1"
  );
  assert(rateLine.dailyRate === 18000, "Daily rate must be 18000");
  assert(rateLine.mileageAllowanceModel === "UNLIMITED", "Model must be UNLIMITED");
  console.log("  ✔ Rate line configured for SUV category.");

  // Test 2.3: Activate Rate Plan
  const activatedPlan = await pricingService.publishRatePlan(tenantId, plan.id, "usr-admin-1");
  assert(activatedPlan.status === "ACTIVE", "Plan must be ACTIVE");
  console.log("  ✔ Rate plan published successfully.");

  // Test 2.4: Create Seasonal Surcharge Rule
  const seasonRule = await pricingService.createSeasonalRule(
    tenantId,
    plan.id,
    {
      name: "Easter Holiday Rush",
      startDate: "2026-04-01",
      endDate: "2026-04-15",
      multiplier: 1.25, // 25% surge
      priority: 15,
      isActive: true,
    },
    "usr-admin-1"
  );
  assert(seasonRule.multiplier === 1.25, "Seasonal multiplier must be 1.25");
  console.log("  ✔ Seasonal rule registered.");

  // Test 2.5: Create Promo Code
  const promo = await pricingService.createPromoCode(
    tenantId,
    {
      code: "SAFARI10",
      description: "10% off safari hire",
      discountType: "PERCENTAGE",
      discountValue: 10,
      applicableTo: "BASE_RENTAL",
      minRentalDays: 3,
      maxDiscountAmount: 5000,
      validFrom: "2026-01-01T00:00:00Z",
      validTo: "2026-12-31T23:59:59Z",
      usageLimit: 50,
      isStackable: false,
    },
    "usr-admin-1"
  );
  assert(promo.code === "SAFARI10", "Promo code must be SAFARI10");
  console.log("  ✔ Promo code created and active.");

  // Test 2.6: Calculate Quote for 4-day Safari Rental with Promo Code
  const quote = await pricingService.calculateQuote({
    tenantId,
    vehicleCategoryId: "cat-suv",
    pickupDateTime: "2026-09-10T10:00:00Z",
    returnDateTime: "2026-09-14T10:00:00Z", // exactly 4 days
    ratePlanId: plan.id,
    promoCode: "SAFARI10",
    hasAdditionalDriver: true,
    hasChauffeur: false,
  });

  assert(quote.rentalDuration.billableDays === 4, "Billable days must be 4");
  // Thursday (18k) + Friday (18k) + Saturday (20k weekend) + Sunday (20k weekend) = 76000
  assert(quote.baseRentalAmount === 76000, "Base rental should be 76000 (2 weekdays + 2 weekend days)");
  assert(quote.totalDiscount === 5000, "Discount should be capped at 5000 (10% of 76000 is 7600)");
  assert(quote.driverCharges.additionalDriversCharge === 2000, "Additional driver charge for 4 days should be 2000");
  assert(quote.securityDeposit.amount === 50000, "Security deposit must match SUV rate line");
  assert(quote.pricingSnapshot !== undefined, "Immutable pricing snapshot must be generated");
  console.log("  ✔ Quote calculated and validated with promo cap and driver charges.");

  // Test 2.7: Promo Code Increment on Booking
  await pricingService.incrementPromoUsage(tenantId, promo.id);
  const promoRepo = new PromoCodeRepository();
  const updatedPromo = await promoRepo.findById(promo.id, tenantId);
  assert(updatedPromo?.usageCount === 1, "Promo usage count must increment to 1");
  console.log("  ✔ Promo code usage count correctly tracked.");

  console.log("\n=======================================================");
  console.log("🎉 ALL SPRINT 11 PRICING & RATE ENGINE TESTS PASSED!");
  console.log("=======================================================\n");
}

runAllPricingTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
