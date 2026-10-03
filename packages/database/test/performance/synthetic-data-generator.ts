// ============================================================================
// CAR HIRE OS — SYNTHETIC DATASET GENERATOR (SPRINT 40)
// Generates calibrated dataset profiles for Baseline, Load, Contention, and Stress
// Small, Medium, Large, and Enterprise Tenant profiles
// ============================================================================

import {
  TenantRepository,
  TenantSettingsRepository,
  UserRepository,
  TenantMembershipRepository,
  VehicleRepository,
  VehicleCategoryRepository,
  CustomerRepository,
  RatePlanRepository,
  PricingRuleRepository,
  BookingRepository,
  RentalRepository,
  InspectionRepository,
  InspectionTemplateRepository,
  LedgerAccountRepository,
  JournalTransactionRepository,
  JournalEntryRepository,
  OutboxRepository,
  IdempotencyRepository,
  WebhookRepository,
  LeadRepository,
  SalesQuoteRepository,
  AuditRepository,
  PaymentRepository,
  RefundRepository,
} from "../../src/index";

export type TenantScaleTier = "SMALL" | "MEDIUM" | "LARGE" | "ENTERPRISE";

export interface SyntheticDatasetConfig {
  tier: TenantScaleTier;
  tenantCount?: number;
  vehiclesPerTenant?: number;
  customersPerTenant?: number;
  bookingsPerTenant?: number;
  journalsPerTenant?: number;
  outboxPerTenant?: number;
}

export interface SyntheticDatasetResult {
  tenantIds: string[];
  vehicleIds: string[];
  customerIds: string[];
  bookingIds: string[];
  rentalIds: string[];
  ledgerAccountIds: string[];
  totalRecordsCreated: number;
  generationDurationMs: number;
}

export class SyntheticDataGenerator {
  private tenantRepo = new TenantRepository();
  private settingsRepo = new TenantSettingsRepository();
  private userRepo = new UserRepository();
  private membershipRepo = new TenantMembershipRepository();
  private vehicleRepo = new VehicleRepository();
  private categoryRepo = new VehicleCategoryRepository();
  private customerRepo = new CustomerRepository();
  private ratePlanRepo = new RatePlanRepository();
  private pricingRuleRepo = new PricingRuleRepository();
  private bookingRepo = new BookingRepository();
  private rentalRepo = new RentalRepository();
  private inspectionRepo = new InspectionRepository();
  private inspectionTemplateRepo = new InspectionTemplateRepository();
  private ledgerAccountRepo = new LedgerAccountRepository();
  private journalTxRepo = new JournalTransactionRepository();
  private journalEntryRepo = new JournalEntryRepository();
  private outboxRepo = new OutboxRepository();
  private idempotencyRepo = new IdempotencyRepository();
  private webhookRepo = new WebhookRepository();
  private leadRepo = new LeadRepository();
  private salesQuoteRepo = new SalesQuoteRepository();
  private auditRepo = new AuditRepository();

