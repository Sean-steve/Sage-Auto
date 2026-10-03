// ============================================================================
// CAR HIRE OS — SYSTEM BOOTSTRAP SEED (DEV-004, SEC-003)
// Seeds foundational platform roles, system configurations, and system health
// ============================================================================

import { UserRepository } from "@carhire/database";

export async function runSystemSeed() {
  console.log("--> Starting System Bootstrap Seed...");

  const userRepo = new UserRepository();

  // Create Root Platform Super Administrator
  const rootAdminEmail = "platform-admin@carhireos.com";
  let admin = await userRepo.findByEmail(rootAdminEmail);

  if (!admin) {
    admin = await userRepo.create({
      email: rootAdminEmail,
      normalizedEmail: rootAdminEmail.toLowerCase(),
      fullName: "Car Hire OS System Administrator",
      phone: "+254700000000",
      status: "ACTIVE",
      isPlatformStaff: true,
      emailVerifiedAt: new Date(),
    });
    console.log(`  Created Root Platform Administrator: ${admin.email} (ID: ${admin.id})`);
  } else {
    console.log(`  Root Platform Administrator already exists: ${admin.email}`);
  }

  console.log("--> System Bootstrap Seed Completed Successfully.");
}

if (process.env.NODE_ENV !== "test" && typeof require !== "undefined" && require.main === module) {
  runSystemSeed().catch((err) => {
    console.error("System seed failed:", err);
    process.exit(1);
  });
}
