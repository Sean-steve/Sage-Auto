// ============================================================================
// CAR HIRE OS — OPERATIONAL FINANCE APPLICATION SERVICE (Sprint 19: DOM-003 §28-34)
// Tenant Business Finance, Invoicing, Receivables, Operating Expenses & Deposits
// ============================================================================

import type {
  OperationalInvoice,
  OperationalInvoiceLine,
  OperationalInvoiceStatus,
  CreditNote,
  CreditNoteLine,
  CreditNoteStatus,
  OperationalExpense,
  ExpenseCategory,
  ExpenseCategoryCode,
  ExpenseStatus,
  DepositPosition,
  DepositPositionStatus,
  RefundObligation,
  RefundObligationStatus,
  CustomerReceivablesSummary,
  CorporateReceivablesSummary,
  OperationalFinanceSummary,
  SettledRentalRevenueComponent,
  EligibleVehicleExpenseComponent,
  CreateInvoiceDto,
  GenerateRentalInvoiceDto,
  IssueInvoiceDto,
  VoidInvoiceDto,
  CreateCreditNoteDto,
  CreateExpenseDto,
  ApproveExpenseDto,
  RejectExpenseDto,
  IngestMaintenanceExpenseDto,
  CreateDepositPositionDto,
  ApplyDepositToInvoiceDto,
  CreateRefundObligationDto,
  RecordManualPaymentDto,
  FinancialPostingSource,
  CorporateAccount,
} from "@carhire/types";
import {
  IOperationalInvoiceRepository,
  ICreditNoteRepository,
  IExpenseRepository,
  IDepositPositionRepository,
  IRefundObligationRepository,
  IRentalRepository,
  ICustomerRepository,
  ICorporateAccountRepository,
  IMaintenanceRepository,
  IAuditRepository,
  IOutboxRepository,
  OperationalInvoiceNotFoundError,
  CreditNoteNotFoundError,
  OperationalExpenseNotFoundError,
  DepositPositionNotFoundError,
  RefundObligationNotFoundError,
  RentalNotFoundError,
  RecordNotFoundError,
  CreditNoteExceedsInvoiceTotalError,
  CreditNoteInvoiceNotIssuedError,
  DepositPositionExceededError,
  FinanceCurrencyMismatchError,
} from "@carhire/database";
import { InvoiceStateMachine } from "../domain/invoice-state-machine";
import { CreditNoteStateMachine } from "../domain/credit-note-state-machine";
import { ExpenseStateMachine } from "../domain/expense-state-machine";
import { FinancialPostingContractFactory } from "../domain/posting-contract.factory";

export interface FinanceActor {
  userId: string;
  tenantId: string;
  role?: string;
  isPlatformAdmin?: boolean;
}