  /**
   * Generates a fully populated synthetic environment according to the target scale tier
   */
  async generate(config: SyntheticDatasetConfig): Promise<SyntheticDatasetResult> {
    const startTime = Date.now();
    const counts = this.getTierCounts(config.tier, config);

    const tenantIds: string[] = [];
    const vehicleIds: string[] = [];
    const customerIds: string[] = [];
    const bookingIds: string[] = [];
    const rentalIds: string[] = [];
    const ledgerAccountIds: string[] = [];
    let totalRecords = 0;

    for (let t = 0; t < counts.tenants; t++) {
      const tenantSlug = `perf-tenant-${config.tier.toLowerCase()}-${t + 1}-${Date.now()}`;
      const tenant = await this.tenantRepo.create({
        name: `Performance Scale Tenant ${t + 1} (${config.tier})`,
        slug: tenantSlug,
        currency: "KES",
        defaultCurrency: "KES",
        currencySymbol: "KSh",
        timezone: "Africa/Nairobi",
        countryCode: "KE",
        status: "ACTIVE",
        planId: "plan-pro",
      });
      tenantIds.push(tenant.id);
      totalRecords++;

      // Tenant Settings
      await this.settingsRepo.upsert(tenant.id, {
        vatRatePercent: 16.0,
        mpesaPaybill: "789012",
        allowedDailyKm: 250,
        excessKmRate: 25.0,
        depositDefaultAmount: 25000,
        cdwDailyRate: 1500,
      });
      totalRecords++;

      // Chart of Accounts for Ledger (Double-Entry)
      const cashAcc = await this.ledgerAccountRepo.create({
        tenantId: tenant.id,
        accountCode: `1000-${t}`,
        name: "Main Cash & M-Pesa",
        classification: "ASSET",
        subType: "CURRENT_ASSET",
        normalBalance: "DEBIT",
        currency: "KES",
        status: "ACTIVE",
        isSystemAccount: true,
      });
      const revenueAcc = await this.ledgerAccountRepo.create({
        tenantId: tenant.id,
        accountCode: `4000-${t}`,
        name: "Rental Revenue",
        classification: "REVENUE",
        subType: "OPERATING_REVENUE",
        normalBalance: "CREDIT",
        currency: "KES",
        status: "ACTIVE",
        isSystemAccount: true,
      });
      const depositAcc = await this.ledgerAccountRepo.create({
        tenantId: tenant.id,
        accountCode: `2100-${t}`,
        name: "Customer Security Deposits",
        classification: "LIABILITY",
        subType: "CURRENT_LIABILITY",
        normalBalance: "CREDIT",
        currency: "KES",
        status: "ACTIVE",
        isSystemAccount: true,
      });
      ledgerAccountIds.push(cashAcc.id, revenueAcc.id, depositAcc.id);
      totalRecords += 3;

      // Rate Plan
      await this.ratePlanRepo.createRatePlan(tenant.id, {
        name: "Standard Daily Rate 2026",
        code: `RATE-STD-${t}-${Date.now()}`,
        currency: "KES",
        isDefault: true,
      });
      totalRecords++;

      // Categories & Vehicles
      for (let v = 0; v < counts.vehicles; v++) {
        const plate = `KDF-${(100 + (v % 899)).toString().padStart(3, "0")}${String.fromCharCode(65 + (v % 26))}`;
        const vehicle = await this.vehicleRepo.create({
          tenantId: tenant.id,
          registrationPlate: plate,
          vin: `VINPERF${tenant.id.slice(0, 4)}${v.toString().padStart(5, "0")}`,
          make: v % 2 === 0 ? "Toyota" : "Nissan",
          model: v % 2 === 0 ? "Prado TX" : "X-Trail",
          year: 2023,
          category: "SUV" as any,
          transmission: "AUTOMATIC",
          fuelType: "DIESEL",
          seats: 7,
          odometer: 15000 + v * 500,
          fuelLevel: 100,
          lifecycleStatus: "ACTIVE",
          availabilityStatus: "AVAILABLE",
          dailyRate: 8500,
          features: ["GPS", "4WD"],
          imageUrl: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341",
        });
        vehicleIds.push(vehicle.id);
        totalRecords++;
      }

      // Customers
      for (let c = 0; c < counts.customers; c++) {
        const customer = await this.customerRepo.create({
          tenantId: tenant.id,
          customerType: "INDIVIDUAL",
          fullName: `Performance Customer ${c + 1}`,
          email: `perf-cust-${t}-${c}-${Date.now()}@example.com`,
          phone: `+254722${c.toString().padStart(6, "0")}`,
          idOrPassportNumber: `ID${tenant.id.slice(0, 3)}${c.toString().padStart(5, "0")}`,
          licenseNumber: `DL${c.toString().padStart(8, "0")}`,
          licenseExpiryDate: "2030-12-31",
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
        });
        customerIds.push(customer.id);
        totalRecords++;
      }

      // Bookings & Ledger Transactions
      const bookingBatch = Math.min(counts.bookings, counts.customers * 2);
      for (let b = 0; b < bookingBatch; b++) {
        const custId = customerIds[b % customerIds.length];
        const vehId = vehicleIds[b % vehicleIds.length];
        const bookingNum = `BK-PERF-${t + 1}-${b + 1}`;
        const booking = await this.bookingRepo.create(tenant.id, {
          bookingNumber: bookingNum,
          customerId: custId,
          vehicleId: vehId,
          pickupLocation: "Nairobi JKIA Airport",
          returnLocation: "Nairobi JKIA Airport",
          pickupAt: new Date(Date.now() + (b + 1) * 86400000).toISOString(),
          returnAt: new Date(Date.now() + (b + 4) * 86400000).toISOString(),
          grossTotal: 25500,
          netRentalSubtotal: 25500,
          depositRequired: 25000,
          taxAmount: 4080,
          initialStatus: "CONFIRMED",
        } as any);
        bookingIds.push(booking.id);
        totalRecords++;

        // Append double-entry balanced journal transaction
        await this.journalTxRepo.create({
          tenantId: tenant.id,
          transactionDate: new Date().toISOString(),
          status: "POSTED",
          sourceType: "BOOKING_PREPAYMENT",
          sourceId: booking.id,
          currency: "KES",
          totalDebit: "29580.0000",
          totalCredit: "29580.0000",
          description: `Booking deposit & prepayment for ${bookingNum}`,
          entries: [
            {
              id: `ent-dr-${b + 1}-${Date.now()}`,
              transactionId: `jrn-${b + 1}`,
              tenantId: tenant.id,
              accountId: cashAcc.id,
              accountCode: "1000",
              accountName: "Main Cash & M-Pesa",
              direction: "DEBIT",
              amount: "29580.0000",
              sortOrder: 1,
            },
            {
              id: `ent-cr-${b + 1}-${Date.now()}`,
              transactionId: `jrn-${b + 1}`,
              tenantId: tenant.id,
              accountId: revenueAcc.id,
              accountCode: "4000",
              accountName: "Rental Revenue",
              direction: "CREDIT",
              amount: "29580.0000",
              sortOrder: 2,
            },
          ] as any,
        } as any);
        totalRecords += 3;

        // Outbox event
        await this.outboxRepo.create({
          tenantId: tenant.id,
          eventType: "BOOKING_CONFIRMED",
          aggregateType: "Booking",
          aggregateId: booking.id,
          source: "carhire.perf",
          payload: { bookingId: booking.id, amountKes: 29580 },
          status: "PROCESSED",
        });
        totalRecords++;
      }
    }

    const duration = Date.now() - startTime;
    return {
      tenantIds,
      vehicleIds,
      customerIds,
      bookingIds,
      rentalIds,
      ledgerAccountIds,
      totalRecordsCreated: totalRecords,
      generationDurationMs: duration,
    };
  }

