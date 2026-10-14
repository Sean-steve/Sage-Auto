import { strict as assert } from "node:assert";
import {
  PaymentAttemptRepository, PaymentRepository, PaymentAllocationRepository,
  RefundRepository, PaymentReconciliationRepository, WebhookRepository, DepositPositionRepository,
  AuditRepository, OutboxRepository,
  OperationalInvoiceRepository, VehicleOwnerRepository, VehicleRepository,
  VehicleOwnershipRepository, RentalRepository, OwnerSettlementPeriodRepository,
  OwnerSettlementRepository, OwnerSettlementBatchRepository,
} from "../src/index";
import { processSettlementBatch } from "../../../apps/worker/src/jobs/owner-settlement.job";
import { FinanceModule } from "../../../apps/api/src/modules/finance/finance.module";
import { OwnerSettlementsModule } from "../../../apps/api/src/modules/owner-settlements/owner-settlements.module";
import { LedgerModule } from "../../../apps/api/src/modules/ledger/ledger.module";
import { PaymentService } from "../../../apps/api/src/modules/payments/application/payment.service";
import { PaymentProviderRegistry } from "../../../apps/api/src/modules/payments/infrastructure/providers/provider-registry";
import { StripeCardPaymentProvider, StripeConfigProvider, StripeClient } from "../../../apps/api/src/modules/payments/infrastructure/providers/stripe/index";

/**
 * Positive integration through persisted Finance invoice, completed Rental,
 * historical Ownership and the actual settlement worker. Provider disbursement
 * is NOT asserted: that belongs to the Payments integration boundary.
 */