function to4Dec(val: string | number | bigint | undefined): string {
  if (val === undefined || val === null) return "0.0000";
  if (typeof val === "number") {
    return val.toFixed(4);
  }
  const clean = String(val).trim();
  if (!clean) return "0.0000";
  const parts = clean.split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").padEnd(4, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

function num(val: string | number | undefined): number {
  if (!val) return 0;
  return typeof val === "number" ? val : parseFloat(val) || 0;
}

export class FinanceService {
  constructor(
    private readonly invoiceRepo: IOperationalInvoiceRepository,
    private readonly creditNoteRepo: ICreditNoteRepository,
    private readonly expenseRepo: IExpenseRepository,
    private readonly depositPositionRepo: IDepositPositionRepository,
    private readonly refundObligationRepo: IRefundObligationRepository,
    private readonly rentalRepo: IRentalRepository,
    private readonly customerRepo: ICustomerRepository,
    private readonly corporateAccountRepo?: ICorporateAccountRepository,
    private readonly maintenanceRepo?: IMaintenanceRepository,
    private readonly auditRepo?: IAuditRepository,
    private readonly outboxRepo?: IOutboxRepository,
    private readonly ledgerService?: { postFromSourceContract(tenantId: string, contract: any, actor: any): Promise<any> }
  ) {}

  private async dispatchPostingContract(tenantId: string, contract: any, actor: FinanceActor): Promise<void> {
    if (this.ledgerService) {
      try {
        await this.ledgerService.postFromSourceContract(tenantId, contract, { userId: actor.userId });
      } catch (err) {
        console.warn(`[FinanceService] Ledger auto-posting warning for ${contract?.eventType}:`, err);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 1. INVOICE OPERATIONS
  // --------------------------------------------------------------------------

  async createInvoice(
    tenantId: string,
    dto: CreateInvoiceDto,
    actor: FinanceActor
  ): Promise<OperationalInvoice> {
    const currency = (dto.currency || "KES").toUpperCase();
    const issueDate = dto.issueDate || new Date().toISOString().split("T")[0];

    let subtotalNum = 0;
    let taxTotalNum = 0;

    const lineItems: Array<Omit<OperationalInvoiceLine, "id" | "invoiceId">> = dto.lineItems.map(
      (item, idx) => {
        const qty = item.quantity > 0 ? item.quantity : 1;
        const uPrice = num(item.unitPrice);
        const net = qty * uPrice;
        const taxRate = item.taxRate !== undefined ? num(item.taxRate) : 0.16;
        const tax = net * taxRate;
        const gross = net + tax;

        subtotalNum += net;
        taxTotalNum += tax;

        return {
          lineType: item.lineType,
          description: item.description,
          quantity: qty,
          unitPrice: to4Dec(uPrice),
          netAmount: to4Dec(net),
          taxRate: to4Dec(taxRate),
          taxAmount: to4Dec(tax),
          grossAmount: to4Dec(gross),
          sourceType: item.sourceType || "MANUAL",
          sourceId: item.sourceId,
          sortOrder: idx,
        };
      }
    );

    const totalNum = subtotalNum + taxTotalNum;

    let billingSnapshot = dto.billingSnapshot;
    if (!billingSnapshot) {
      const customer = await this.customerRepo.findById(dto.customerId, tenantId);
      billingSnapshot = {
        customerName: customer ? customer.fullName : "Customer",
        customerEmail: customer?.email || "",
        customerPhone: customer?.phone || "",
        customerTaxId: customer?.taxPinNumber || customer?.idOrPassportNumber,
      };
    }

    const invoice = await this.invoiceRepo.create({
      tenantId,
      customerId: dto.customerId,
      corporateAccountId: dto.corporateAccountId,
      rentalId: dto.rentalId,
      bookingId: dto.bookingId,
      currency,
      status: "DRAFT",
      issueDate,
      dueDate: dto.dueDate,
      subtotal: to4Dec(subtotalNum),
      discountTotal: "0.0000",
      taxTotal: to4Dec(taxTotalNum),
      total: to4Dec(totalNum),
      amountPaid: "0.0000",
      amountCredited: "0.0000",
      amountOutstanding: to4Dec(totalNum),
      notes: dto.notes,
      billingSnapshot,
      lineItems: lineItems as OperationalInvoiceLine[],
    });

    await this.invoiceRepo.recordStatusTransition(
      invoice.id,
      tenantId,
      "DRAFT",
      "DRAFT",
      actor.userId,
      "Invoice draft created"
    );

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OPERATIONAL_INVOICE_CREATED",
      resourceType: "OPERATIONAL_INVOICE",
      resourceId: invoice.id,
      description: `Operational invoice draft ${invoice.invoiceNumber} created for customer ${dto.customerId}`,
      payload: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total },
    });

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.invoice.created",
      aggregateType: "OPERATIONAL_INVOICE",
      aggregateId: invoice.id,
      payload: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total },
    });

    return invoice;
  }

  async generateRentalInvoice(
    tenantId: string,
    dto: GenerateRentalInvoiceDto,
    actor: FinanceActor
  ): Promise<OperationalInvoice> {
    // 1. Check idempotency: Has an invoice already been generated for this rental?
    const existing = await this.invoiceRepo.findByRentalId(dto.rentalId, tenantId);
    if (existing) {
      return existing;
    }

    // 2. Fetch rental aggregate
    const rental = await this.rentalRepo.findById(dto.rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(dto.rentalId);
    }

    // 3. Fetch customer & corporate account if any
    const customer = await this.customerRepo.findById(rental.customerId, tenantId);
    let corporateAccount: CorporateAccount | null = null;
    const corpId = customer?.corporateAccountId;
    if (corpId && this.corporateAccountRepo) {
      corporateAccount = await this.corporateAccountRepo.findById(corpId, tenantId);
    }

    const billingSnapshot = {
      customerName: customer ? customer.fullName : "Customer",
      customerEmail: customer?.email || "",
      customerPhone: customer?.phone || "",
      customerTaxId: customer?.taxPinNumber || customer?.idOrPassportNumber,
      corporateAccountName: corporateAccount?.companyName,
      corporateRegistrationNumber: corporateAccount?.registrationNumber,
    };

    // 4. Fetch final calculation and start snapshot
    const finalCalc = await this.rentalRepo.getFinalCalculation(dto.rentalId, tenantId);
    const startSnapshot = await this.rentalRepo.getStartSnapshot(dto.rentalId, tenantId);

    const currency = (startSnapshot?.pricingSnapshot?.currency || "KES").toUpperCase();
    const now = new Date().toISOString();
    const issueDate = now.split("T")[0];
    const dueDate =
      dto.dueDate ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const lines: Array<Omit<OperationalInvoiceLine, "id" | "invoiceId">> = [];
    let sortOrder = 0;

    if (finalCalc && finalCalc.lineItems && finalCalc.lineItems.length > 0) {
      for (const item of finalCalc.lineItems) {
        let lineType: OperationalInvoiceLine["lineType"] = "CUSTOM_FEE";
        let taxRate = 0.16;

        if (item.code === "BASE_RENTAL") {
          lineType = "RENTAL_BASE";
        } else if (item.code.startsWith("EXTENSION")) {
          lineType = "RENTAL_EXTENSION";
        } else if (item.code === "EXCESS_MILEAGE") {
          lineType = "EXCESS_MILEAGE";
        } else if (item.code === "FUEL_DEFICIT") {
          lineType = "FUEL_DEFICIT";
          taxRate = 0; // Fuel deficit pass-through
        } else if (item.code === "REFUELING_SURCHARGE") {
          lineType = "REFUELING_FEE";
        } else if (item.code === "LATE_RETURN_FEE") {
          lineType = "LATE_RETURN";
        } else if (item.code === "DAMAGE_ASSESSMENT") {
          lineType = "DAMAGE_CHARGE";
          taxRate = 0; // Damage compensation is exempt
        }

        const net = item.totalAmount;
        const tax = item.taxAmount > 0 ? item.taxAmount : net * taxRate;
        const gross = net + tax;

        lines.push({
          lineType,
          description: item.label || item.code,
          quantity: item.quantity || 1,
          unitPrice: to4Dec(item.unitPrice || net),
          netAmount: to4Dec(net),
          taxRate: to4Dec(taxRate),
          taxAmount: to4Dec(tax),
          grossAmount: to4Dec(gross),
          sourceType: "RENTAL",
          sourceId: rental.id,
          sortOrder: sortOrder++,
        });
      }
    } else {
      // Fallback: Use start snapshot gross total
      const baseGross = startSnapshot?.pricingSnapshot?.grossTotal || 0;
      const net = Math.round((baseGross / 1.16) * 100) / 100;
      const tax = Math.round((baseGross - net) * 100) / 100;

      lines.push({
        lineType: "RENTAL_BASE",
        description: `Base Rental Fee (${rental.rentalNumber})`,
        quantity: 1,
        unitPrice: to4Dec(net),
        netAmount: to4Dec(net),
        taxRate: to4Dec(0.16),
        taxAmount: to4Dec(tax),
        grossAmount: to4Dec(baseGross),
        sourceType: "RENTAL",
        sourceId: rental.id,
        sortOrder: sortOrder++,
      });
    }

    const subtotalNum = lines.reduce((s, l) => s + num(l.netAmount), 0);
    const taxTotalNum = lines.reduce((s, l) => s + num(l.taxAmount), 0);
    const grossTotalNum = subtotalNum + taxTotalNum;

    // 5. Check deposit position on rental and handle reconciliation
    let depositPosition = await this.depositPositionRepo.findByRentalId(rental.id, tenantId);
    if (!depositPosition && startSnapshot?.depositRequirement && startSnapshot.depositRequirement > 0) {
      depositPosition = await this.depositPositionRepo.create({
        tenantId,
        rentalId: rental.id,
        bookingId: rental.bookingId,
        customerId: rental.customerId,
        currency,
        requiredAmount: to4Dec(startSnapshot.depositRequirement),
        receivedAmount: to4Dec(startSnapshot.depositRequirement),
        heldAmount: to4Dec(startSnapshot.depositRequirement),
        appliedAmount: "0.0000",
        refundDueAmount: "0.0000",
        refundedAmount: "0.0000",
        forfeitedAmount: "0.0000",
        status: "HELD",
        notes: `Pre-authorized deposit for rental ${rental.rentalNumber}`,
      });
    }

    let appliedDepositNum = 0;
    const shouldApplyDeposit = dto.applyDepositDeduction !== false;

    if (shouldApplyDeposit && depositPosition && num(depositPosition.heldAmount) > 0) {
      const held = num(depositPosition.heldAmount);
      appliedDepositNum = Math.min(held, grossTotalNum);
      const remainingHeld = held - appliedDepositNum;

      let nextDepositStatus: DepositPositionStatus = "APPLIED";
      if (remainingHeld > 0) {
        nextDepositStatus = "REFUND_DUE";
      }

      await this.depositPositionRepo.update(depositPosition.id, tenantId, {
        heldAmount: to4Dec(remainingHeld),
        appliedAmount: to4Dec(num(depositPosition.appliedAmount) + appliedDepositNum),
        refundDueAmount: to4Dec(remainingHeld),
        status: nextDepositStatus,
      });

      // If there is an excess deposit held, create refund obligation
      if (remainingHeld > 0) {
        await this.refundObligationRepo.create({
          tenantId,
          rentalId: rental.id,
          depositPositionId: depositPosition.id,
          customerId: rental.customerId,
          currency,
          amount: to4Dec(remainingHeld),
          reason: `Excess deposit refund after rental completion (${rental.rentalNumber})`,
          status: "PENDING",
        });
      }
    }

    const amountPaidNum = appliedDepositNum;
    const amountOutstandingNum = Math.max(0, grossTotalNum - amountPaidNum);
    const invoiceStatus: OperationalInvoiceStatus =
      amountOutstandingNum === 0 ? "PAID" : amountPaidNum > 0 ? "PARTIALLY_PAID" : "ISSUED";

    const invoice = await this.invoiceRepo.create({
      tenantId,
      customerId: rental.customerId,
      corporateAccountId: customer?.corporateAccountId || undefined,
      rentalId: rental.id,
      bookingId: rental.bookingId,
      currency,
      status: invoiceStatus,
      issueDate,
      dueDate,
      subtotal: to4Dec(subtotalNum),
      discountTotal: "0.0000",
      taxTotal: to4Dec(taxTotalNum),
      total: to4Dec(grossTotalNum),
      amountPaid: to4Dec(amountPaidNum),
      amountCredited: "0.0000",
      amountOutstanding: to4Dec(amountOutstandingNum),
      notes: dto.notes || `Authoritative operational invoice for rental ${rental.rentalNumber}`,
      billingSnapshot,
      lineItems: lines as OperationalInvoiceLine[],
      issuedAt: now,
      paidAt: invoiceStatus === "PAID" ? now : undefined,
    });

    await this.invoiceRepo.recordStatusTransition(
      invoice.id,
      tenantId,
      "DRAFT",
      invoiceStatus,
      actor.userId,
      `Generated authoritative rental invoice for ${rental.rentalNumber}`
    );

    // Audit & Outbox
    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "RENTAL_INVOICE_GENERATED",
      resourceType: "OPERATIONAL_INVOICE",
      resourceId: invoice.id,
      description: `Generated operational invoice ${invoice.invoiceNumber} for rental ${rental.rentalNumber}`,
      payload: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total, appliedDeposit: appliedDepositNum },
    });

    const postingContract = FinancialPostingContractFactory.createInvoiceIssuedPostingContract(invoice);
    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.invoice.issued",
      aggregateType: "OPERATIONAL_INVOICE",
      aggregateId: invoice.id,
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        rentalId: rental.id,
        total: invoice.total,
        postingContract,
      },
    });

    await this.dispatchPostingContract(tenantId, postingContract, actor);

    return invoice;
  }

  async issueInvoice(
    tenantId: string,
    invoiceId: string,
    dto: IssueInvoiceDto,
    actor: FinanceActor
  ): Promise<OperationalInvoice> {
    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);
    if (!invoice) {
      throw new OperationalInvoiceNotFoundError(invoiceId);
    }

    InvoiceStateMachine.validateTransition(invoice.status, "ISSUED");

    const now = new Date().toISOString();
    const updated = await this.invoiceRepo.update(
      invoiceId,
      tenantId,
      {
        status: "ISSUED",
        issuedAt: now,
        notes: dto.notes ? `${invoice.notes ? invoice.notes + "\n" : ""}${dto.notes}` : invoice.notes,
      },
      invoice.version
    );

    await this.invoiceRepo.recordStatusTransition(
      invoiceId,
      tenantId,
      invoice.status,
      "ISSUED",
      actor.userId,
      "Invoice formally issued"
    );

    const postingContract = FinancialPostingContractFactory.createInvoiceIssuedPostingContract(updated);

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OPERATIONAL_INVOICE_ISSUED",
      resourceType: "OPERATIONAL_INVOICE",
      resourceId: invoiceId,
      description: `Operational invoice ${updated.invoiceNumber} issued`,
      payload: { invoiceId, invoiceNumber: updated.invoiceNumber },
    });

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.invoice.issued",
      aggregateType: "OPERATIONAL_INVOICE",
      aggregateId: invoiceId,
      payload: {
        invoiceId,
        invoiceNumber: updated.invoiceNumber,
        total: updated.total,
        postingContract,
      },
    });

    await this.dispatchPostingContract(tenantId, postingContract, actor);

    return updated;
  }

  async voidInvoice(
    tenantId: string,
    invoiceId: string,
    dto: VoidInvoiceDto,
    actor: FinanceActor
  ): Promise<OperationalInvoice> {
    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);
    if (!invoice) {
      throw new OperationalInvoiceNotFoundError(invoiceId);
    }

    InvoiceStateMachine.validateTransition(invoice.status, "VOIDED");

    const now = new Date().toISOString();
    const updated = await this.invoiceRepo.update(
      invoiceId,
      tenantId,
      {
        status: "VOIDED",
        voidedAt: now,
        voidReason: dto.reason,
      },
      invoice.version
    );

    await this.invoiceRepo.recordStatusTransition(
      invoiceId,
      tenantId,
      invoice.status,
      "VOIDED",
      actor.userId,
      dto.reason
    );

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OPERATIONAL_INVOICE_VOIDED",
      resourceType: "OPERATIONAL_INVOICE",
      resourceId: invoiceId,
      description: `Operational invoice ${updated.invoiceNumber} voided. Reason: ${dto.reason}`,
      payload: { invoiceId, invoiceNumber: updated.invoiceNumber, reason: dto.reason },
    });

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.invoice.voided",
      aggregateType: "OPERATIONAL_INVOICE",
      aggregateId: invoiceId,
      payload: { invoiceId, invoiceNumber: updated.invoiceNumber, reason: dto.reason },
    });

    return updated;
  }

  async recordManualPayment(
    tenantId: string,
    dto: RecordManualPaymentDto,
    actor: FinanceActor
  ): Promise<OperationalInvoice> {
    const invoice = await this.invoiceRepo.findById(dto.invoiceId, tenantId);
    if (!invoice) {
      throw new OperationalInvoiceNotFoundError(dto.invoiceId);
    }

    if (invoice.status === "VOIDED" || invoice.status === "DRAFT") {
      throw new Error(`Cannot record payment on invoice in status '${invoice.status}'`);
    }

    const payAmount = num(dto.amount);
    if (payAmount <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }

    const newAmountPaid = num(invoice.amountPaid) + payAmount;
    const grossTotal = num(invoice.total);
    const amountCredited = num(invoice.amountCredited);
    const newAmountOutstanding = Math.max(0, grossTotal - amountCredited - newAmountPaid);

    let newStatus: OperationalInvoiceStatus = invoice.status;
    if (newAmountOutstanding === 0) {
      newStatus = "PAID";
    } else if (newAmountPaid > 0) {
      newStatus = "PARTIALLY_PAID";
    }

    const now = dto.paidAt || new Date().toISOString();
    const updated = await this.invoiceRepo.update(
      invoice.id,
      tenantId,
      {
        amountPaid: to4Dec(newAmountPaid),
        amountOutstanding: to4Dec(newAmountOutstanding),
        status: newStatus,
        paidAt: newStatus === "PAID" ? now : invoice.paidAt,
      },
      invoice.version
    );

    await this.invoiceRepo.recordStatusTransition(
      invoice.id,
      tenantId,
      invoice.status,
      newStatus,
      actor.userId,
      `Manual payment of ${payAmount} recorded (${dto.paymentMethod} ref: ${dto.transactionReference})`
    );

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OPERATIONAL_PAYMENT_RECORDED",
      resourceType: "OPERATIONAL_INVOICE",
      resourceId: invoice.id,
      description: `Payment of ${payAmount} ${invoice.currency} recorded on invoice ${invoice.invoiceNumber}`,
      payload: { invoiceId: invoice.id, amount: payAmount, method: dto.paymentMethod, ref: dto.transactionReference },
    });

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.payment.recorded",
      aggregateType: "OPERATIONAL_INVOICE",
      aggregateId: invoice.id,
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: to4Dec(payAmount),
        currency: invoice.currency,
        method: dto.paymentMethod,
        ref: dto.transactionReference,
      },
    });

    return updated;
  }

  // --------------------------------------------------------------------------
  // 2. CREDIT NOTE OPERATIONS
  // --------------------------------------------------------------------------

  async createCreditNote(
    tenantId: string,
    dto: CreateCreditNoteDto,
    actor: FinanceActor
  ): Promise<CreditNote> {
    const invoice = await this.invoiceRepo.findById(dto.invoiceId, tenantId);
    if (!invoice) {
      throw new OperationalInvoiceNotFoundError(dto.invoiceId);
    }

    if (invoice.status === "DRAFT" || invoice.status === "VOIDED") {
      throw new CreditNoteInvoiceNotIssuedError(invoice.id, invoice.status);
    }

    let subtotalNum = 0;
    let taxTotalNum = 0;

    const lines: Array<Omit<CreditNoteLine, "id" | "creditNoteId">> = dto.lines.map((line) => {
      const qty = line.quantity > 0 ? line.quantity : 1;
      const uPrice = num(line.unitPrice);
      const net = qty * uPrice;
      const taxRate = line.taxRate !== undefined ? num(line.taxRate) : 0.16;
      const tax = net * taxRate;
      const gross = net + tax;

      subtotalNum += net;
      taxTotalNum += tax;

      return {
        invoiceLineId: line.invoiceLineId,
        description: line.description,
        quantity: qty,
        unitPrice: to4Dec(uPrice),
        netAmount: to4Dec(net),
        taxRate: to4Dec(taxRate),
        taxAmount: to4Dec(tax),
        grossAmount: to4Dec(gross),
      };
    });

    const creditTotalNum = subtotalNum + taxTotalNum;

    // Concurrency / Cap validation: Verify credit doesn't exceed invoice balance
    const existingCreditNotes = await this.creditNoteRepo.listByInvoiceId(invoice.id, tenantId);
    const existingIssuedCredited = existingCreditNotes
      .filter((c) => c.status === "ISSUED")
      .reduce((s, c) => s + num(c.total), 0);

    const remainingUncredited = Math.max(0, num(invoice.total) - existingIssuedCredited);
    if (creditTotalNum > remainingUncredited + 0.0001) {
      throw new CreditNoteExceedsInvoiceTotalError(
        to4Dec(creditTotalNum),
        to4Dec(remainingUncredited),
        invoice.id
      );
    }

    const creditNote = await this.creditNoteRepo.create({
      tenantId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      rentalId: invoice.rentalId,
      currency: invoice.currency,
      status: "DRAFT",
      issueDate: new Date().toISOString().split("T")[0],
      reason: dto.reason,
      subtotal: to4Dec(subtotalNum),
      taxTotal: to4Dec(taxTotalNum),
      total: to4Dec(creditTotalNum),
      lines: lines as CreditNoteLine[],
    });

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "CREDIT_NOTE_CREATED",
      resourceType: "CREDIT_NOTE",
      resourceId: creditNote.id,
      description: `Credit note draft ${creditNote.creditNoteNumber} created against invoice ${invoice.invoiceNumber}`,
      payload: { creditNoteId: creditNote.id, invoiceId: invoice.id, total: creditNote.total },
    });

    return creditNote;
  }

  async issueCreditNote(
    tenantId: string,
    creditNoteId: string,
    actor: FinanceActor
  ): Promise<CreditNote> {
    const creditNote = await this.creditNoteRepo.findById(creditNoteId, tenantId);
    if (!creditNote) {
      throw new CreditNoteNotFoundError(creditNoteId);
    }

    CreditNoteStateMachine.validateTransition(creditNote.status, "ISSUED");

    const invoice = await this.invoiceRepo.findById(creditNote.invoiceId, tenantId);
    if (!invoice) {
      throw new OperationalInvoiceNotFoundError(creditNote.invoiceId);
    }

    // Re-verify cap under concurrency protection
    const existingCreditNotes = await this.creditNoteRepo.listByInvoiceId(invoice.id, tenantId);
    const existingIssuedCredited = existingCreditNotes
      .filter((c) => c.id !== creditNote.id && c.status === "ISSUED")
      .reduce((s, c) => s + num(c.total), 0);

    const creditTotal = num(creditNote.total);
    const invoiceGross = num(invoice.total);
    const remainingUncredited = Math.max(0, invoiceGross - existingIssuedCredited);

    if (creditTotal > remainingUncredited + 0.0001) {
      throw new CreditNoteExceedsInvoiceTotalError(
        to4Dec(creditTotal),
        to4Dec(remainingUncredited),
        invoice.id
      );
    }

    // Update credit note to ISSUED
    const now = new Date().toISOString();
    const updatedCreditNote = await this.creditNoteRepo.update(
      creditNoteId,
      tenantId,
      {
        status: "ISSUED",
        issuedAt: now,
      },
      creditNote.version
    );

    // Update invoice: apply credit note against amount outstanding
    const newAmountCredited = existingIssuedCredited + creditTotal;
    const currentPaid = num(invoice.amountPaid);
    const newAmountOutstanding = Math.max(0, invoiceGross - currentPaid - newAmountCredited);

    await this.invoiceRepo.update(
      invoice.id,
      tenantId,
      {
        amountCredited: to4Dec(newAmountCredited),
        amountOutstanding: to4Dec(newAmountOutstanding),
      },
      invoice.version
    );

    const postingContract = FinancialPostingContractFactory.createCreditNoteIssuedPostingContract(updatedCreditNote);

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "CREDIT_NOTE_ISSUED",
      resourceType: "CREDIT_NOTE",
      resourceId: creditNoteId,
      description: `Credit note ${updatedCreditNote.creditNoteNumber} issued against invoice ${invoice.invoiceNumber}`,
      payload: { creditNoteId, invoiceId: invoice.id, total: updatedCreditNote.total },
    });

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.credit_note.issued",
      aggregateType: "CREDIT_NOTE",
      aggregateId: creditNoteId,
      payload: {
        creditNoteId,
        creditNoteNumber: updatedCreditNote.creditNoteNumber,
        invoiceId: invoice.id,
        total: updatedCreditNote.total,
        postingContract,
      },
    });

    await this.dispatchPostingContract(tenantId, postingContract, actor);

    return updatedCreditNote;
  }

  async voidCreditNote(
    tenantId: string,
    creditNoteId: string,
    reason: string,
    actor: FinanceActor
  ): Promise<CreditNote> {
    const creditNote = await this.creditNoteRepo.findById(creditNoteId, tenantId);
    if (!creditNote) {
      throw new CreditNoteNotFoundError(creditNoteId);
    }

    CreditNoteStateMachine.validateTransition(creditNote.status, "VOIDED");

    const now = new Date().toISOString();
    const updated = await this.creditNoteRepo.update(
      creditNoteId,
      tenantId,
      {
        status: "VOIDED",
        voidedAt: now,
        voidReason: reason,
      },
      creditNote.version
    );

    // If credit note was previously ISSUED, reverse its effect on the invoice
    if (creditNote.status === "ISSUED") {
      const invoice = await this.invoiceRepo.findById(creditNote.invoiceId, tenantId);
      if (invoice) {
        const creditTotal = num(creditNote.total);
        const newAmountCredited = Math.max(0, num(invoice.amountCredited) - creditTotal);
        const newAmountOutstanding = Math.max(
          0,
          num(invoice.total) - num(invoice.amountPaid) - newAmountCredited
        );

        await this.invoiceRepo.update(
          invoice.id,
          tenantId,
          {
            amountCredited: to4Dec(newAmountCredited),
            amountOutstanding: to4Dec(newAmountOutstanding),
          },
          invoice.version
        );
      }
    }

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "CREDIT_NOTE_VOIDED",
      resourceType: "CREDIT_NOTE",
      resourceId: creditNoteId,
      description: `Credit note ${updated.creditNoteNumber} voided. Reason: ${reason}`,
      payload: { creditNoteId, reason },
    });

    return updated;
  }

  // --------------------------------------------------------------------------
  // 3. OPERATING EXPENSE OPERATIONS
  // --------------------------------------------------------------------------

  async createExpense(
    tenantId: string,
    dto: CreateExpenseDto,
    actor: FinanceActor
  ): Promise<OperationalExpense> {
    const net = num(dto.netAmount);
    if (net <= 0) {
      throw new Error("Expense net amount must be greater than zero");
    }

    const tax = dto.taxAmount !== undefined ? num(dto.taxAmount) : 0;
    const gross = net + tax;
    const currency = (dto.currency || "KES").toUpperCase();

    const expense = await this.expenseRepo.create({
      tenantId,
      category: dto.category,
      categoryId: dto.category.toLowerCase(),
      vehicleId: dto.vehicleId,
      rentalId: dto.rentalId,
      maintenanceId: dto.maintenanceId,
      vehicleOwnerId: dto.vehicleOwnerId,
      supplierId: dto.supplierId,
      payeeName: dto.payeeName,
      description: dto.description,
      expenseDate: dto.expenseDate || new Date().toISOString().split("T")[0],
      currency,
      netAmount: to4Dec(net),
      taxAmount: to4Dec(tax),
      grossAmount: to4Dec(gross),
      status: "DRAFT",
      receiptFileReference: dto.receiptFileReference,
      notes: dto.notes,
      ownerDeductible: dto.ownerDeductible ?? false,
      createdBy: actor.userId,
    });

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OPERATIONAL_EXPENSE_CREATED",
      resourceType: "OPERATIONAL_EXPENSE",
      resourceId: expense.id,
      description: `Operational expense ${expense.expenseNumber} (${expense.category}) created`,
      payload: { expenseId: expense.id, grossAmount: expense.grossAmount },
    });

    return expense;
  }

  async submitExpense(
    tenantId: string,
    expenseId: string,
    actor: FinanceActor
  ): Promise<OperationalExpense> {
    const expense = await this.expenseRepo.findById(expenseId, tenantId);
    if (!expense) {
      throw new OperationalExpenseNotFoundError(expenseId);
    }

    ExpenseStateMachine.validateTransition(expense.status, "SUBMITTED");

    const updated = await this.expenseRepo.update(
      expenseId,
      tenantId,
      {
        status: "SUBMITTED",
      },
      expense.version
    );

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OPERATIONAL_EXPENSE_SUBMITTED",
      resourceType: "OPERATIONAL_EXPENSE",
      resourceId: expenseId,
      description: `Expense ${updated.expenseNumber} submitted for approval`,
      payload: { expenseId },
    });

    return updated;
  }

  async approveExpense(
    tenantId: string,
    expenseId: string,
    dto: ApproveExpenseDto,
    actor: FinanceActor
  ): Promise<OperationalExpense> {
    const expense = await this.expenseRepo.findById(expenseId, tenantId);
    if (!expense) {
      throw new OperationalExpenseNotFoundError(expenseId);
    }

    ExpenseStateMachine.validateTransition(expense.status, "APPROVED");

    // Enforce 4-eyes approval rule (creator cannot approve their own expense)
    ExpenseStateMachine.validateFourEyesApproval(expenseId, expense.createdBy, actor.userId, true);

    const now = new Date().toISOString();
    const updated = await this.expenseRepo.update(
      expenseId,
      tenantId,
      {
        status: "APPROVED",
        approvedBy: actor.userId,
        approvedAt: now,
        notes: dto.notes ? `${expense.notes ? expense.notes + "\n" : ""}${dto.notes}` : expense.notes,
      },
      expense.version
    );

    const postingContract = FinancialPostingContractFactory.createExpenseApprovedPostingContract(updated);

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OPERATIONAL_EXPENSE_APPROVED",
      resourceType: "OPERATIONAL_EXPENSE",
      resourceId: expenseId,
      description: `Expense ${updated.expenseNumber} approved by ${actor.userId}`,
      payload: { expenseId, approvedBy: actor.userId },
    });

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.expense.approved",
      aggregateType: "OPERATIONAL_EXPENSE",
      aggregateId: expenseId,
      payload: {
        expenseId,
        expenseNumber: updated.expenseNumber,
        grossAmount: updated.grossAmount,
        postingContract,
      },
    });

    await this.dispatchPostingContract(tenantId, postingContract, actor);

    return updated;
  }

  async rejectExpense(
    tenantId: string,
    expenseId: string,
    dto: RejectExpenseDto,
    actor: FinanceActor
  ): Promise<OperationalExpense> {
    const expense = await this.expenseRepo.findById(expenseId, tenantId);
    if (!expense) {
      throw new OperationalExpenseNotFoundError(expenseId);
    }

    ExpenseStateMachine.validateTransition(expense.status, "REJECTED");

    const now = new Date().toISOString();
    const updated = await this.expenseRepo.update(
      expenseId,
      tenantId,
      {
        status: "REJECTED",
        rejectedBy: actor.userId,
        rejectedAt: now,
        rejectionReason: dto.reason,
      },
      expense.version
    );

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OPERATIONAL_EXPENSE_REJECTED",
      resourceType: "OPERATIONAL_EXPENSE",
      resourceId: expenseId,
      description: `Expense ${updated.expenseNumber} rejected. Reason: ${dto.reason}`,
      payload: { expenseId, reason: dto.reason },
    });

    return updated;
  }

  async voidExpense(
    tenantId: string,
    expenseId: string,
    reason: string,
    actor: FinanceActor
  ): Promise<OperationalExpense> {
    const expense = await this.expenseRepo.findById(expenseId, tenantId);
    if (!expense) {
      throw new OperationalExpenseNotFoundError(expenseId);
    }

    ExpenseStateMachine.validateTransition(expense.status, "VOIDED");

    const now = new Date().toISOString();
    const updated = await this.expenseRepo.update(
      expenseId,
      tenantId,
      {
        status: "VOIDED",
        voidedAt: now,
        voidReason: reason,
      },
      expense.version
    );

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OPERATIONAL_EXPENSE_VOIDED",
      resourceType: "OPERATIONAL_EXPENSE",
      resourceId: expenseId,
      description: `Expense ${updated.expenseNumber} voided. Reason: ${reason}`,
      payload: { expenseId, reason },
    });

    return updated;
  }

  async ingestMaintenanceExpense(
    tenantId: string,
    dto: IngestMaintenanceExpenseDto,
    actor: FinanceActor
  ): Promise<OperationalExpense> {
    // 1. Check idempotency: Has this maintenance work order already been ingested?
    const existing = await this.expenseRepo.findByMaintenanceId(dto.maintenanceWorkOrderId, tenantId);
    if (existing) {
      return existing;
    }

    if (!this.maintenanceRepo) {
      throw new Error("Maintenance repository is required for maintenance expense ingestion");
    }

    // 2. Fetch completed maintenance work order
    const workOrder = await this.maintenanceRepo.findById(dto.maintenanceWorkOrderId, tenantId);
    if (!workOrder) {
      throw new RecordNotFoundError("MaintenanceWorkOrder", dto.maintenanceWorkOrderId);
    }

    if (workOrder.status !== "COMPLETED") {
      throw new Error(`Cannot ingest maintenance work order in status '${workOrder.status}'. Only COMPLETED work orders are billable.`);
    }

    // 3. Compute verified actual cost
    let actualCost = workOrder.actualCost;
    if (actualCost <= 0) {
      const partsSum = (workOrder.parts || []).reduce((s, p) => s + (p.totalCost || 0), 0);
      const tasksSum = (workOrder.tasks || []).reduce((s, t) => s + (t.actualCost || 0), 0);
      const costItemsSum = (workOrder.costItems || []).reduce((s, c) => s + (c.actualCost || 0), 0);
      actualCost = partsSum + tasksSum + costItemsSum;
    }

    if (actualCost <= 0) {
      actualCost = 0.0001; // Avoid zero-cost assertion block if fully pro bono
    }

    const now = new Date().toISOString();

    // 4. Create and auto-approve verified system maintenance expense
    const expense = await this.expenseRepo.create({
      tenantId,
      category: "MAINTENANCE",
      categoryId: "cat_maintenance",
      vehicleId: workOrder.vehicleId,
      maintenanceId: workOrder.id,
      vehicleOwnerId: dto.vehicleOwnerId,
      supplierId: workOrder.garageId,
      payeeName: workOrder.garageName || "Authorized Service Provider",
      description: `Completed Maintenance: ${workOrder.maintenanceNumber} (${workOrder.maintenanceType})`,
      expenseDate: workOrder.actualCompletedAt ? workOrder.actualCompletedAt.split("T")[0] : now.split("T")[0],
      currency: "KES",
      netAmount: to4Dec(actualCost),
      taxAmount: "0.0000",
      grossAmount: to4Dec(actualCost),
      status: "APPROVED",
      ownerDeductible: dto.ownerDeductible ?? true,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      approvedAt: now,
    });

    const postingContract = FinancialPostingContractFactory.createExpenseApprovedPostingContract(expense);

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "MAINTENANCE_EXPENSE_INGESTED",
      resourceType: "OPERATIONAL_EXPENSE",
      resourceId: expense.id,
      description: `Maintenance work order ${workOrder.maintenanceNumber} ingested as expense ${expense.expenseNumber}`,
      payload: { expenseId: expense.id, maintenanceId: workOrder.id, actualCost },
    });

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.expense.approved",
      aggregateType: "OPERATIONAL_EXPENSE",
      aggregateId: expense.id,
      payload: {
        expenseId: expense.id,
        expenseNumber: expense.expenseNumber,
        maintenanceId: workOrder.id,
        grossAmount: expense.grossAmount,
        postingContract,
      },
    });

    return expense;
  }

  // --------------------------------------------------------------------------
  // 4. DEPOSIT POSITIONS & REFUND OBLIGATIONS
  // --------------------------------------------------------------------------

  async createDepositPosition(
    tenantId: string,
    dto: CreateDepositPositionDto,
    actor: FinanceActor
  ): Promise<DepositPosition> {
    const existing = await this.depositPositionRepo.findByRentalId(dto.rentalId, tenantId);
    if (existing) {
      return existing;
    }

    const reqAmt = num(dto.requiredAmount);
    const recAmt = num(dto.receivedAmount);
    const currency = (dto.currency || "KES").toUpperCase();

    const deposit = await this.depositPositionRepo.create({
      tenantId,
      rentalId: dto.rentalId,
      bookingId: dto.bookingId,
      customerId: dto.customerId,
      currency,
      requiredAmount: to4Dec(reqAmt),
      receivedAmount: to4Dec(recAmt),
      heldAmount: to4Dec(recAmt),
      appliedAmount: "0.0000",
      refundDueAmount: "0.0000",
      refundedAmount: "0.0000",
      forfeitedAmount: "0.0000",
      status: "HELD",
      notes: dto.notes,
    });

    const postingContract = FinancialPostingContractFactory.createDepositReceivedPostingContract(deposit);

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "DEPOSIT_POSITION_CREATED",
      resourceType: "DEPOSIT_POSITION",
      resourceId: deposit.id,
      description: `Deposit position created for rental ${dto.rentalId} (${deposit.heldAmount} held)`,
      payload: { depositId: deposit.id, heldAmount: deposit.heldAmount },
    });

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.deposit.received",
      aggregateType: "DEPOSIT_POSITION",
      aggregateId: deposit.id,
      payload: {
        depositId: deposit.id,
        rentalId: deposit.rentalId,
        heldAmount: deposit.heldAmount,
        postingContract,
      },
    });

    return deposit;
  }

  async applyDepositToInvoice(
    tenantId: string,
    dto: ApplyDepositToInvoiceDto,
    actor: FinanceActor
  ): Promise<{ deposit: DepositPosition; invoice: OperationalInvoice }> {
    const deposit = await this.depositPositionRepo.findById(dto.depositPositionId, tenantId);
    if (!deposit) {
      throw new DepositPositionNotFoundError(dto.depositPositionId);
    }

    const invoice = await this.invoiceRepo.findById(dto.invoiceId, tenantId);
    if (!invoice) {
      throw new OperationalInvoiceNotFoundError(dto.invoiceId);
    }

    if (deposit.currency !== invoice.currency) {
      throw new FinanceCurrencyMismatchError(deposit.currency, invoice.currency);
    }

    const toApply = num(dto.amountToApply);
    const held = num(deposit.heldAmount);

    if (toApply > held + 0.0001) {
      throw new DepositPositionExceededError(to4Dec(toApply), to4Dec(held));
    }

    const newHeld = held - toApply;
    const newApplied = num(deposit.appliedAmount) + toApply;

    const updatedDeposit = await this.depositPositionRepo.update(
      deposit.id,
      tenantId,
      {
        heldAmount: to4Dec(newHeld),
        appliedAmount: to4Dec(newApplied),
        status: newHeld === 0 ? "APPLIED" : "PARTIALLY_REFUNDED",
      },
      deposit.version
    );

    const newAmountPaid = num(invoice.amountPaid) + toApply;
    const newAmountOutstanding = Math.max(
      0,
      num(invoice.total) - num(invoice.amountCredited) - newAmountPaid
    );
    const newInvoiceStatus: OperationalInvoiceStatus =
      newAmountOutstanding === 0 ? "PAID" : "PARTIALLY_PAID";

    const updatedInvoice = await this.invoiceRepo.update(
      invoice.id,
      tenantId,
      {
        amountPaid: to4Dec(newAmountPaid),
        amountOutstanding: to4Dec(newAmountOutstanding),
        status: newInvoiceStatus,
      },
      invoice.version
    );

    const postingContract = FinancialPostingContractFactory.createDepositAppliedPostingContract(
      updatedDeposit,
      updatedInvoice.invoiceNumber,
      to4Dec(toApply)
    );

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "DEPOSIT_APPLIED_TO_INVOICE",
      resourceType: "DEPOSIT_POSITION",
      resourceId: deposit.id,
      description: `Applied ${toApply} from deposit ${deposit.id} to invoice ${updatedInvoice.invoiceNumber}`,
      payload: { depositId: deposit.id, invoiceId: invoice.id, amountApplied: toApply },
    });

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.deposit.applied",
      aggregateType: "DEPOSIT_POSITION",
      aggregateId: deposit.id,
      payload: {
        depositId: deposit.id,
        invoiceId: invoice.id,
        amountApplied: to4Dec(toApply),
        postingContract,
      },
    });

    return { deposit: updatedDeposit, invoice: updatedInvoice };
  }

  async createRefundObligation(
    tenantId: string,
    dto: CreateRefundObligationDto,
    actor: FinanceActor
  ): Promise<RefundObligation> {
    const amountNum = num(dto.amount);
    if (amountNum <= 0) {
      throw new Error("Refund amount must be greater than zero");
    }

    const refund = await this.refundObligationRepo.create({
      tenantId,
      depositPositionId: dto.depositPositionId,
      rentalId: dto.rentalId,
      invoiceId: dto.invoiceId,
      customerId: dto.customerId,
      currency: (dto.currency || "KES").toUpperCase(),
      amount: to4Dec(amountNum),
      reason: dto.reason,
      status: "PENDING",
    });

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "REFUND_OBLIGATION_CREATED",
      resourceType: "REFUND_OBLIGATION",
      resourceId: refund.id,
      description: `Refund obligation ${refund.id} of ${refund.amount} ${refund.currency} created`,
      payload: { refundId: refund.id, amount: refund.amount },
    });

    return refund;
  }

  async approveRefundObligation(
    tenantId: string,
    refundId: string,
    actor: FinanceActor
  ): Promise<RefundObligation> {
    const refund = await this.refundObligationRepo.findById(refundId, tenantId);
    if (!refund) {
      throw new RefundObligationNotFoundError(refundId);
    }

    const now = new Date().toISOString();
    const updated = await this.refundObligationRepo.update(
      refundId,
      tenantId,
      {
        status: "APPROVED",
        approvedBy: actor.userId,
        approvedAt: now,
      },
      refund.version
    );

    const postingContract = FinancialPostingContractFactory.createRefundApprovedPostingContract(updated);

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "REFUND_OBLIGATION_APPROVED",
      resourceType: "REFUND_OBLIGATION",
      resourceId: refundId,
      description: `Refund obligation ${refundId} approved by ${actor.userId}`,
      payload: { refundId, amount: updated.amount },
    });

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "finance.refund.approved",
      aggregateType: "REFUND_OBLIGATION",
      aggregateId: refundId,
      payload: {
        refundId,
        amount: updated.amount,
        postingContract,
      },
    });

    return updated;
  }

  // --------------------------------------------------------------------------
  // 5. RECEIVABLES & FINANCIAL SUMMARIES (Read Models)
  // --------------------------------------------------------------------------

  async getCustomerReceivables(
    tenantId: string,
    customerId: string
  ): Promise<CustomerReceivablesSummary> {
    const invoices = await this.invoiceRepo.listByTenant(tenantId, { customerId });
    const activeInvoices = invoices.filter((i) => i.status !== "VOIDED");

    const now = new Date().toISOString().split("T")[0];
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalCredited = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let overdueCount = 0;
    let oldestOverdueDays = 0;

    for (const inv of activeInvoices) {
      const gross = num(inv.total);
      const paid = num(inv.amountPaid);
      const credited = num(inv.amountCredited);
      const outstanding = num(inv.amountOutstanding);

      totalInvoiced += gross;
      totalPaid += paid;
      totalCredited += credited;
      totalOutstanding += outstanding;

      if (inv.status !== "PAID" && inv.dueDate < now && outstanding > 0) {
        totalOverdue += outstanding;
        overdueCount++;
        const days = Math.floor(
          (new Date(now).getTime() - new Date(inv.dueDate).getTime()) / (1000 * 3600 * 24)
        );
        if (days > oldestOverdueDays) {
          oldestOverdueDays = days;
        }
      }
    }

    return {
      customerId,
      tenantId,
      currency: activeInvoices[0]?.currency || "KES",
      totalInvoiced: to4Dec(totalInvoiced),
      totalPaid: to4Dec(totalPaid),
      totalCredited: to4Dec(totalCredited),
      totalOutstanding: to4Dec(totalOutstanding),
      totalOverdue: to4Dec(totalOverdue),
      invoiceCount: activeInvoices.length,
      overdueCount,
      oldestOverdueDays,
    };
  }

  async getCorporateReceivables(
    tenantId: string,
    corporateAccountId: string
  ): Promise<CorporateReceivablesSummary> {
    const invoices = await this.invoiceRepo.listByTenant(tenantId, { corporateAccountId });
    const activeInvoices = invoices.filter((i) => i.status !== "VOIDED");

    let corporateName = "Corporate Account";
    let creditLimit = "0.0000";

    if (this.corporateAccountRepo) {
      const corp = await this.corporateAccountRepo.findById(corporateAccountId, tenantId);
      if (corp) {
        corporateName = corp.companyName;
        creditLimit = to4Dec(corp.creditLimit || 0);
      }
    }

    const now = new Date().toISOString().split("T")[0];
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalCredited = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let overdueCount = 0;

    for (const inv of activeInvoices) {
      const gross = num(inv.total);
      const paid = num(inv.amountPaid);
      const credited = num(inv.amountCredited);
      const outstanding = num(inv.amountOutstanding);

      totalInvoiced += gross;
      totalPaid += paid;
      totalCredited += credited;
      totalOutstanding += outstanding;

      if (inv.status !== "PAID" && inv.dueDate < now && outstanding > 0) {
        totalOverdue += outstanding;
        overdueCount++;
      }
    }

    const creditRemainingNum = Math.max(0, num(creditLimit) - totalOutstanding);

    return {
      corporateAccountId,
      tenantId,
      currency: activeInvoices[0]?.currency || "KES",
      corporateName,
      totalInvoiced: to4Dec(totalInvoiced),
      totalPaid: to4Dec(totalPaid),
      totalCredited: to4Dec(totalCredited),
      totalOutstanding: to4Dec(totalOutstanding),
      totalOverdue: to4Dec(totalOverdue),
      invoiceCount: activeInvoices.length,
      overdueCount,
      creditLimit,
      creditRemaining: to4Dec(creditRemainingNum),
    };
  }

  async getOperationalFinanceSummary(tenantId: string): Promise<OperationalFinanceSummary> {
    const invoices = await this.invoiceRepo.listByTenant(tenantId);
    const activeInvoices = invoices.filter((i) => i.status !== "VOIDED");
    const now = new Date().toISOString().split("T")[0];

    let totalInvoiced = 0;
    let totalCollected = 0;
    let totalReceivables = 0;
    let totalOverdue = 0;

    for (const inv of activeInvoices) {
      totalInvoiced += num(inv.total);
      totalCollected += num(inv.amountPaid);
      totalReceivables += num(inv.amountOutstanding);
      if (inv.status !== "PAID" && inv.dueDate < now && num(inv.amountOutstanding) > 0) {
        totalOverdue += num(inv.amountOutstanding);
      }
    }

    const expenses = await this.expenseRepo.listByTenant(tenantId);
    const nonVoidExpenses = expenses.filter((e) => e.status !== "VOIDED");
    const totalExpenses = nonVoidExpenses.reduce((s, e) => s + num(e.grossAmount), 0);
    const approvedExpenses = nonVoidExpenses
      .filter((e) => e.status === "APPROVED")
      .reduce((s, e) => s + num(e.grossAmount), 0);
    const pendingExpenses = nonVoidExpenses
      .filter((e) => e.status === "SUBMITTED" || e.status === "DRAFT")
      .reduce((s, e) => s + num(e.grossAmount), 0);

    const deposits = await this.depositPositionRepo.listByTenant(tenantId);
    const totalDepositsHeld = deposits.reduce((s, d) => s + num(d.heldAmount), 0);

    const refunds = await this.refundObligationRepo.listByTenant(tenantId, { status: "PENDING" });
    const totalRefundsDue = refunds.reduce((s, r) => s + num(r.amount), 0);

    return {
      tenantId,
      currency: activeInvoices[0]?.currency || "KES",
      totalInvoiced: to4Dec(totalInvoiced),
      totalCollected: to4Dec(totalCollected),
      totalReceivables: to4Dec(totalReceivables),
      totalOverdue: to4Dec(totalOverdue),
      totalExpenses: to4Dec(totalExpenses),
      approvedExpenses: to4Dec(approvedExpenses),
      pendingExpenses: to4Dec(pendingExpenses),
      totalDepositsHeld: to4Dec(totalDepositsHeld),
      totalRefundsDue: to4Dec(totalRefundsDue),
    };
  }

  // --------------------------------------------------------------------------
  // 6. SPRINT 21 OWNER SETTLEMENT INTERFACE READ CONTRACTS
  // --------------------------------------------------------------------------

  async getSettledRentalRevenueComponents(
    tenantId: string,
    rentalId: string
  ): Promise<SettledRentalRevenueComponent | null> {
    const invoice = await this.invoiceRepo.findByRentalId(rentalId, tenantId);
    if (!invoice || invoice.status === "VOIDED") {
      return null;
    }

    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) return null;

    let baseRentalGross = 0;
    let extensionsGross = 0;
    let excessMileageGross = 0;
    let fuelDeficitGross = 0;
    let damageChargesGross = 0;

    for (const item of invoice.lineItems) {
      const gross = num(item.grossAmount);
      if (item.lineType === "RENTAL_BASE") {
        baseRentalGross += gross;
      } else if (item.lineType === "RENTAL_EXTENSION") {
        extensionsGross += gross;
      } else if (item.lineType === "EXCESS_MILEAGE") {
        excessMileageGross += gross;
      } else if (item.lineType === "FUEL_DEFICIT" || item.lineType === "REFUELING_FEE") {
        fuelDeficitGross += gross;
      } else if (item.lineType === "DAMAGE_CHARGE") {
        damageChargesGross += gross;
      }
    }

    return {
      rentalId,
      vehicleId: rental.vehicleId,
      baseRentalGross: to4Dec(baseRentalGross),
      extensionsGross: to4Dec(extensionsGross),
      excessMileageGross: to4Dec(excessMileageGross),
      fuelDeficitGross: to4Dec(fuelDeficitGross),
      damageChargesGross: to4Dec(damageChargesGross),
      totalGross: invoice.total,
      totalTax: invoice.taxTotal,
      currency: invoice.currency,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      isPaidOrSettled: invoice.status === "PAID" || num(invoice.amountOutstanding) === 0,
    };
  }

  async getEligibleVehicleExpenses(
    tenantId: string,
    vehicleId: string
  ): Promise<EligibleVehicleExpenseComponent[]> {
    const expenses = await this.expenseRepo.listByTenant(tenantId, {
      vehicleId,
      status: "APPROVED",
    });

    return expenses.map((e) => ({
      expenseId: e.id,
      expenseNumber: e.expenseNumber,
      vehicleId: e.vehicleId || vehicleId,
      category: e.category,
      grossAmount: e.grossAmount,
      currency: e.currency,
      isOwnerDeductible: e.ownerDeductible || false,
      maintenanceId: e.maintenanceId,
    }));
  }
}