  private getTierCounts(tier: TenantScaleTier, config: SyntheticDatasetConfig) {
    switch (tier) {
      case "SMALL":
        return {
          tenants: config.tenantCount || 1,
          vehicles: config.vehiclesPerTenant || 5,
          customers: config.customersPerTenant || 25,
          bookings: config.bookingsPerTenant || 25,
          journals: config.journalsPerTenant || 50,
          outbox: config.outboxPerTenant || 25,
        };
      case "MEDIUM":
        return {
          tenants: config.tenantCount || 2,
          vehicles: config.vehiclesPerTenant || 25,
          customers: config.customersPerTenant || 100,
          bookings: config.bookingsPerTenant || 100,
          journals: config.journalsPerTenant || 200,
          outbox: config.outboxPerTenant || 100,
        };
      case "LARGE":
        return {
          tenants: config.tenantCount || 3,
          vehicles: config.vehiclesPerTenant || 75,
          customers: config.customersPerTenant || 300,
          bookings: config.bookingsPerTenant || 300,
          journals: config.journalsPerTenant || 600,
          outbox: config.outboxPerTenant || 300,
        };
      case "ENTERPRISE":
        return {
          tenants: config.tenantCount || 4,
          vehicles: config.vehiclesPerTenant || 150,
          customers: config.customersPerTenant || 500,
          bookings: config.bookingsPerTenant || 500,
          journals: config.journalsPerTenant || 1000,
          outbox: config.outboxPerTenant || 500,
        };
    }
  }
}
