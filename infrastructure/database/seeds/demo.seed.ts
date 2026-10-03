// ============================================================================
// CAR HIRE OS — DEMO TENANT & DATA SEED (DEV-004, DOM-003)
// Seeds canonical demo tenant 'Apex Car Rentals' with settings, operators, and baseline config
// ============================================================================

import { TenantRepository, UserRepository } from "@carhire/database";

export async function runDemoSeed() {
  console.log("--> Starting Demo Tenant & Data Seed...");

  const tenantRepo = new TenantRepository();
  const userRepo = new UserRepository();

  // 1. Seed Demo Tenant
  const demoSlug = "apex-rentals";
  let tenant = await tenantRepo.findBySlug(demoSlug);

  if (!tenant) {
    tenant = await tenantRepo.create({
      name: "Apex Luxury & Safari Rentals",
      slug: demoSlug,
      status: "ACTIVE",
      currency: "KES",
      planId: "plan-growth",
      defaultCurrency: "KES",
      currencySymbol: "KSh",
      timezone: "Africa/Nairobi",
      countryCode: "KE",
    });
    console.log(`  Created Demo Tenant: ${tenant.name} (${tenant.slug})`);

    // 2. Seed Tenant Settings (VAT 16%, KES 25/km, etc.)
    await tenantRepo.updateSettings(tenant.id, {
      vatRatePercent: 16.0,
      mpesaPaybill: "247247",
      mpesaShortcode: "654321",
      mpesaSandbox: true,
      allowedDailyKm: 250,
      excessKmRate: 25.0,
      depositDefaultAmount: 25000.0,
      cdwDailyRate: 1500.0,
      enableGpsTracking: true,
      requirePreauthDeposit: true,
    });
    console.log(`  Initialized Operational Settings for Tenant ${tenant.name}`);
  } else {
    console.log(`  Demo Tenant already exists: ${tenant.name}`);
  }

  // 3. Seed Demo Tenant Administrator
  const tenantAdminEmail = "admin@apexrentals.co.ke";
  let tenantAdmin = await userRepo.findByEmail(tenantAdminEmail);

  if (!tenantAdmin) {
    tenantAdmin = await userRepo.create({
      email: tenantAdminEmail,
      normalizedEmail: tenantAdminEmail.toLowerCase(),
      fullName: "Jane Wanjiru (Managing Director)",
      phone: "+254711223344",
      status: "ACTIVE",
      isPlatformStaff: false,
      emailVerifiedAt: new Date(),
    });

    await userRepo.createMembership({
      tenantId: tenant.id,
      userId: tenantAdmin.id,
      role: "TENANT_ADMIN",
      status: "ACTIVE",
    });
    console.log(`  Created Tenant Admin & Membership: ${tenantAdmin.email}`);
  }

  console.log("--> Demo Seed Completed Successfully.");
}

if (process.env.NODE_ENV !== "test" && typeof require !== "undefined" && require.main === module) {
  runDemoSeed().catch((err) => {
    console.error("Demo seed failed:", err);
    process.exit(1);
  });
}
