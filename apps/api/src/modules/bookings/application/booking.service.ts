// ============================================================================
// CAR HIRE OS — BOOKING APPLICATION SERVICE (DOM-003 §14-16, DEV-006, DEV-007, BRS-001)
// Bounded Context: Bookings & Reservations
// Authoritative lifecycle orchestration, pricing snapshots, concurrency safety, and audit/outbox integration
// ============================================================================

import type {
  Booking,
  BookingStatus,
  BookingSource,
  CreateBookingDto,
  UpdateDraftBookingDto,
  CalculateBookingQuoteDto,
  QuoteBookingDto,
  ConfirmBookingDto,
  CancelBookingDto,
  RejectBookingDto,
  ExpireBookingDto,
  NoShowBookingDto,
  SubstituteBookingVehicleDto,
  AmendBookingDatesDto,
  SimulateBookingPaymentDto,
  BookingListQueryDto,
  PricingSnapshot,
  PricingResult,
  VehicleSubstitution,
} from "@carhire/types";
import {
  IBookingRepository,
  BookingRepository,
  ICustomerRepository,
  CustomerRepository,
  ICorporateAccountRepository,
  CorporateAccountRepository,
  IDriverRepository,
  DriverRepository,
  IAgentRepository,
  AgentRepository,
  IVehicleRepository,
  VehicleRepository,
  IVehicleCategoryRepository,
  VehicleCategoryRepository,
  ISubscriptionRepository,
  SubscriptionRepository,
  IAuditRepository,
  AuditRepository,
  IOutboxRepository,
  OutboxRepository,
  IIdempotencyRepository,
  IdempotencyRepository,
  RecordNotFoundError,
  CrossTenantViolationError,
  SubscriptionSuspendedError,
  CustomerNotEligibleError,
  DriverNotEligibleError,
  VehicleNotOperationalError,
  BookingNotFoundError,
  BookingImmutableError,
  BookingAvailabilityConflictError,
  BookingPricingSnapshotRequiredError,
  AvailabilityConflictError,
  ConcurrencyConflictError,
} from "@carhire/database";
import { PricingService } from "../../pricing/application/pricing.service";
import { AvailabilityService } from "../../availability/application/availability.service";
import { BookingStateMachine } from "../domain/booking-state-machine";

export interface BookingActor {
  userId: string;
  actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT";
  name?: string;
}

export class BookingService {
  private readonly bookingRepo: IBookingRepository;
  private readonly customerRepo: ICustomerRepository;
  private readonly corporateRepo: ICorporateAccountRepository;
  private readonly driverRepo: IDriverRepository;
  private readonly agentRepo: IAgentRepository;
  private readonly vehicleRepo: IVehicleRepository;
  private readonly categoryRepo: IVehicleCategoryRepository;
  private readonly subscriptionRepo?: ISubscriptionRepository;
  private readonly auditRepo: IAuditRepository;
  private readonly outboxRepo: IOutboxRepository;
  private readonly idempotencyRepo: IIdempotencyRepository;
  private readonly pricingService: PricingService;
  private readonly availabilityService: AvailabilityService;

  constructor(
    bookingRepo?: IBookingRepository,
    pricingService?: PricingService,
    availabilityService?: AvailabilityService,
    customerRepo?: ICustomerRepository,
    corporateRepo?: ICorporateAccountRepository,
    driverRepo?: IDriverRepository,
    agentRepo?: IAgentRepository,
    vehicleRepo?: IVehicleRepository,
    categoryRepo?: IVehicleCategoryRepository,
    subscriptionRepo?: ISubscriptionRepository,
    auditRepo?: IAuditRepository,
    outboxRepo?: IOutboxRepository,
    idempotencyRepo?: IIdempotencyRepository
  ) {
    this.bookingRepo = bookingRepo || new BookingRepository();
    this.pricingService = pricingService || new PricingService();
    this.availabilityService = availabilityService || new AvailabilityService();
    this.customerRepo = customerRepo || new CustomerRepository();
    this.corporateRepo = corporateRepo || new CorporateAccountRepository();
    this.driverRepo = driverRepo || new DriverRepository();
    this.agentRepo = agentRepo || new AgentRepository();
    this.vehicleRepo = vehicleRepo || new VehicleRepository();
    this.categoryRepo = categoryRepo || new VehicleCategoryRepository();
    this.subscriptionRepo = subscriptionRepo || new SubscriptionRepository();
    this.auditRepo = auditRepo || new AuditRepository();
    this.outboxRepo = outboxRepo || new OutboxRepository();
    this.idempotencyRepo = idempotencyRepo || new IdempotencyRepository();
  }

  /**
   * Asserts tenant subscription permits commercial write operations
   */
  private async assertSubscriptionPermitsWrite(tenantId: string): Promise<void> {
    if (!this.subscriptionRepo) return;
    try {
      const sub = await this.subscriptionRepo.findByTenantId(tenantId);
      if (sub && sub.status === "SUSPENDED") {
        throw new SubscriptionSuspendedError(
          tenantId,
          "Tenant subscription is SUSPENDED. New bookings and confirmations are blocked."
        );
      }
    } catch (err) {
      if (err instanceof SubscriptionSuspendedError) throw err;
    }
  }

