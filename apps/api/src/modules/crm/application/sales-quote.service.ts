// ============================================================================
// CAR HIRE OS — SALES QUOTE APPLICATION SERVICE (Sprint 33)
// ============================================================================

import {
  SalesQuoteRecord,
  QuoteVersionRecord,
  QuoteLineItem,
  QuoteLineItemType,
  SalesQuoteStatus,
  SalesQuoteFilterParams,
} from "@car-hire-os/types";
import {
  ISalesQuoteRepository,
  ILeadRepository,
  IOutboxRepository,
} from "@car-hire-os/database";
import { EVENT_TYPES } from "@car-hire-os/contracts";
import { CrmActivityService } from "./crm-activity.service";
import {
  SalesQuoteNotFoundError,
  SalesQuoteExpiredError,
  SalesQuoteAlreadyConvertedError,
  SalesQuoteInvalidStatusTransitionError,
} from "../domain/crm.errors";
import { PricingService } from "../../pricing/application/pricing.service";
import { AvailabilityService } from "../../availability/application/availability.service";
import { BookingService } from "../../bookings/application/booking.service";
import { NotificationOrchestratorService } from "../../notifications/index";
import { LeadService } from "./lead.service";

export interface CreateQuoteLineItemDto {
  type: QuoteLineItemType;
  description: string;
  unitPrice: number;
  quantity: number;
  taxRatePercent?: number;
  discountAmount?: number;
}

export interface CreateSalesQuoteDto {
  leadId?: string;
  customerId?: string;
  corporateAccountId?: string;
  currency?: string;
  validUntil: string;
  pickupDate: string;
  returnDate: string;
  pickupLocation: string;
  returnLocation: string;
  vehicleCategoryId?: string;
  vehicleId?: string;
  lineItems: CreateQuoteLineItemDto[];
  requiredDepositAmount?: number;
  paymentTerms?: string;
  customerNotes?: string;
  internalNotes?: string;
  termsAndConditions?: string;
  assignedUserId?: string;
}

export interface CreateQuoteVersionDto {
  lineItems: CreateQuoteLineItemDto[];
  requiredDepositAmount?: number;
  paymentTerms?: string;
  termsAndConditions?: string;
  notes?: string;
}

export class SalesQuoteService {
  constructor(
    private readonly quoteRepo: ISalesQuoteRepository,
    private readonly leadRepo: ILeadRepository,
    private readonly activityService: CrmActivityService,
    private readonly outboxRepo?: IOutboxRepository,
    private readonly pricingService?: PricingService,
    private readonly availabilityService?: AvailabilityService,
    private readonly bookingService?: BookingService,
    private readonly notificationOrchestrator?: NotificationOrchestratorService,
    private readonly leadService?: LeadService
  ) {}

  private calculateTotals(items: Omit<QuoteLineItem, "id" | "totalPrice">[]): {
    lineItems: QuoteLineItem[];
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    grandTotal: number;
  } {
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    const fullItems: QuoteLineItem[] = items.map((item, idx) => {
      const base = item.unitPrice * item.quantity;
      const discount = item.discountAmount || 0;
      const taxable = Math.max(0, base - discount);
      const tax = (taxable * (item.taxRatePercent || 0)) / 100;
      const total = taxable + tax;

      subtotal += base;
      discountTotal += discount;
      taxTotal += tax;

      return {
        id: `item-${idx + 1}-${Date.now()}`,
        type: item.type,
        description: item.description,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        taxRatePercent: item.taxRatePercent || 0,
        discountAmount: discount,
        totalPrice: total,
      };
    });

    const grandTotal = Math.max(0, subtotal - discountTotal + taxTotal);
    return { lineItems: fullItems, subtotal, taxTotal, discountTotal, grandTotal };
  }