async function positivePeriodWorkerTest() {
  const tenantId = "phase44-verified-owner";
  const foreignTenantId = "phase44-foreign-owner";
  const ownerRepo = new VehicleOwnerRepository();
  const vehicleRepo = new VehicleRepository();
  const ownershipRepo = new VehicleOwnershipRepository();
  const rentalRepo = new RentalRepository();
  const invoiceRepo = new OperationalInvoiceRepository();
  const periodRepo = new OwnerSettlementPeriodRepository();
  const settlementRepo = new OwnerSettlementRepository();
  const batchRepo = new OwnerSettlementBatchRepository();

  // Isolate this test process from other test suites and old mock settlement state.
  VehicleOwnerRepository.clear();
  VehicleRepository.clear();
  VehicleOwnershipRepository.clear();
  RentalRepository.clear();
  OperationalInvoiceRepository.clear();
  OwnerSettlementPeriodRepository.clear();
  OwnerSettlementRepository.clear();
  OwnerSettlementBatchRepository.clear();

  const owner = await ownerRepo.create({
    tenantId, name: "Settled Revenue Owner", email: "positive-worker-owner@example.test",
    phone: "+254711120000", ownerType: "INDIVIDUAL", status: "ACTIVE",
    payoutBank: "Isolated QA Bank", payoutAccountNumber: "acct_qa_owner_paid_0001",
  } as any);
  const vehicle = await vehicleRepo.create({
    tenantId, registrationPlate: "KZG 478Q", make: "Toyota", model: "Corolla",
    lifecycleStatus: "ACTIVE", availabilityStatus: "AVAILABLE",
    categoryId: "sedan", modelYear: 2021, seats: 5, odometer: 12350,
  } as any);
  await ownershipRepo.create({
    tenantId, vehicleId: vehicle.id, ownerId: owner.id,
    ownershipType: "THIRD_PARTY_OWNED", startDate: "2026-01-01",
    revenueSharePercent: 70, allowableExpenseDeductions: true,
    isActive: true, termsSnapshot: "70 percent historical signed share",
  } as any);
  const rental = await rentalRepo.create(tenantId, {
    rentalNumber: "RNT-POSITIVE-OWNER-001", bookingId: "booking-pos",
    contractId: "contract-pos", handoverId: "handover-pos", customerId: "customer-pos",
    primaryDriverId: "driver-pos", vehicleId: vehicle.id, status: "COMPLETED",
    scheduledStart: "2026-09-08T10:00:00.000Z",
    scheduledReturnAt: "2026-09-11T10:00:00.000Z",
    pricingSnapshot: {currency:"KES",grossTotal:10000,dailyRate:3000} as any,
  });
  await rentalRepo.update(rental.id,tenantId,{
    state:"COMPLETED",actualEnd:"2026-09-11T10:00:00.000Z",
    completedAt:"2026-09-11T11:00:00.000Z",
  });

  const invoice = await invoiceRepo.create({
    tenantId, customerId:"customer-pos", rentalId:rental.id,
    billingSnapshot:{customerName:"Billing Customer",customerEmail:"paid-customer@example.test"},
    currency:"KES", status:"PAID", issueDate:"2026-09-11", dueDate:"2026-09-14",
    subtotal:"10000.0000", discountTotal:"0.0000", taxTotal:"0.0000",
    total:"10000.0000", amountPaid:"10000.0000", amountCredited:"0.0000",
    amountOutstanding:"0.0000", paidAt:"2026-09-11T12:00:00.000Z",
    lineItems:[{
      lineType:"RENTAL_BASE",description:"Completed rental fee",quantity:1,
      unitPrice:"10000.0000",netAmount:"10000.0000",taxRate:"0.0000",
      taxAmount:"0.0000",grossAmount:"10000.0000",
    }],
  } as any);
  const finance = new FinanceModule().financeService;
  const fact = await finance.getSettledRentalRevenueComponents(tenantId,rental.id);
  assert.equal(fact?.isPaidOrSettled,true,"Tenant Finance must verify the persisted paid invoice");
  assert.equal(fact?.invoiceId,invoice.id);
  assert.equal(fact?.baseRentalGross,"10000.0000");
  assert.equal(await finance.getSettledRentalRevenueComponents(foreignTenantId,rental.id),null,
    "Other tenants must not read this invoice's revenue as their own");

  const period = await periodRepo.create({
    tenantId,periodType:"MONTHLY",startDate:"2026-09-01",endDate:"2026-09-30",
    description:"September paid owner share",status:"OPEN",settlementCount:0,
    totalGrossRevenue:"0.0000",totalOwnerPayout:"0.0000",totalOperatorRevenue:"0.0000",
    totalDeductions:"0.0000",
  } as any);
  const processed = await processSettlementBatch({tenantId,periodId:period.id,now:"2026-10-14T09:00:00Z"});
  assert.equal(processed.status,"completed");
  assert.equal(processed.periodsProcessed,1);
  assert.equal(processed.settlementsProcessed,1,"One completed paid rental must generate one owner settlement");
  const settlements = await settlementRepo.listByTenant(tenantId,{periodId:period.id});
  assert.equal(settlements.length,1);
  const settlement=settlements[0];
  assert.equal(settlement.ownerId,owner.id);
  assert.equal(settlement.status,"CALCULATED","Worker cannot approve/payout automatically");
  assert.equal(settlement.netPayoutAmount,"7000.0000","70% of verified KES 10,000 rental revenue");
  assert.equal(settlement.rentalLines?.[0]?.invoiceId,invoice.id);
  assert.equal(settlement.rentalLines?.[0]?.financeSourceSettled,true);
  assert.equal((await settlementRepo.listPayables(tenantId)).length,0,"Worker must not create payout obligations");
  const firstBatches=await batchRepo.listByTenant(tenantId,period.id);
  assert.equal(firstBatches.length,1);
  assert.equal(firstBatches[0].totalNetPayout,"7000.0000");

  const replay=await processSettlementBatch({tenantId,periodId:period.id,now:"2026-10-14T09:05:00Z"});
  assert.equal(replay.periodsProcessed,1);
  assert.equal((await batchRepo.listByTenant(tenantId,period.id)).length,1,"Replay must use batch idempotency key");
  assert.equal((await settlementRepo.listByTenant(tenantId,{periodId:period.id})).length,1);
  assert.equal((await settlementRepo.listPayables(tenantId)).length,0);
  assert.equal((await settlementRepo.listByTenant(foreignTenantId)).length,0,"Tenant isolation on generated settlements");
  await assert.rejects(()=>processSettlementBatch({tenantId:foreignTenantId,periodId:period.id}),
    /./,"Foreign tenant should never process this period");
  assert.equal((await batchRepo.listByTenant(foreignTenantId)).length,0);

  // An unapproved record cannot bypass the Payments boundary and become a payout.
  const ledgerModule = new LedgerModule();
  await ledgerModule.ledgerService.ensureChartOfAccounts(tenantId,"KES");
  const settlementService = new OwnerSettlementsModule(undefined,ledgerModule.ledgerService,finance).settlementService;
  await assert.rejects(
    ()=>settlementService.executePayout(tenantId,settlement.id,{} as any,{userId:"operator"}),
    /Direct settlement payout is disabled/i
  );
  await assert.rejects(
    ()=>settlementService.approveSettlement(tenantId,settlement.id,{} as any,{userId:"system:settlement-batch-worker"}),
    /different authorized user/i
  );
  assert.equal((await settlementRepo.listPayables(tenantId)).length,0);

  // Independent approver posts an auditable payable; only a different executor
  // may execute via the payment provider (never a settlement-service shortcut).
  const approved=await settlementService.approveSettlement(
    tenantId,settlement.id,{payoutMethod:"BANK_TRANSFER"} as any,{userId:"independent-settlement-approver"}
  );
  assert.equal(approved.status,"APPROVED");
  const payables=await settlementRepo.listPayables(tenantId);
  assert.equal(payables.length,1);
  const payable=payables[0];
  assert.equal(payable.netDisbursementAmount,"7000.0000");
  assert.equal(payable.destinationAccount,"acct_qa_owner_paid_0001");

  const registry=new PaymentProviderRegistry();
  const stripeConfig=new StripeConfigProvider({
    environment:"TEST",publishableKey:"pk_test_phase44",
    secretKey:"sk_test_phase44",webhookSecret:"whsec_test_phase44"
  });
  const stripeClient=new StripeClient({configProvider:stripeConfig,useOfflineSimulator:true});
  registry.register(new StripeCardPaymentProvider(stripeConfig,stripeClient));
  const paymentRepo=new PaymentRepository();
  const payouts=new PaymentService(
    new PaymentAttemptRepository(),paymentRepo,new PaymentAllocationRepository(),
    new RefundRepository(),new PaymentReconciliationRepository(),registry,
    new WebhookRepository(),invoiceRepo,new DepositPositionRepository(),
    settlementRepo,new AuditRepository(),new OutboxRepository()
  );
  const payoutDto={settlementPayableId:payable.id,provider:"STRIPE_CARD" as const,
    idempotencyKey:"phase44-payout-"+payable.id};
  await assert.rejects(
    ()=>payouts.executeOwnerPayout(tenantId,payoutDto,{userId:"independent-settlement-approver"} as any),
    /different authorized user/i
  );
  assert.equal((await paymentRepo.listByTenant(tenantId)).filter(p=>p.purpose==="OWNER_SETTLEMENT").length,0);
  const disbursed=await payouts.executeOwnerPayout(tenantId,payoutDto,{userId:"separate-payment-executor"} as any);
  assert.equal(disbursed.payable.status,"PAID");
  assert.equal(disbursed.payment.amount,"7000.0000");
  assert.equal(disbursed.payment.direction,"OUTBOUND");
  assert.equal((await settlementRepo.findById(settlement.id,tenantId))?.status,"PAID");
  await assert.rejects(
    ()=>payouts.executeOwnerPayout(tenantId,payoutDto,{userId:"separate-payment-executor"} as any),
    /already.*paid/i
  );
  assert.equal((await paymentRepo.listByTenant(tenantId)).filter(p=>p.purpose==="OWNER_SETTLEMENT").length,1,
    "Payout replay must never create a second outbound payment");

  console.log("✓ Paid Finance invoice → completed Rental → historical owner agreement → worker batch → KES 7,000 (replay and tenant isolation verified)");
}
void positivePeriodWorkerTest().catch(error=>{console.error(error);process.exitCode=1;});