  /**
   * Calculates a live pricing quote without persisting state
   */
  async calculateQuote(
    tenantId: string,
    dto: CalculateBookingQuoteDto
  ): Promise<PricingResult> {
    return this.pricingService.calculatePrice(tenantId, {
      pickupDateTime: dto.pickupAt,
      returnDateTime: dto.returnAt,
      ratePlanId: dto.ratePlanId || undefined,
      vehicleId: dto.vehicleId || undefined,
      vehicleCategoryId: dto.vehicleCategoryId || undefined,
      customerId: dto.customerId || undefined,
      corporateAccountId: dto.corporateAccountId || undefined,
      agentId: dto.agentId || undefined,
      selectedFeeCodes: dto.requestedFeeCodes || undefined,
      promoCode: dto.promoCode || undefined,
      currency: dto.currency,
    });
  }

  /**
   * Creates a new Booking aggregate (DRAFT, PENDING, or QUOTED)
   */
  async createBooking(
    tenantId: string,
    dto: CreateBookingDto,
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    await this.assertSubscriptionPermitsWrite(tenantId);

    // 1. Idempotency Check
    if (dto.idempotencyKey) {
      const existing = await this.idempotencyRepo.findByKey(tenantId, dto.idempotencyKey);
      if (existing && existing.responseBody) {
        return (typeof existing.responseBody === "string" ? JSON.parse(existing.responseBody) : existing.responseBody) as Booking;
      }
    }

    // 2. Customer Validation
    const customer = await this.customerRepo.findById(dto.customerId, tenantId);
    if (!customer) {
      throw new RecordNotFoundError("Customer", dto.customerId);
    }
    if (customer.status === "BLOCKED") {
      throw new CustomerNotEligibleError(dto.customerId, "Customer is in BLOCKED status.");
    }

    // 3. Corporate Account Validation
    if (dto.corporateAccountId) {
      const corporate = await this.corporateRepo.findById(dto.corporateAccountId, tenantId);
      if (!corporate) {
        throw new RecordNotFoundError("CorporateAccount", dto.corporateAccountId);
      }
      if (corporate.status === "SUSPENDED" || corporate.status === "INACTIVE") {
        throw new CustomerNotEligibleError(
          dto.customerId,
          `Associated corporate account '${corporate.companyName}' is not active (${corporate.status}).`
        );
      }
    }

    // 4. Primary Driver Validation
    const driverId = dto.primaryDriverId || dto.driverId;
    if (driverId) {
      const driver = await this.driverRepo.findById(driverId, tenantId);
      if (!driver) {
        throw new RecordNotFoundError("Driver", driverId);
      }
      if (driver.status === "BLACKLISTED" || (driver.status as any) === "SUSPENDED" || (driver.status as any) === "DISQUALIFIED") {
        throw new DriverNotEligibleError(driverId, `Driver is ${driver.status}.`);
      }
    }

    // 5. Vehicle / Category Validation
    const requestedVehicleId = dto.requestedVehicleId || dto.assignedVehicleId || dto.vehicleId;
    if (requestedVehicleId) {
      const vehicle = await this.vehicleRepo.findById(requestedVehicleId, tenantId);
      if (!vehicle) {
        throw new RecordNotFoundError("Vehicle", requestedVehicleId);
      }
      if (vehicle.lifecycleStatus === "RETIRED" || vehicle.lifecycleStatus === "SOLD" || (vehicle.lifecycleStatus as any) === "DECOMMISSIONED") {
        throw new VehicleNotOperationalError(requestedVehicleId, vehicle.lifecycleStatus);
      }
    }

    // 6. Dates Invariant
    const pickupAt = dto.pickupAt || dto.startDate;
    const returnAt = dto.returnAt || dto.endDate;
    if (!pickupAt || !returnAt) {
      throw new Error("Both pickupAt and returnAt date strings are required.");
    }
    const pickupTime = new Date(pickupAt).getTime();
    const returnTime = new Date(returnAt).getTime();
    if (isNaN(pickupTime) || isNaN(returnTime) || returnTime <= pickupTime) {
      throw new Error("Invalid booking date interval: returnAt must be strictly greater than pickupAt.");
    }

    // 7. Resolve Pricing Snapshot
    let snapshot: PricingSnapshot;
    let grossTotal: number;
    let netRentalSubtotal: number;
    let depositRequired: number;
    let taxAmount: number;

    if (dto.pricing && "snapshotId" in dto.pricing) {
      snapshot = dto.pricing as PricingSnapshot;
      grossTotal = snapshot.grossRentalTotal;
      netRentalSubtotal = snapshot.netRentalSubtotal;
      depositRequired = snapshot.securityDeposit?.amount || 0;
      taxAmount = snapshot.tax?.taxAmount || 0;
    } else {
      // Execute pricing engine resolution
      const quote = await this.calculateQuote(tenantId, {
        pickupAt,
        returnAt,
        vehicleId: requestedVehicleId,
        vehicleCategoryId: dto.requestedVehicleCategoryId,
        customerId: dto.customerId,
        corporateAccountId: dto.corporateAccountId,
        agentId: dto.agentId,
        ratePlanId: dto.ratePlanId,
        promoCode: dto.promoCode,
        requestedFeeCodes: dto.requestedFeeCodes,
      });
      snapshot = quote.pricingSnapshot;
      grossTotal = quote.grossRentalTotal;
      netRentalSubtotal = quote.netRentalSubtotal;
      depositRequired = quote.securityDeposit?.amount ?? quote.pricingSnapshot?.securityDeposit?.amount ?? 0;
      taxAmount = quote.taxCalculation?.taxAmount ?? quote.pricingSnapshot?.tax?.taxAmount ?? 0;
    }

    // 8. Generate Sequence Booking Reference
    const bookingNumber = await this.bookingRepo.generateNextBookingNumber(tenantId);

    // 9. Determine Initial Status
    let initialStatus: BookingStatus = (dto as any).initialStatus || dto.status || "DRAFT";
    if (dto.autoQuote && initialStatus === "DRAFT") {
      initialStatus = "QUOTED";
    }

    // 10. Persist Aggregate
    const booking = await this.bookingRepo.create(tenantId, {
      ...dto,
      pickupAt,
      returnAt,
      requestedVehicleId,
      assignedVehicleId: dto.assignedVehicleId || requestedVehicleId,
      primaryDriverId: driverId,
      bookingNumber,
      pricingSnapshot: snapshot,
      grossTotal,
      netRentalSubtotal,
      depositRequired,
      taxAmount,
      initialStatus,
      actorUserId: actor.userId,
      actorType: actor.actorType || "USER",
    });

    // 11. Audit Logging
    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.created",
      resourceType: "Booking",
      resourceId: booking.id,
      metadata: {
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        grossTotal: booking.grossTotal,
        customerId: booking.customerId,
        assignedVehicleId: booking.assignedVehicleId,
      },
    });

    // 12. Transactional Outbox Event
    await this.outboxRepo.record({
      tenantId,
      aggregateType: "Booking",
      aggregateId: booking.id,
      eventType: "BookingCreated",
      payload: {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        customerId: booking.customerId,
        corporateAccountId: booking.corporateAccountId,
        primaryDriverId: booking.primaryDriverId,
        agentId: booking.agentId,
        requestedVehicleId: booking.requestedVehicleId,
        assignedVehicleId: booking.assignedVehicleId,
        pickupAt: booking.pickupAt,
        returnAt: booking.returnAt,
        pickupLocation: booking.pickupLocationName,
        returnLocation: booking.returnLocationName,
        source: booking.source,
        initialStatus: booking.status,
        grossTotal: booking.grossTotal,
        currency: booking.currency,
      },
    });

    // 13. Save Idempotency Record
    if (dto.idempotencyKey) {
      await this.idempotencyRepo.record({
        tenantId,
        idempotencyKey: dto.idempotencyKey,
        resourceType: "Booking",
        resourceId: booking.id,
        responseStatus: 201,
        responseBody: JSON.stringify(booking),
      });
    }

    return booking;
  }

  /**
   * Updates an existing booking while in DRAFT status
   */
  async updateDraft(
    tenantId: string,
    bookingId: string,
    dto: UpdateDraftBookingDto,
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }
    if (booking.status !== "DRAFT") {
      throw new BookingImmutableError(bookingId, booking.status);
    }

    const updates: Partial<Booking> = {};

    if (dto.customerId && dto.customerId !== booking.customerId) {
      const customer = await this.customerRepo.findById(dto.customerId, tenantId);
      if (!customer || customer.status === "BLOCKED") {
        throw new CustomerNotEligibleError(dto.customerId, "Customer is not eligible.");
      }
      updates.customerId = dto.customerId;
    }

    if (dto.corporateAccountId !== undefined) {
      updates.corporateAccountId = dto.corporateAccountId;
    }

    if (dto.primaryDriverId !== undefined) {
      updates.primaryDriverId = dto.primaryDriverId;
    }

    if (dto.agentId !== undefined) {
      updates.agentId = dto.agentId;
    }

    if (dto.requestedVehicleId !== undefined) {
      updates.requestedVehicleId = dto.requestedVehicleId;
    }

    if (dto.assignedVehicleId !== undefined) {
      updates.assignedVehicleId = dto.assignedVehicleId;
    }

    if (dto.pickupLocationName) updates.pickupLocationName = dto.pickupLocationName;
    if (dto.returnLocationName) updates.returnLocationName = dto.returnLocationName;
    if (dto.specialInstructions !== undefined) updates.specialInstructions = dto.specialInstructions;
    if (dto.customerNotes !== undefined) updates.customerNotes = dto.customerNotes;
    if (dto.internalNotes !== undefined) updates.internalNotes = dto.internalNotes;

    // Check if dates or vehicle changed -> recalculate quote
    const newPickup = dto.pickupAt || booking.pickupAt;
    const newReturn = dto.returnAt || booking.returnAt;
    const newVehicle = dto.assignedVehicleId || dto.requestedVehicleId || booking.assignedVehicleId || booking.requestedVehicleId;

    if (dto.pickupAt || dto.returnAt || dto.assignedVehicleId || dto.requestedVehicleId || dto.promoCode || dto.requestedFeeCodes) {
      updates.pickupAt = newPickup;
      updates.returnAt = newReturn;

      const quote = await this.calculateQuote(tenantId, {
        pickupAt: newPickup || new Date().toISOString(),
        returnAt: newReturn || new Date().toISOString(),
        vehicleId: newVehicle,
        customerId: updates.customerId || booking.customerId,
        corporateAccountId: updates.corporateAccountId ?? booking.corporateAccountId,
        agentId: updates.agentId ?? booking.agentId,
        promoCode: dto.promoCode,
        requestedFeeCodes: dto.requestedFeeCodes,
      });

      updates.pricingSnapshot = quote.pricingSnapshot;
      updates.grossTotal = quote.grossRentalTotal;
      updates.netRentalSubtotal = quote.netRentalSubtotal;
      updates.depositRequired = quote.securityDeposit?.amount ?? quote.pricingSnapshot?.securityDeposit?.amount ?? 0;
      updates.taxAmount = quote.taxCalculation?.taxAmount ?? quote.pricingSnapshot?.tax?.taxAmount ?? 0;

      const newVersion = (booking.pricingSnapshotVersion || 1) + 1;
      await this.bookingRepo.appendPricingSnapshot(tenantId, {
        bookingId,
        tenantId,
        version: newVersion,
        isCurrent: true,
        snapshot: quote.pricingSnapshot,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        createdBy: actor.userId,
      });
      updates.pricingSnapshotVersion = newVersion;
    }

    const updated = await this.bookingRepo.update(bookingId, tenantId, updates, booking.version);

    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.draft_updated",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: { changes: Object.keys(updates) },
    });

    return updated;
  }

  /**
   * Generates or freezes a formal pricing quote, transitioning status to QUOTED
   */
  async quoteBooking(
    tenantId: string,
    bookingId: string,
    dto: QuoteBookingDto = {},
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    BookingStateMachine.assertCanTransition(booking.status, "QUOTED", {
      hasValidDates: new Date(booking.returnAt || Date.now()).getTime() > new Date(booking.pickupAt || Date.now()).getTime(),
    });

    const quote = await this.calculateQuote(tenantId, {
      pickupAt: booking.pickupAt || new Date().toISOString(),
      returnAt: booking.returnAt || new Date().toISOString(),
      vehicleId: booking.assignedVehicleId || booking.requestedVehicleId,
      vehicleCategoryId: booking.requestedVehicleCategoryId,
      customerId: booking.customerId,
      corporateAccountId: booking.corporateAccountId,
      agentId: booking.agentId,
      ratePlanId: dto.ratePlanId,
      promoCode: dto.promoCode,
      requestedFeeCodes: dto.requestedFeeCodes,
    });

    const newSnapshotVersion = (booking.pricingSnapshotVersion || 1) + 1;
    await this.bookingRepo.appendPricingSnapshot(tenantId, {
      bookingId,
      tenantId,
      version: newSnapshotVersion,
      isCurrent: true,
      snapshot: quote.pricingSnapshot,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      createdBy: actor.userId,
    });

    await this.bookingRepo.appendStatusHistory(tenantId, {
      bookingId,
      tenantId,
      fromStatus: booking.status,
      toStatus: "QUOTED",
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: dto.reason || "Commercial quote generated",
      occurredAt: new Date().toISOString(),
    });

    const updated = await this.bookingRepo.update(
      bookingId,
      tenantId,
      {
        status: "QUOTED",
        pricingSnapshot: quote.pricingSnapshot,
        pricingSnapshotVersion: newSnapshotVersion,
        grossTotal: quote.grossRentalTotal,
        netRentalSubtotal: quote.netRentalSubtotal,
        depositRequired: quote.securityDeposit?.amount ?? quote.pricingSnapshot?.securityDeposit?.amount ?? 0,
        taxAmount: quote.taxCalculation?.taxAmount ?? quote.pricingSnapshot?.tax?.taxAmount ?? 0,
      },
      booking.version
    );

    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.quoted",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: { grossTotal: quote.grossRentalTotal, snapshotId: quote.pricingSnapshot.snapshotId },
    });

    await this.outboxRepo.record({
      tenantId,
      aggregateType: "Booking",
      aggregateId: bookingId,
      eventType: "BookingQuoted",
      payload: {
        bookingId,
        bookingNumber: booking.bookingNumber,
        pricingSnapshot: quote.pricingSnapshot,
        grossTotal: quote.grossRentalTotal,
        currency: booking.currency,
      },
    });

    return updated;
  }

  /**
   * Transitions booking to AWAITING_PAYMENT
   */
  async requestPayment(
    tenantId: string,
    bookingId: string,
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    BookingStateMachine.assertCanTransition(booking.status, "AWAITING_PAYMENT");

    await this.bookingRepo.appendStatusHistory(tenantId, {
      bookingId,
      tenantId,
      fromStatus: booking.status,
      toStatus: "AWAITING_PAYMENT",
      actorType: actor.actorType || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: "Payment invoice issued to customer",
      occurredAt: new Date().toISOString(),
    });

    const updated = await this.bookingRepo.update(
      bookingId,
      tenantId,
      { status: "AWAITING_PAYMENT" },
      booking.version
    );

    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.payment_requested",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: { grossTotal: booking.grossTotal, depositRequired: booking.depositRequired },
    });

    await this.outboxRepo.record({
      tenantId,
      aggregateType: "Booking",
      aggregateId: bookingId,
      eventType: "BookingAwaitingPayment",
      payload: {
        bookingId,
        bookingNumber: booking.bookingNumber,
        grossTotal: booking.grossTotal,
        depositRequired: booking.depositRequired,
        currency: booking.currency,
      },
    });

    return updated;
  }

  /**
   * Concurrency-safe, authoritative confirmation of a Booking reservation with Vehicle Allocation
   */
  async confirmBooking(
    tenantId: string,
    bookingId: string,
    dto: ConfirmBookingDto = {},
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    await this.assertSubscriptionPermitsWrite(tenantId);

    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    // Duplicate confirmation idempotency
    if (booking.status === "CONFIRMED") {
      return booking;
    }

    // Determine target vehicle
    const vehicleId = dto.assignedVehicleId || booking.assignedVehicleId || booking.requestedVehicleId;
    if (!vehicleId) {
      throw new Error("Cannot confirm booking without an assigned vehicle ID.");
    }

    // Verify Vehicle Operability
    const vehicle = await this.vehicleRepo.findById(vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", vehicleId);
    }
    if (vehicle.lifecycleStatus === "RETIRED" || vehicle.lifecycleStatus === "SOLD" || (vehicle.lifecycleStatus as any) === "DECOMMISSIONED") {
      throw new VehicleNotOperationalError(vehicleId, vehicle.lifecycleStatus);
    }

    // Verify State Machine Transition
    BookingStateMachine.assertCanTransition(booking.status, "CONFIRMED", {
      hasAssignedVehicle: true,
      hasPricingSnapshot: !!booking.pricingSnapshot,
    });

    // 1. Authoritative Vehicle Allocation via AvailabilityService
    let allocationId: string;

    const holdToken = dto.holdToken || booking.holdToken;
    if (holdToken) {
      try {
        const confirmedHold = await this.availabilityService.confirmHold(
          tenantId,
          holdToken,
          {
            holdToken,
            sourceType: "BOOKING",
            sourceId: booking.id,
            reason: "Confirmed booking reservation hold conversion",
          },
          actor.userId
        );
        allocationId = confirmedHold.id;
      } catch (err) {
        if (err instanceof AvailabilityConflictError) {
          throw new BookingAvailabilityConflictError(
            `Cannot confirm booking #${booking.bookingNumber}: hold is conflicted or expired.`,
            vehicleId,
            err
          );
        }
        throw err;
      }
    } else {
      // Direct Exclusive Reservation Allocation
      try {
        const allocation = await this.availabilityService.createAllocation(
          tenantId,
          {
            vehicleId,
            startsAt: booking.pickupAt || new Date().toISOString(),
            endsAt: booking.returnAt || new Date().toISOString(),
            allocationType: "EXCLUSIVE_RESERVATION",
            sourceType: "BOOKING",
            sourceId: booking.id,
            notes: `Confirmed Booking #${booking.bookingNumber}`,
          },
          actor.userId
        );
        allocationId = allocation.id;
      } catch (err) {
        if (err instanceof AvailabilityConflictError) {
          throw new BookingAvailabilityConflictError(
            `Vehicle ${vehicle.registrationPlate} is not available for interval ${booking.pickupAt} to ${booking.returnAt}. Another reservation or block exists.`,
            vehicleId,
            err
          );
        }
        throw err;
      }
    }

    // 2. Append Vehicle Assignment Record if changed or new
    if (!booking.assignedVehicleId || booking.assignedVehicleId !== vehicleId) {
      await this.bookingRepo.appendVehicleAssignment(tenantId, {
        bookingId,
        tenantId,
        vehicleId,
        vehicleCategoryId: vehicle.category || (vehicle as any).categoryId || booking.requestedVehicleCategoryId,
        isCurrent: true,
        assignedAt: new Date().toISOString(),
        assignedBy: actor.userId,
        reason: "Confirmed reservation vehicle allocation",
      });
    }

    // 3. Append Status History
    await this.bookingRepo.appendStatusHistory(tenantId, {
      bookingId,
      tenantId,
      fromStatus: booking.status,
      toStatus: "CONFIRMED",
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: dto.reason || "Booking reservation authoritatively confirmed",
      metadata: { allocationId, assignedVehicleId: vehicleId },
      occurredAt: new Date().toISOString(),
    });

    // 4. Update Booking Record
    const now = new Date().toISOString();
    const updated = await this.bookingRepo.update(
      bookingId,
      tenantId,
      {
        status: "CONFIRMED",
        assignedVehicleId: vehicleId,
        allocationId,
        confirmedAt: now,
      },
      dto.expectedVersion ?? booking.version
    );

    // 5. Audit Logging
    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.confirmed",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: {
        bookingNumber: booking.bookingNumber,
        assignedVehicleId: vehicleId,
        allocationId,
      },
    });

    // 6. Transactional Outbox Event
    await this.outboxRepo.record({
      tenantId,
      aggregateType: "Booking",
      aggregateId: bookingId,
      eventType: "BookingConfirmed",
      payload: {
        bookingId,
        bookingNumber: booking.bookingNumber,
        assignedVehicleId: vehicleId,
        allocationId,
        pickupAt: booking.pickupAt,
        returnAt: booking.returnAt,
        customerId: booking.customerId,
        primaryDriverId: booking.primaryDriverId,
        grossTotal: booking.grossTotal,
        depositRequired: booking.depositRequired,
      },
    });

    return updated;
  }

  /**
   * Cancels a Booking and releases its vehicle allocation
   */
  async cancelBooking(
    tenantId: string,
    bookingId: string,
    dto: CancelBookingDto,
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    BookingStateMachine.assertCanTransition(booking.status, "CANCELLED");

    // 1. Release Vehicle Allocation if held/allocated
    if (booking.allocationId) {
      try {
        await this.availabilityService.releaseAllocation(
          tenantId,
          booking.allocationId,
          `Booking #${booking.bookingNumber} cancelled: ${dto.reason}`,
          actor.userId
        );
      } catch (err) {
        console.warn(`[BookingService] Warning releasing allocation ${booking.allocationId}:`, err);
      }
    }

    const now = new Date().toISOString();

    // 2. Append Status History
    await this.bookingRepo.appendStatusHistory(tenantId, {
      bookingId,
      tenantId,
      fromStatus: booking.status,
      toStatus: "CANCELLED",
      actorType: actor.actorType || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: dto.reason,
      occurredAt: now,
    });

    // 3. Update Record
    const updated = await this.bookingRepo.update(
      bookingId,
      tenantId,
      {
        status: "CANCELLED",
        cancellationReason: dto.reason,
        cancelledAt: now,
      },
      dto.expectedVersion ?? booking.version
    );

    // 4. Audit Trail
    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.cancelled",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: { reason: dto.reason, releasedAllocationId: booking.allocationId },
    });

    // 5. Outbox Event
    await this.outboxRepo.record({
      tenantId,
      aggregateType: "Booking",
      aggregateId: bookingId,
      eventType: "BookingCancelled",
      payload: {
        bookingId,
        bookingNumber: booking.bookingNumber,
        reason: dto.reason,
        cancellationFeeCharged: dto.cancellationFeeAmount || 0,
        releasedAllocationId: booking.allocationId,
      },
    });

    return updated;
  }

  /**
   * Rejects a Booking (e.g. compliance, fraud, unserviceable location)
   */
  async rejectBooking(
    tenantId: string,
    bookingId: string,
    dto: RejectBookingDto,
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    BookingStateMachine.assertCanTransition(booking.status, "REJECTED");

    if (booking.allocationId) {
      try {
        await this.availabilityService.releaseAllocation(
          tenantId,
          booking.allocationId,
          `Booking rejected: ${dto.reason}`,
          actor.userId
        );
      } catch (err) {
        console.warn(`[BookingService] Warning releasing allocation ${booking.allocationId}:`, err);
      }
    }

    const now = new Date().toISOString();

    await this.bookingRepo.appendStatusHistory(tenantId, {
      bookingId,
      tenantId,
      fromStatus: booking.status,
      toStatus: "REJECTED",
      actorType: actor.actorType || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: dto.reason,
      occurredAt: now,
    });

    const updated = await this.bookingRepo.update(
      bookingId,
      tenantId,
      {
        status: "REJECTED",
        rejectionReason: dto.reason,
      },
      dto.expectedVersion ?? booking.version
    );

    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.rejected",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: { reason: dto.reason },
    });

    await this.outboxRepo.record({
      tenantId,
      aggregateType: "Booking",
      aggregateId: bookingId,
      eventType: "BookingRejected",
      payload: {
        bookingId,
        bookingNumber: booking.bookingNumber,
        reason: dto.reason,
      },
    });

    return updated;
  }

  /**
   * Expires an unconfirmed or unpaid booking whose time limit has elapsed
   */
  async expireBooking(
    tenantId: string,
    bookingId: string,
    dto: ExpireBookingDto = {},
    actor: BookingActor = { userId: "system", actorType: "SYSTEM" }
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    BookingStateMachine.assertCanTransition(booking.status, "EXPIRED");

    if (booking.allocationId) {
      try {
        await this.availabilityService.releaseAllocation(
          tenantId,
          booking.allocationId,
          `Booking expired: ${dto.reason || "Quote window elapsed"}`,
          actor.userId
        );
      } catch (err) {
        console.warn(`[BookingService] Warning releasing allocation ${booking.allocationId}:`, err);
      }
    }

    const now = new Date().toISOString();

    await this.bookingRepo.appendStatusHistory(tenantId, {
      bookingId,
      tenantId,
      fromStatus: booking.status,
      toStatus: "EXPIRED",
      actorType: actor.actorType || "SYSTEM",
      actorId: actor.userId,
      reason: dto.reason || "Quote or payment time window expired",
      occurredAt: now,
    });

    const updated = await this.bookingRepo.update(
      bookingId,
      tenantId,
      {
        status: "EXPIRED",
        expiresAt: now,
      },
      dto.expectedVersion ?? booking.version
    );

    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "SYSTEM",
      actorId: actor.userId,
      action: "booking.expired",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: { reason: dto.reason },
    });

    await this.outboxRepo.record({
      tenantId,
      aggregateType: "Booking",
      aggregateId: bookingId,
      eventType: "BookingExpired",
      payload: {
        bookingId,
        bookingNumber: booking.bookingNumber,
        reason: dto.reason,
      },
    });

    return updated;
  }

  /**
   * Marks a confirmed booking as NO_SHOW and releases allocation
   */
  async markNoShow(
    tenantId: string,
    bookingId: string,
    dto: NoShowBookingDto = {},
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    BookingStateMachine.assertCanTransition(booking.status, "NO_SHOW");

    if (booking.allocationId) {
      try {
        await this.availabilityService.releaseAllocation(
          tenantId,
          booking.allocationId,
          `Booking marked NO_SHOW: ${dto.reason || "Customer failed to pick up asset"}`,
          actor.userId
        );
      } catch (err) {
        console.warn(`[BookingService] Warning releasing allocation ${booking.allocationId}:`, err);
      }
    }

    const now = new Date().toISOString();

    await this.bookingRepo.appendStatusHistory(tenantId, {
      bookingId,
      tenantId,
      fromStatus: booking.status,
      toStatus: "NO_SHOW",
      actorType: actor.actorType || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: dto.reason || "Customer did not arrive to collect vehicle",
      occurredAt: now,
    });

    const updated = await this.bookingRepo.update(
      bookingId,
      tenantId,
      {
        status: "NO_SHOW",
        noShowAt: now,
      },
      dto.expectedVersion ?? booking.version
    );

    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.marked_no_show",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: { reason: dto.reason, penaltyFeeAmount: dto.penaltyFeeAmount },
    });

    await this.outboxRepo.record({
      tenantId,
      aggregateType: "Booking",
      aggregateId: bookingId,
      eventType: "BookingMarkedNoShow",
      payload: {
        bookingId,
        bookingNumber: booking.bookingNumber,
        reason: dto.reason,
        penaltyFeeCharged: dto.penaltyFeeAmount,
      },
    });

    return updated;
  }

  /**
   * Concurrency-safe vehicle substitution on a booking
   */
  async substituteVehicle(
    tenantId: string,
    bookingId: string,
    dto: SubstituteBookingVehicleDto,
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    if (BookingStateMachine.isTerminal(booking.status)) {
      throw new BookingImmutableError(bookingId, booking.status);
    }

    const originalVehicleId = booking.assignedVehicleId || booking.requestedVehicleId;
    if (originalVehicleId === dto.replacementVehicleId) {
      return booking;
    }

    const replacementVehicle = await this.vehicleRepo.findById(dto.replacementVehicleId, tenantId);
    if (!replacementVehicle) {
      throw new RecordNotFoundError("Vehicle", dto.replacementVehicleId);
    }
    if (replacementVehicle.lifecycleStatus === "RETIRED" || replacementVehicle.lifecycleStatus === "SOLD" || (replacementVehicle.lifecycleStatus as any) === "DECOMMISSIONED") {
      throw new VehicleNotOperationalError(dto.replacementVehicleId, replacementVehicle.lifecycleStatus);
    }

    let newAllocationId: string | null = null;

    // If booking was CONFIRMED or ACTIVE, allocate replacement vehicle first
    if (booking.status === "CONFIRMED" || booking.status === "ACTIVE") {
      try {
        const newAllocation = await this.availabilityService.createAllocation(
          tenantId,
          {
            vehicleId: dto.replacementVehicleId,
            startsAt: booking.pickupAt || new Date().toISOString(),
            endsAt: booking.returnAt || new Date().toISOString(),
            allocationType: "EXCLUSIVE_RESERVATION",
            sourceType: "BOOKING",
            sourceId: booking.id,
            notes: `Vehicle substitution from ${originalVehicleId || "unassigned"} to ${dto.replacementVehicleId}: ${dto.reason}`,
          },
          actor.userId
        );
        newAllocationId = newAllocation.id;
      } catch (err) {
        if (err instanceof AvailabilityConflictError) {
          throw new BookingAvailabilityConflictError(
            `Replacement vehicle ${replacementVehicle.registrationPlate} is not available for requested period.`,
            dto.replacementVehicleId,
            err
          );
        }
        throw err;
      }

      // Release old allocation
      if (booking.allocationId) {
        try {
          await this.availabilityService.releaseAllocation(
            tenantId,
            booking.allocationId,
            `Substituted to vehicle ${dto.replacementVehicleId}`,
            actor.userId
          );
        } catch (err) {
          console.warn(`[BookingService] Error releasing old allocation:`, err);
        }
      }
    }

    const now = new Date().toISOString();
    const substitutionRecord: VehicleSubstitution = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      bookingId,
      originalVehicleId: originalVehicleId || "unassigned",
      replacementVehicleId: dto.replacementVehicleId,
      reason: dto.reason,
      actorId: actor.userId,
      timestamp: now,
    };

    // Append vehicle assignment
    await this.bookingRepo.appendVehicleAssignment(tenantId, {
      bookingId,
      tenantId,
      vehicleId: dto.replacementVehicleId,
      vehicleCategoryId: replacementVehicle.category || (replacementVehicle as any).categoryId,
      isCurrent: true,
      assignedAt: now,
      assignedBy: actor.userId,
      reason: `Substitution: ${dto.reason}`,
    });

    const substitutions = [...(booking.substitutions || []), substitutionRecord];

    const updated = await this.bookingRepo.update(
      bookingId,
      tenantId,
      {
        assignedVehicleId: dto.replacementVehicleId,
        allocationId: newAllocationId || booking.allocationId,
        substitutions,
      },
      dto.expectedVersion ?? booking.version
    );

    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.vehicle_substituted",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: {
        originalVehicleId,
        replacementVehicleId: dto.replacementVehicleId,
        reason: dto.reason,
      },
    });

    await this.outboxRepo.record({
      tenantId,
      aggregateType: "Booking",
      aggregateId: bookingId,
      eventType: "BookingVehicleSubstituted",
      payload: {
        bookingId,
        bookingNumber: booking.bookingNumber,
        substitution: substitutionRecord,
        newAllocationId: newAllocationId || undefined,
      },
    });

    return updated;
  }

  /**
   * Amends the dates of a booking
   */
  async amendDates(
    tenantId: string,
    bookingId: string,
    dto: AmendBookingDatesDto,
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    if (BookingStateMachine.isTerminal(booking.status)) {
      throw new BookingImmutableError(bookingId, booking.status);
    }

    const newStart = new Date(dto.pickupAt).getTime();
    const newEnd = new Date(dto.returnAt).getTime();
    if (isNaN(newStart) || isNaN(newEnd) || newEnd <= newStart) {
      throw new Error("Invalid amended dates: returnAt must be strictly greater than pickupAt.");
    }

    let newAllocationId = booking.allocationId;

    // If CONFIRMED, re-allocate the vehicle
    if (booking.status === "CONFIRMED" && booking.assignedVehicleId) {
      try {
        const newAllocation = await this.availabilityService.createAllocation(
          tenantId,
          {
            vehicleId: booking.assignedVehicleId,
            startsAt: dto.pickupAt,
            endsAt: dto.returnAt,
            allocationType: "EXCLUSIVE_RESERVATION",
            sourceType: "BOOKING",
            sourceId: booking.id,
            notes: `Amended dates: ${dto.reason}`,
          },
          actor.userId
        );
        newAllocationId = newAllocation.id;
      } catch (err) {
        if (err instanceof AvailabilityConflictError) {
          throw new BookingAvailabilityConflictError(
            `Assigned vehicle is not available for new interval ${dto.pickupAt} to ${dto.returnAt}.`,
            booking.assignedVehicleId,
            err
          );
        }
        throw err;
      }

      if (booking.allocationId) {
        try {
          await this.availabilityService.releaseAllocation(
            tenantId,
            booking.allocationId,
            `Amended reservation window`,
            actor.userId
          );
        } catch (err) {
          console.warn(`[BookingService] Error releasing old allocation:`, err);
        }
      }
    }

    const updates: Partial<Booking> = {
      pickupAt: dto.pickupAt,
      returnAt: dto.returnAt,
      allocationId: newAllocationId,
    };

    if (dto.recalculatePricing !== false) {
      const quote = await this.calculateQuote(tenantId, {
        pickupAt: dto.pickupAt,
        returnAt: dto.returnAt,
        vehicleId: booking.assignedVehicleId || booking.requestedVehicleId || undefined,
        vehicleCategoryId: booking.requestedVehicleCategoryId || undefined,
        customerId: booking.customerId || undefined,
        corporateAccountId: booking.corporateAccountId || undefined,
        agentId: booking.agentId || undefined,
        ratePlanId: booking.pricingSnapshot?.ratePlanId || undefined,
      });

      updates.pricingSnapshot = quote.pricingSnapshot;
      updates.grossTotal = quote.grossRentalTotal;
      updates.netRentalSubtotal = quote.netRentalSubtotal;
      updates.depositRequired = quote.securityDeposit?.amount ?? quote.pricingSnapshot?.securityDeposit?.amount ?? 0;
      updates.taxAmount = quote.taxCalculation?.taxAmount ?? quote.pricingSnapshot?.tax?.taxAmount ?? 0;

      const newVersion = (booking.pricingSnapshotVersion || 1) + 1;
      await this.bookingRepo.appendPricingSnapshot(tenantId, {
        bookingId,
        tenantId,
        version: newVersion,
        isCurrent: true,
        snapshot: quote.pricingSnapshot,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        createdBy: actor.userId,
      });
      updates.pricingSnapshotVersion = newVersion;
    }

    const updated = await this.bookingRepo.update(
      bookingId,
      tenantId,
      updates,
      dto.expectedVersion ?? booking.version
    );

    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.dates_amended",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: {
        oldPickupAt: booking.pickupAt,
        oldReturnAt: booking.returnAt,
        newPickupAt: dto.pickupAt,
        newReturnAt: dto.returnAt,
        reason: dto.reason,
      },
    });

    await this.outboxRepo.record({
      tenantId,
      aggregateType: "Booking",
      aggregateId: bookingId,
      eventType: "BookingDatesAmended",
      payload: {
        bookingId,
        bookingNumber: booking.bookingNumber,
        oldPickupAt: booking.pickupAt,
        oldReturnAt: booking.returnAt,
        newPickupAt: dto.pickupAt,
        newReturnAt: dto.returnAt,
        pricingRecalculated: dto.recalculatePricing !== false,
      },
    });

    return updated;
  }

  /**
   * Test / Operational desk payment simulation helper
   */
  async simulatePayment(
    tenantId: string,
    bookingId: string,
    dto: SimulateBookingPaymentDto,
    actor: BookingActor = { userId: "system", actorType: "USER" }
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    const newAmountPaid = (booking.amountPaid || 0) + dto.amount;
    const isFullyPaid = newAmountPaid >= (booking.grossTotal || 0);

    const updates: Partial<Booking> = {
      amountPaid: newAmountPaid,
      paymentStatus: isFullyPaid ? "FULLY_PAID" : "PARTIALLY_PAID",
    };

    if (dto.paymentType === "SECURITY_DEPOSIT") {
      updates.depositStatus = "HELD";
    }

    const updated = await this.bookingRepo.update(bookingId, tenantId, updates, booking.version);

    await this.auditRepo.record({
      tenantId,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      action: "booking.payment_simulated",
      resourceType: "Booking",
      resourceId: bookingId,
      metadata: {
        amount: dto.amount,
        paymentType: dto.paymentType,
        paymentMethod: dto.paymentMethod,
        ref: dto.transactionReference,
      },
    });

    return updated;
  }

  /**
   * Queries a booking by ID
   */
  async getBooking(tenantId: string, bookingId: string): Promise<Booking> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }
    return booking;
  }

  /**
   * Queries a booking by booking number
   */
  async getBookingByNumber(tenantId: string, bookingNumber: string): Promise<Booking> {
    const booking = await this.bookingRepo.findByBookingNumber(bookingNumber, tenantId);
    if (!booking) {
      throw new RecordNotFoundError("Booking", bookingNumber);
    }
    return booking;
  }

  /**
   * Lists bookings with pagination and filters
   */
  async listBookings(
    tenantId: string,
    query?: BookingListQueryDto
  ): Promise<{ items: Booking[]; total: number }> {
    return this.bookingRepo.findMany(tenantId, query);
  }
}
