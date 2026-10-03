// ============================================================================
// CAR HIRE OS — SPRINT 10 PARTY & CUSTOMER TEST SUITE (DOM-001 §11-12, DOM-003 §11-13)
// Production-grade Customers, Corporate Accounts, Drivers, Agents & Compliance
// ============================================================================

import {
  CustomerRepository,
  CorporateAccountRepository,
  DriverRepository,
  AgentRepository,
  PartyDocumentRepository,
  AuditRepository,
  OutboxRepository,
  ConcurrencyConflictError,
  CrossTenantViolationError,
} from "@carhire/database";
import { CustomersService } from "../../../apps/api/src/modules/customers/application/customers.service";
import { CorporateAccountsService } from "../../../apps/api/src/modules/corporate-accounts/application/corporate-accounts.service";
import { DriversService } from "../../../apps/api/src/modules/drivers/application/drivers.service";
import { AgentsService } from "../../../apps/api/src/modules/agents/application/agents.service";
import { CustomerAggregate } from "../../../apps/api/src/modules/customers/domain/customer.aggregate";
import { CorporateAccountAggregate } from "../../../apps/api/src/modules/corporate-accounts/domain/corporate-account.aggregate";
import { DriverAggregate } from "../../../apps/api/src/modules/drivers/domain/driver.aggregate";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runPartyAndCustomersTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 10 PARTY & CUSTOMERS TEST SUITE (DOM-001/003)");
  console.log("==================================================================");

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(err);
      throw err;
    }
  }

  // Clear & Initialize In-Memory Stores
  CustomerRepository.clear();
  CorporateAccountRepository.clear();
  DriverRepository.clear();
  AgentRepository.clear();
  PartyDocumentRepository.clear();
  AuditRepository.clear();
  OutboxRepository.clear();

  // Instantiate Repositories
  const customerRepo = new CustomerRepository();
  const corporateRepo = new CorporateAccountRepository();
  const driverRepo = new DriverRepository();
  const agentRepo = new AgentRepository();
  const partyDocRepo = new PartyDocumentRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();

  // Instantiate Services
  const customersService = new CustomersService(customerRepo, partyDocRepo, auditRepo, outboxRepo);
  const corporateService = new CorporateAccountsService(corporateRepo, auditRepo, outboxRepo);
  const driversService = new DriversService(driverRepo, partyDocRepo, auditRepo, outboxRepo);
  const agentsService = new AgentsService(agentRepo, auditRepo, outboxRepo);

  const TENANT_A = "tenant-nairobi-hq";
  const TENANT_B = "tenant-mombasa-safari";
  const ACTOR_ID = "usr-ops-manager";
  const ACTOR_NAME = "Steven Nyaga";

  let custA: any;
  let corpA: any;
  let drvA: any;
  let agtA: any;

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Individual Customer Operations & KYC Lifecycle
  // --------------------------------------------------------------------------
  await test("Create customer with deterministic sequence number and audit/outbox events", async () => {
    custA = await customersService.createCustomer(
      TENANT_A,
      {
        customerType: "INDIVIDUAL",
        fullName: "Amina Hassan Mohamed",
        email: "amina.mohamed@safari.co.ke",
        phone: "+254712345678",
        idOrPassportNumber: "29841523",
        licenseNumber: "DL-NRB-89410",
        licenseExpiryDate: "2028-11-15",
        address: "Riverside Drive, Apt 4B",
        city: "Nairobi",
        country: "Kenya",
        notes: "Executive diplomat tier",
      },
      ACTOR_ID,
      ACTOR_NAME
    );

    assert(custA.customerNumber.startsWith("CUS-"), "Customer number format valid");
    assert(custA.fullName === "Amina Hassan Mohamed", "Customer name matches");
    assert(custA.status === "ACTIVE", "Default customer status is ACTIVE");
    assert(custA.verificationStatus === "UNVERIFIED", "Default verification is UNVERIFIED");
    assert(custA.version === 1, "Initial version is 1");

    const auditLogs = await auditRepo.findByTenant(TENANT_A);
    assert(auditLogs.some((l) => l.action === "customer.created" && l.resourceId === custA.id), "Audit log recorded");

    const outboxEvents = await outboxRepo.findByTenant(TENANT_A);
    assert(outboxEvents.some((e) => e.eventType === "customer.created" && e.aggregateId === custA.id), "Outbox event recorded");
  });

  await test("Customer verification lifecycle: UNVERIFIED -> PENDING -> VERIFIED", async () => {
    // Valid transition to PENDING_VERIFICATION
    let updated = await customersService.verifyKYC(
      custA.id,
      TENANT_A,
      { verificationStatus: "PENDING_VERIFICATION", expectedVersion: 1 },
      ACTOR_ID,
      ACTOR_NAME
    );
    assert(updated.verificationStatus === "PENDING_VERIFICATION", "Status updated to PENDING_VERIFICATION");
    assert(updated.version === 2, "Version incremented to 2");

    // Valid transition to VERIFIED
    updated = await customersService.verifyKYC(
      custA.id,
      TENANT_A,
      { verificationStatus: "VERIFIED", expectedVersion: 2 },
      ACTOR_ID,
      ACTOR_NAME
    );
    assert(updated.verificationStatus === "VERIFIED", "Status updated to VERIFIED");
    assert(updated.version === 3, "Version incremented to 3");

    // Invalid transition throws error
    let invalidTransitionBlocked = false;
    try {
      CustomerAggregate.validateVerificationTransition("REJECTED", "VERIFIED");
    } catch {
      invalidTransitionBlocked = true;
    }
    assert(invalidTransitionBlocked, "Invalid verification transition correctly blocked");
  });

  await test("Customer blocking and rental eligibility assertions", async () => {
    // Check eligibility when active and verified
    CustomerAggregate.assertEligibleForRental(await customersService.getCustomer(custA.id, TENANT_A));

    // Block customer
    const blocked = await customersService.changeStatus(
      custA.id,
      TENANT_A,
      { status: "BLOCKED", reason: "Multiple speeding fines unpaid", expectedVersion: 3 },
      ACTOR_ID,
      ACTOR_NAME
    );
    assert(blocked.status === "BLOCKED", "Customer status updated to BLOCKED");

    let rentalBlocked = false;
    try {
      CustomerAggregate.assertEligibleForRental(blocked);
    } catch {
      rentalBlocked = true;
    }
    assert(rentalBlocked, "Blocked customer is forbidden from renting");

    // Restore to ACTIVE
    await customersService.changeStatus(
      custA.id,
      TENANT_A,
      { status: "ACTIVE", reason: "Fines cleared by customer", expectedVersion: 4 },
      ACTOR_ID,
      ACTOR_NAME
    );
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Tenant Isolation Across Customer Repositories
  // --------------------------------------------------------------------------
  await test("Strict Tenant Isolation: Tenant B cannot access Tenant A's customer", async () => {
    let notFound = false;
    try {
      await customersService.getCustomer(custA.id, TENANT_B);
    } catch {
      notFound = true;
    }
    assert(notFound, "Tenant B must receive not found when querying Tenant A's customer");

    let crossTenantUpdateBlocked = false;
    try {
      await customerRepo.update(custA.id, TENANT_B, { fullName: "Hacker Update" }, 5);
    } catch (err: any) {
      crossTenantUpdateBlocked = err instanceof CrossTenantViolationError;
    }
    assert(crossTenantUpdateBlocked, "Cross-tenant update must throw CrossTenantViolationError");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Corporate Accounts & Credit Limit Management
  // --------------------------------------------------------------------------
  await test("Create Corporate Account and verify credit limit assertions", async () => {
    corpA = await corporateService.createAccount(
      TENANT_A,
      {
        companyName: "United Nations Environment Programme (UNEP)",
        registrationNumber: "DIPLOMATIC-UN-001",
        contactPerson: "Sarah Jane Thompson",
        email: "procurement@unep.org",
        phone: "+254207621234",
        creditLimit: 500000,
        paymentTermsDays: 30,
        discountRatePercent: 10,
      },
      ACTOR_ID
    );

    assert(corpA.accountNumber.startsWith("CORP-"), "Account number format valid");
    assert(corpA.creditLimit === 500000, "Credit limit matches");
    assert(corpA.status === "ACTIVE", "Corporate account is ACTIVE");

    // Credit assertion within limit
    CorporateAccountAggregate.assertCreditAvailable(corpA, 200000, 150000); // 350k <= 500k -> OK

    // Credit assertion exceeding limit throws error
    let limitExceeded = false;
    try {
      CorporateAccountAggregate.assertCreditAvailable(corpA, 450000, 100000); // 550k > 500k -> Error
    } catch {
      limitExceeded = true;
    }
    assert(limitExceeded, "Exceeding corporate credit limit correctly blocked");
  });

  await test("Add and manage Authorized Corporate Drivers", async () => {
    const authDriver = await corporateService.authorizeDriver(
      corpA.id,
      TENANT_A,
      {
        customerId: custA.id,
        roleTitle: "Lead Logistics Coordinator",
        isPrimaryContact: true,
      },
      ACTOR_ID
    );

    assert(authDriver.corporateAccountId === corpA.id, "Authorized driver belongs to corporate account");
    assert(authDriver.customerId === custA.id, "Authorized driver references customer");
    assert(authDriver.status === "ACTIVE", "Authorized driver status is ACTIVE");

    const authorizedList = await corporateService.listAuthorizedDrivers(corpA.id, TENANT_A);
    assert(authorizedList.length === 1, "Authorized drivers list contains 1 item");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Drivers, Commercial PSV Badges & License Expiry
  // --------------------------------------------------------------------------
  await test("Create Driver, validate PSV badge & license eligibility", async () => {
    drvA = await driversService.createDriver(
      TENANT_A,
      {
        fullName: "Jackson Mwangi Karanja",
        phone: "+254720111222",
        email: "jackson.mwangi@drivers.co.ke",
        licenseNumber: "DL-NRB-77412-PSV",
        licenseClasses: ["B", "C", "PSV"],
        licenseExpiryDate: "2028-09-15",
        badgeNumber: "PSV-B-99412",
        medicalExpiryDate: "2027-03-30",
        notes: "Experienced 4x4 safari guide",
      },
      ACTOR_ID,
      ACTOR_NAME
    );

    assert(drvA.driverNumber.startsWith("DRV-"), "Driver number format valid");
    assert(drvA.badgeNumber === "PSV-B-99412", "PSV Badge number recorded");
    assert(drvA.status === "ACTIVE", "Driver status is ACTIVE");

    // Eligible for trip
    DriverAggregate.assertEligibleForTrip(drvA);

    // Blacklisted driver throws error
    let blacklistedBlocked = false;
    try {
      DriverAggregate.assertEligibleForTrip({ ...drvA, status: "BLACKLISTED" });
    } catch {
      blacklistedBlocked = true;
    }
    assert(blacklistedBlocked, "Blacklisted driver trip assignment blocked");
  });

  await test("Customer-Driver relationship linkage", async () => {
    const relationship = await driversService.linkDriverToCustomer(
      TENANT_A,
      custA.id,
      drvA.id,
      "PERSONAL_CHAUFFEUR",
      true
    );

    assert(relationship.customerId === custA.id, "Relationship linked to customer");
    assert(relationship.driverId === drvA.id, "Relationship linked to driver");
    assert(relationship.isDefault === true, "Marked as default chauffeur");

    const driverRelationships = await driversService.listCustomerDrivers(custA.id, TENANT_A);
    assert(driverRelationships.length === 1, "Customer-driver relationship retrieved");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Referral Agents & Commission Calculations
  // --------------------------------------------------------------------------
  await test("Create Referral Agent and track commission bookings", async () => {
    agtA = await agentsService.createAgent(
      TENANT_A,
      {
        name: "Peter Ndegwa",
        agencyName: "Serena Safari Concierge Desk",
        email: "concierge@serenasafari.co.ke",
        phone: "+254722556677",
        commissionType: "PERCENTAGE",
        commissionRatePercent: 12.5,
        payoutMpesaNumber: "+254722556677",
        notes: "Top hotel referral partner",
      },
      ACTOR_ID
    );

    assert(agtA.agentNumber.startsWith("AGT-"), "Agent number format valid");
    assert(agtA.commissionRatePercent === 12.5, "Commission rate recorded");
    assert(agtA.status === "ACTIVE", "Agent status is ACTIVE");

    // Record referral
    const updatedAgent = await agentsService.recordReferral(agtA.id, TENANT_A, 18500, ACTOR_ID);
    assert(updatedAgent.totalReferralsCount === 1, "Referral count incremented");
    assert(updatedAgent.totalCommissionEarned === 2312.5, "Commission earned calculated (12.5% of 18500 = 2312.5)");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 6: Party Documents & Verification Metadata
  // --------------------------------------------------------------------------
  await test("Upload Party Identity Documents and verify metadata audit trail", async () => {
    const doc = await partyDocRepo.create({
      tenantId: TENANT_A,
      partyType: "CUSTOMER",
      partyId: custA.id,
      documentType: "DRIVING_LICENSE_FRONT",
      documentNumber: "DL-NRB-89410",
      fileUrl: "https://storage.carhireos.com/tenants/nairobi/cust-01/dl-front.jpg",
      fileName: "dl-front.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 2048500,
      expiresAt: "2028-11-15",
      verificationStatus: "VERIFIED",
      verifiedBy: ACTOR_ID,
      verifiedAt: new Date().toISOString(),
    });

    assert(doc.partyId === custA.id, "Document belongs to customer");
    assert(doc.verificationStatus === "VERIFIED", "Document is VERIFIED");

    const customerDocs = await partyDocRepo.findByParty("CUSTOMER", custA.id, TENANT_A);
    assert(customerDocs.length === 1, "Party documents queried successfully");

    const statusHistory = await partyDocRepo.getStatusHistory("CUSTOMER", custA.id, TENANT_A);
    assert(statusHistory.length > 0, "Status transition history recorded");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 7: Optimistic Concurrency Control
  // --------------------------------------------------------------------------
  await test("Optimistic Concurrency Control throws ConcurrencyConflictError on stale updates", async () => {
    let conflictCaught = false;
    try {
      await customersService.updateCustomer(
        custA.id,
        TENANT_A,
        { fullName: "Stale Customer Update", expectedVersion: 1 }, // Currently at version 5
        ACTOR_ID
      );
    } catch (err: any) {
      conflictCaught = err instanceof ConcurrencyConflictError;
    }
    assert(conflictCaught, "Stale update must be rejected with ConcurrencyConflictError");
  });

  console.log("\n==================================================================");
  console.log(`SPRINT 10 TEST RESULTS: ${passed}/${total} TESTS PASSED (100% SUCCESS)`);
  console.log("==================================================================\n");
}

runPartyAndCustomersTestSuite().catch((err) => {
  console.error("FATAL ERROR IN SPRINT 10 TEST SUITE:", err);
  process.exit(1);
});