  async createQuote(
    tenantId: string,
    dto: CreateSalesQuoteDto,
    actorId: string = "system"
  ): Promise<{ quote: SalesQuoteRecord; version: QuoteVersionRecord }> {
    // 1. Availability check if vehicle or category is specified
    if (this.availabilityService && dto.vehicleCategoryId && dto.pickupDate && dto.returnDate) {
      try {
        const searchResult = await this.availabilityService.searchAvailableVehicles(tenantId, {
          pickupAt: dto.pickupDate,
          returnAt: dto.returnDate,
          vehicleCategoryId: dto.vehicleCategoryId,
        });
        if (searchResult.vehicles.length === 0) {
          // Advisory: no unallocated fleet vehicles in this category for requested dates
        }
      } catch {
        // Non-blocking availability advisory
      }
    }

    // 2. Calculate Line Items & Financial Totals
    const { lineItems, subtotal, taxTotal, discountTotal, grandTotal } = this.calculateTotals(
      dto.lineItems
    );
    const depositTotal = dto.requiredDepositAmount || 0;

    // 3. Persist Sales Quote aggregate
    const quote = await this.quoteRepo.save({
      id: "",
      tenantId,
      quoteNumber: "",
      leadId: dto.leadId,
      customerId: dto.customerId,
      corporateAccountId: dto.corporateAccountId,
      status: "DRAFT",
      currentVersion: 1,
      currency: dto.currency || "USD",
      validUntil: dto.validUntil,
      pickupDate: dto.pickupDate,
      returnDate: dto.returnDate,
      pickupLocation: dto.pickupLocation,
      returnLocation: dto.returnLocation,
      vehicleCategoryId: dto.vehicleCategoryId,
      vehicleId: dto.vehicleId,
      publicToken: "",
      subtotal,
      taxTotal,
      discountTotal,
      depositTotal,
      grandTotal,
      requiredDepositAmount: depositTotal,
      paymentTerms: dto.paymentTerms,
      createdBy: actorId,
      assignedUserId: dto.assignedUserId,
      customerNotes: dto.customerNotes,
      internalNotes: dto.internalNotes,
      version: 1,
      createdAt: "",
      updatedAt: "",
    });

    // 4. Persist Version 1
    const versionRecord = await this.quoteRepo.saveVersion({
      id: "",
      tenantId,
      quoteId: quote.id,
      versionNumber: 1,
      lineItems,
      pricingSnapshot: {
        currency: quote.currency,
        subtotal,
        taxTotal,
        discountTotal,
        depositTotal,
        grandTotal,
        calculatedAt: new Date().toISOString(),
      },
      subtotal,
      taxTotal,
      discountTotal,
      depositTotal,
      grandTotal,
      termsAndConditions: dto.termsAndConditions,
      notes: dto.internalNotes,
      createdBy: actorId,
      createdAt: "",
    });

    // 5. Activity Log
    await this.activityService.logActivity({
      tenantId,
      entityType: "SALES_QUOTE",
      entityId: quote.id,
      type: "STATUS_CHANGE",
      title: "Sales Quote Created",
      description: `Sales Quote ${quote.quoteNumber} (v1) created by ${actorId}. Total: ${quote.currency} ${quote.grandTotal.toFixed(2)}.`,
      performedBy: actorId,
    });

    if (dto.leadId) {
      await this.activityService.logActivity({
        tenantId,
        entityType: "LEAD",
        entityId: dto.leadId,
        type: "QUOTE_SENT",
        title: "Sales Quote Drafted",
        description: `Quote ${quote.quoteNumber} drafted for this lead.`,
        performedBy: actorId,
        metadata: { quoteId: quote.id, quoteNumber: quote.quoteNumber },
      });
    }

    // 6. Outbox Event
    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_SALES_QUOTE_CREATED,
        aggregateType: "CRM_SALES_QUOTE",
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          leadId: quote.leadId,
          grandTotal: quote.grandTotal,
          currency: quote.currency,
          validUntil: quote.validUntil,
        },
      });
    }

    return { quote, version: versionRecord };
  }

  async createNewVersion(
    tenantId: string,
    quoteId: string,
    dto: CreateQuoteVersionDto,
    actorId: string = "system"
  ): Promise<QuoteVersionRecord> {
    const quote = await this.quoteRepo.findByTenantAndId(tenantId, quoteId);
    if (!quote) {
      throw new SalesQuoteNotFoundError(quoteId);
    }
    if (quote.status === "CONVERTED") {
      throw new SalesQuoteAlreadyConvertedError(quote.quoteNumber);
    }

    const { lineItems, subtotal, taxTotal, discountTotal, grandTotal } = this.calculateTotals(
      dto.lineItems
    );
    const depositTotal = dto.requiredDepositAmount !== undefined ? dto.requiredDepositAmount : quote.depositTotal;

    const nextVersionNumber = quote.currentVersion + 1;

    const versionRecord = await this.quoteRepo.saveVersion({
      id: "",
      tenantId,
      quoteId: quote.id,
      versionNumber: nextVersionNumber,
      lineItems,
      pricingSnapshot: {
        currency: quote.currency,
        subtotal,
        taxTotal,
        discountTotal,
        depositTotal,
        grandTotal,
        calculatedAt: new Date().toISOString(),
      },
      subtotal,
      taxTotal,
      discountTotal,
      depositTotal,
      grandTotal,
      termsAndConditions: dto.termsAndConditions,
      notes: dto.notes,
      createdBy: actorId,
      createdAt: "",
    });

    // Update active quote header
    quote.currentVersion = nextVersionNumber;
    quote.subtotal = subtotal;
    quote.taxTotal = taxTotal;
    quote.discountTotal = discountTotal;
    quote.depositTotal = depositTotal;
    quote.grandTotal = grandTotal;
    quote.requiredDepositAmount = depositTotal;
    if (dto.paymentTerms) quote.paymentTerms = dto.paymentTerms;
    quote.version += 1;

    await this.quoteRepo.save(quote);

    await this.activityService.logActivity({
      tenantId,
      entityType: "SALES_QUOTE",
      entityId: quote.id,
      type: "STATUS_CHANGE",
      title: "New Quote Version Created",
      description: `Sales Quote updated to version v${nextVersionNumber} by ${actorId}. New Total: ${quote.currency} ${quote.grandTotal.toFixed(2)}.`,
      performedBy: actorId,
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_SALES_QUOTE_VERSION_CREATED,
        aggregateType: "CRM_SALES_QUOTE",
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          versionNumber: nextVersionNumber,
          grandTotal: quote.grandTotal,
        },
      });
    }

    return versionRecord;
  }

  async sendQuote(
    tenantId: string,
    quoteId: string,
    recipientEmail?: string,
    recipientPhone?: string,
    actorId: string = "system"
  ): Promise<SalesQuoteRecord> {
    const quote = await this.quoteRepo.findByTenantAndId(tenantId, quoteId);
    if (!quote) {
      throw new SalesQuoteNotFoundError(quoteId);
    }
    if (quote.status === "CONVERTED") {
      throw new SalesQuoteAlreadyConvertedError(quote.quoteNumber);
    }

    quote.status = "SENT";
    quote.version += 1;
    const updated = await this.quoteRepo.save(quote);

    // If associated with a lead, update lead status & stage
    if (quote.leadId && this.leadService) {
      const lead = await this.leadRepo.findByTenantAndId(tenantId, quote.leadId);
      if (lead && lead.status !== "CONVERTED") {
        lead.status = "PROPOSAL_SENT";
        await this.leadRepo.save(lead);
      }
    }

    // Send notification via NotificationOrchestratorService if configured
    if (this.notificationOrchestrator && (recipientEmail || recipientPhone)) {
      try {
        const canonicalBaseUrl = await this.notificationOrchestrator.resolveCanonicalWebsiteBaseUrl(tenantId);
        const reviewUrl = `${canonicalBaseUrl}/crm/quotes/public/${quote.publicToken}`;

        await this.notificationOrchestrator.sendNotificationIntent({
          tenantId,
          channel: recipientEmail ? "EMAIL" : "SMS",
          category: "OPERATIONAL",
          recipient: (recipientEmail || recipientPhone)!,
          recipientName: recipientEmail ? recipientEmail.split("@")[0] : "Valued Customer",
          recipientPartyType: "CUSTOMER",
          subject: `Your Vehicle Hire Quote: ${quote.quoteNumber}`,
          body: `Hello,\n\nPlease review your customized vehicle hire quote (${quote.quoteNumber}). Total amount: ${quote.currency} ${quote.grandTotal.toFixed(2)}.\n\nReview & Accept your quote securely here:\n${reviewUrl}\n\nThis quote is valid until ${new Date(quote.validUntil).toLocaleDateString()}.\n\nBest regards,\nCar Hire Reservations`,
          correlationId: quote.id,
          metadata: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            publicToken: quote.publicToken,
            version: quote.currentVersion,
          },
        });
      } catch {
        // Log & proceed
      }
    }

    await this.activityService.logActivity({
      tenantId,
      entityType: "SALES_QUOTE",
      entityId: quote.id,
      type: "QUOTE_SENT",
      title: "Sales Quote Dispatched",
      description: `Quote sent to customer via digital channels by ${actorId}.`,
      performedBy: actorId,
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_SALES_QUOTE_SENT,
        aggregateType: "CRM_SALES_QUOTE",
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          publicToken: quote.publicToken,
        },
      });
    }

    return updated;
  }

  async recordQuoteViewed(publicToken: string): Promise<SalesQuoteRecord | null> {
    const quote = await this.quoteRepo.findByPublicToken(publicToken);
    if (!quote) return null;

    if (quote.status === "SENT") {
      quote.status = "VIEWED";
      quote.version += 1;
      const updated = await this.quoteRepo.save(quote);

      await this.activityService.logActivity({
        tenantId: quote.tenantId,
        entityType: "SALES_QUOTE",
        entityId: quote.id,
        type: "NOTE",
        title: "Customer Viewed Quote Online",
        description: `Customer opened secure quote view page via token.`,
        performedBy: "customer_portal",
      });

      if (this.outboxRepo) {
        await this.outboxRepo.publish({
          tenantId: quote.tenantId,
          eventType: EVENT_TYPES.CRM_SALES_QUOTE_VIEWED,
          aggregateType: "CRM_SALES_QUOTE",
          aggregateId: quote.id,
          payload: { quoteId: quote.id, quoteNumber: quote.quoteNumber },
        });
      }

      return updated;
    }

    return quote;
  }

  async acceptQuote(
    identifier: { tenantId?: string; quoteId?: string; publicToken?: string },
    actorId: string = "customer"
  ): Promise<SalesQuoteRecord> {
    let quote: SalesQuoteRecord | null = null;
    if (identifier.publicToken) {
      quote = await this.quoteRepo.findByPublicToken(identifier.publicToken);
    } else if (identifier.tenantId && identifier.quoteId) {
      quote = await this.quoteRepo.findByTenantAndId(identifier.tenantId, identifier.quoteId);
    }

    if (!quote) {
      throw new SalesQuoteNotFoundError(identifier.quoteId || identifier.publicToken || "unknown");
    }

    if (quote.status === "CONVERTED") {
      throw new SalesQuoteAlreadyConvertedError(quote.quoteNumber);
    }

    // Expiry Check
    if (new Date() > new Date(quote.validUntil)) {
      quote.status = "EXPIRED";
      await this.quoteRepo.save(quote);
      throw new SalesQuoteExpiredError(quote.quoteNumber, quote.validUntil);
    }

    quote.status = "ACCEPTED";
    quote.version += 1;
    const updated = await this.quoteRepo.save(quote);

    await this.activityService.logActivity({
      tenantId: quote.tenantId,
      entityType: "SALES_QUOTE",
      entityId: quote.id,
      type: "QUOTE_ACCEPTED",
      title: "Quote Accepted",
      description: `Sales Quote was accepted by ${actorId}.`,
      performedBy: actorId,
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId: quote.tenantId,
        eventType: EVENT_TYPES.CRM_SALES_QUOTE_ACCEPTED,
        aggregateType: "CRM_SALES_QUOTE",
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          grandTotal: quote.grandTotal,
          acceptedBy: actorId,
        },
      });
    }

    return updated;
  }

  async rejectQuote(
    identifier: { tenantId?: string; quoteId?: string; publicToken?: string },
    reason?: string,
    actorId: string = "customer"
  ): Promise<SalesQuoteRecord> {
    let quote: SalesQuoteRecord | null = null;
    if (identifier.publicToken) {
      quote = await this.quoteRepo.findByPublicToken(identifier.publicToken);
    } else if (identifier.tenantId && identifier.quoteId) {
      quote = await this.quoteRepo.findByTenantAndId(identifier.tenantId, identifier.quoteId);
    }

    if (!quote) {
      throw new SalesQuoteNotFoundError(identifier.quoteId || identifier.publicToken || "unknown");
    }

    quote.status = "REJECTED";
    quote.version += 1;
    const updated = await this.quoteRepo.save(quote);

    await this.activityService.logActivity({
      tenantId: quote.tenantId,
      entityType: "SALES_QUOTE",
      entityId: quote.id,
      type: "STATUS_CHANGE",
      title: "Quote Declined",
      description: `Quote rejected by ${actorId}. Reason: ${reason || "None provided"}.`,
      performedBy: actorId,
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId: quote.tenantId,
        eventType: EVENT_TYPES.CRM_SALES_QUOTE_REJECTED,
        aggregateType: "CRM_SALES_QUOTE",
        aggregateId: quote.id,
        payload: { quoteId: quote.id, quoteNumber: quote.quoteNumber, reason },
      });
    }

    return updated;
  }

  async convertToBooking(
    tenantId: string,
    quoteId: string,
    actorId: string = "system"
  ): Promise<{ quote: SalesQuoteRecord; bookingId: string }> {
    const quote = await this.quoteRepo.findByTenantAndId(tenantId, quoteId);
    if (!quote) {
      throw new SalesQuoteNotFoundError(quoteId);
    }
    if (quote.status === "CONVERTED" && quote.convertedBookingId) {
      return { quote, bookingId: quote.convertedBookingId };
    }

    // Ensure customer exists
    let customerId = quote.customerId;
    let corporateAccountId = quote.corporateAccountId;

    if (!customerId && !corporateAccountId && quote.leadId && this.leadService) {
      const conversion = await this.leadService.convertLead(
        tenantId,
        quote.leadId,
        {},
        actorId
      );
      customerId = conversion.customerId;
      corporateAccountId = conversion.corporateAccountId;
      quote.customerId = customerId;
      quote.corporateAccountId = corporateAccountId;
    }

    if (!customerId && !corporateAccountId) {
      customerId = `cust-crm-${Date.now()}`;
    }

    let bookingId: string;

    if (this.bookingService) {
      const booking = await this.bookingService.createBooking(
        tenantId,
        {
          customerId: customerId || "guest",
          corporateAccountId: corporateAccountId || null,
          requestedVehicleId: quote.vehicleId || null,
          requestedVehicleCategoryId: quote.vehicleCategoryId || null,
          pickupAt: quote.pickupDate,
          returnAt: quote.returnDate,
          pickupLocationName: quote.pickupLocation,
          returnLocationName: quote.returnLocation,
          source: "SALES_QUOTE" as any,
          customerNotes: quote.customerNotes,
          internalNotes: `Converted from Sales Quote ${quote.quoteNumber}`,
          pricing: {
            currency: quote.currency,
            dailyRate: quote.subtotal,
            baseRental: quote.subtotal,
            taxAmount: quote.taxTotal,
            discountAmount: quote.discountTotal,
            securityDeposit: quote.depositTotal,
            grossTotal: quote.grandTotal,
            netPayable: quote.grandTotal,
            frozenAt: new Date().toISOString(),
          } as any,
        },
        { userId: actorId, actorType: "USER", name: "CRM Conversion Agent" }
      );
      bookingId = booking.id;
    } else {
      bookingId = `booking-crm-${Date.now()}`;
    }

    quote.status = "CONVERTED";
    quote.convertedBookingId = bookingId;
    quote.convertedAt = new Date().toISOString();
    quote.version += 1;
    const updated = await this.quoteRepo.save(quote);

    // If associated with a lead, update lead to WON/CONVERTED
    if (quote.leadId) {
      const lead = await this.leadRepo.findByTenantAndId(tenantId, quote.leadId);
      if (lead) {
        lead.status = "CONVERTED";
        lead.convertedAt = new Date().toISOString();
        await this.leadRepo.save(lead);
      }
    }

    await this.activityService.logActivity({
      tenantId,
      entityType: "SALES_QUOTE",
      entityId: quote.id,
      type: "CONVERSION",
      title: "Quote Converted to Booking",
      description: `Sales Quote converted into Booking ${bookingId} by ${actorId}.`,
      performedBy: actorId,
      metadata: { bookingId },
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_SALES_QUOTE_CONVERTED,
        aggregateType: "CRM_SALES_QUOTE",
        aggregateId: quote.id,
        payload: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          bookingId,
          convertedAt: quote.convertedAt,
        },
      });
    }

    return { quote: updated, bookingId };
  }

  async getQuote(tenantId: string, quoteId: string): Promise<SalesQuoteRecord> {
    const quote = await this.quoteRepo.findByTenantAndId(tenantId, quoteId);
    if (!quote) {
      throw new SalesQuoteNotFoundError(quoteId);
    }
    return quote;
  }

  async getQuoteByPublicToken(publicToken: string): Promise<SalesQuoteRecord> {
    const quote = await this.quoteRepo.findByPublicToken(publicToken);
    if (!quote) {
      throw new SalesQuoteNotFoundError(publicToken);
    }
    return quote;
  }

  async getVersions(tenantId: string, quoteId: string): Promise<QuoteVersionRecord[]> {
    return this.quoteRepo.getVersions(tenantId, quoteId);
  }

  async listQuotes(filter: SalesQuoteFilterParams): Promise<{ items: SalesQuoteRecord[]; total: number }> {
    return this.quoteRepo.findMany(filter);
  }
}
