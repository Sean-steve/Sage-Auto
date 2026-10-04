import { createRecordStore } from "@carhire/database/record-store";
import { createHash } from "node:crypto";
// ============================================================================
// CAR HIRE OS — PUBLIC BOOKING APPLICATION SERVICE (Sprint 31)
// Bounded Context: Public Booking & Checkout Orchestration
// Orchestrates Fleet, Availability, Pricing, Customers, Bookings & Payments
// ============================================================================

import type {
  PricingResult,
  Booking,
  Customer,
  Vehicle,
} from "@carhire/types";
import {
  IVehicleRepository,
  VehicleRepository,
  IVehicleCategoryRepository,
  VehicleCategoryRepository,
  ICustomerRepository,
  CustomerRepository,
  IBookingRepository,
  BookingRepository,
  IAuditRepository,
  AuditRepository,
  IOutboxRepository,
  OutboxRepository,
  IVehicleMediaRepository,
  VehicleMediaRepository,
} from "@carhire/database";
import { AvailabilityService } from "../../availability/application/availability.service";
import { PricingService } from "../../pricing/application/pricing.service";
import { BookingService } from "../../bookings/application/booking.service";
import { PaymentService } from "../../payments/application/payment.service";
import {
  PublicVehicleFilterDto,
  PublicAvailabilityQueryDto,
  PublicQuoteRequestDto,
  PublicCheckoutRequestDto,
  PublicVehicleSummaryDto,
  PublicBookingVoucherDto,
} from "./dto/public-booking.dto";
import {
  VehicleNotAvailableForBookingError,
  VehicleNotPubliclyRentableError,
  GuestCustomerInvalidError,
  GuestCustomerBlockedError,
  PublicBookingNotFoundError,
} from "../domain/public-booking.errors";

export class PublicBookingService {
  private readonly vehicleRepo: IVehicleRepository;
  private readonly categoryRepo: IVehicleCategoryRepository;
  private readonly customerRepo: ICustomerRepository;
  private readonly bookingRepo: IBookingRepository;
  private readonly mediaRepo: IVehicleMediaRepository;
  private readonly availabilityService: AvailabilityService;
  private readonly pricingService: PricingService;
  private readonly bookingService: BookingService;
  private readonly paymentService?: PaymentService;
  private readonly auditRepo: IAuditRepository;
  private readonly outboxRepo: IOutboxRepository;

  private static checkoutIdempotencyCache = createRecordStore<string, {requestHash:string;voucher:PublicBookingVoucherDto}>("public-booking:checkout");

  constructor(deps: {
    vehicleRepo?: IVehicleRepository;
    categoryRepo?: IVehicleCategoryRepository;
    customerRepo?: ICustomerRepository;
    bookingRepo?: IBookingRepository;
    mediaRepo?: IVehicleMediaRepository;
    availabilityService?: AvailabilityService;
    pricingService?: PricingService;
    bookingService?: BookingService;
    paymentService?: PaymentService;
    auditRepo?: IAuditRepository;
    outboxRepo?: IOutboxRepository;
  }) {
    this.vehicleRepo = deps.vehicleRepo || new VehicleRepository();
    this.categoryRepo = deps.categoryRepo || new VehicleCategoryRepository();
    this.customerRepo = deps.customerRepo || new CustomerRepository();
    this.bookingRepo = deps.bookingRepo || new BookingRepository();
    this.mediaRepo = deps.mediaRepo || new VehicleMediaRepository();
    this.availabilityService = deps.availabilityService || new AvailabilityService();
    this.pricingService = deps.pricingService || new PricingService();
    this.bookingService = deps.bookingService || new BookingService();
    this.paymentService = deps.paymentService;
    this.auditRepo = deps.auditRepo || new AuditRepository();
    this.outboxRepo = deps.outboxRepo || new OutboxRepository();
  }

  // --------------------------------------------------------------------------
  // 1. PUBLIC VEHICLE DISCOVERY (Privacy-Sanitized)
  // --------------------------------------------------------------------------

  async getPublicVehicles(
    tenantId: string,
    filter?: PublicVehicleFilterDto
  ): Promise<PublicVehicleSummaryDto[]> {
    const fleetResult = await this.vehicleRepo.findAll(tenantId, {
      category: filter?.category,
      limit: filter?.limit || 100,
    });

    const categories = await this.categoryRepo.findAll(tenantId);
    const categoryMap = new Map(categories.map((c) => [c.code, c.name]));

    const operationalVehicles = fleetResult.vehicles.filter((v) => {
      const lifecycle=String(v.lifecycleStatus||"").toUpperCase();
      const availability=String(v.availabilityStatus||"").toUpperCase();
      return ["ACTIVE","OPERATIONAL"].includes(lifecycle)
        && v.isPublishedToWebsite !== false
        && !["MAINTENANCE","BLOCKED"].includes(availability);
    });

    const summaries: PublicVehicleSummaryDto[] = [];

    for (const v of operationalVehicles) {
      if (filter?.fuelType && v.fuelType !== filter.fuelType) continue;
      if (filter?.transmission && v.transmission !== filter.transmission) continue;
      if (filter?.minSeats && (v.seats || 5) < filter.minSeats) continue;

      const mediaItems = await this.mediaRepo.listByVehicle(v.id, tenantId);
      const images = mediaItems.map((m) => (m as any).url || `/api/v1/media/public/${m.mediaAssetId || m.id}`);
      const primary = mediaItems.find((m) => m.isPrimary);
      const primaryUrl = (primary as any)?.url || images[0] || v.imageUrl || undefined;

      summaries.push({
        id: v.id,
        make: v.make,
        model: v.model,
        year: v.year,
        category: v.category,
        categoryName: categoryMap.get(v.category) || v.category,
        transmission: v.transmission || "AUTOMATIC",
        fuelType: v.fuelType || "PETROL",
        seatingCapacity: v.seats || 5,
        luggageCapacity: (v as any).luggageCapacity || 3,
        features: v.features || [],
        dailyRate: v.dailyRate ?? 0,
        currency: (v as any).currency || "KES",
        images,
        primaryImageUrl: primaryUrl,
        isAvailableNow: v.availabilityStatus === "AVAILABLE",
      });
    }

    return summaries;
  }

  async getPublicVehicleDetails(
    tenantId: string,
    vehicleId: string
  ): Promise<PublicVehicleSummaryDto> {
    const vehicle = await this.vehicleRepo.findById(vehicleId, tenantId);
    const lifecycle=String(vehicle?.lifecycleStatus||"").toUpperCase();
    const availability=String(vehicle?.availabilityStatus||"").toUpperCase();
    if (!vehicle || !["ACTIVE","OPERATIONAL"].includes(lifecycle) || vehicle.isPublishedToWebsite === false || ["MAINTENANCE","BLOCKED"].includes(availability)) {
      throw new VehicleNotPubliclyRentableError(vehicleId);
    }

    const categories = await this.categoryRepo.findAll(tenantId);
    const categoryName = categories.find((c) => c.code === vehicle.category)?.name || vehicle.category;

    const mediaItems = await this.mediaRepo.listByVehicle(vehicle.id, tenantId);
    const images = mediaItems.map((m) => (m as any).url || `/api/v1/media/public/${m.mediaAssetId || m.id}`);
    const primary = mediaItems.find((m) => m.isPrimary);
    const primaryUrl = (primary as any)?.url || images[0] || undefined;

    return {
      id: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      category: vehicle.category,
      categoryName,
      transmission: vehicle.transmission || "AUTOMATIC",
      fuelType: vehicle.fuelType || "PETROL",
      seatingCapacity: vehicle.seats || 5,
      luggageCapacity: (vehicle as any).luggageCapacity || 3,
      features: vehicle.features || [],
      dailyRate: vehicle.dailyRate || 5000,
      currency: (vehicle as any).currency || "KES",
      images,
      primaryImageUrl: primaryUrl,
      isAvailableNow: vehicle.availabilityStatus === "AVAILABLE",
    };
  }

  // --------------------------------------------------------------------------
  // 2. LIVE AVAILABILITY SEARCH (Non-Blocking, Stateless)
  // --------------------------------------------------------------------------

  async searchAvailability(
    tenantId: string,
    query: PublicAvailabilityQueryDto
  ): Promise<{ availableVehicles: PublicVehicleSummaryDto[]; total: number; pickupAt: string; returnAt: string }> {
    const searchResult = await this.availabilityService.searchAvailableVehicles(tenantId, {
      pickupAt: query.pickupAt,
      returnAt: query.returnAt,
      vehicleCategoryId: query.vehicleCategoryId,
      features: query.features,
      turnaroundMinutes: 60,
    });

    const summaries: PublicVehicleSummaryDto[] = [];
    const categories = await this.categoryRepo.findAll(tenantId);
    const categoryMap = new Map(categories.map((c) => [c.code, c.name]));
    const publiclyDiscoverable = new Set(
      (await this.getPublicVehicles(tenantId, { limit: 1000 })).map((vehicle) => vehicle.id)
    );

    for (const candidate of searchResult.vehicles) {
      // Availability is broader than public discovery. Never leak unpublished,
      // blocked or maintenance vehicles into the customer search result.
      if (!publiclyDiscoverable.has(candidate.id)) continue;
      const mediaItems = await this.mediaRepo.listByVehicle(candidate.id, tenantId);
      const images = mediaItems.map((m) => (m as any).url || `/api/v1/media/public/${m.mediaAssetId || m.id}`);
      const primary = mediaItems.find((m) => m.isPrimary);
      const primaryUrl = (primary as any)?.url || images[0] || undefined;

      summaries.push({
        id: candidate.id,
        make: candidate.make,
        model: candidate.model,
        year: candidate.year,
        category: candidate.vehicleCategoryId,
        categoryName: categoryMap.get(candidate.vehicleCategoryId) || candidate.vehicleCategoryId,
        transmission: (candidate as any).transmission || "AUTOMATIC",
        fuelType: candidate.fuelType || "PETROL",
        seatingCapacity: (candidate as any).seats || (candidate as any).seatingCapacity || 5,
        luggageCapacity: (candidate as any).luggageCapacity || 3,
        features: (candidate as any).features || [],
        dailyRate: candidate.dailyRate ?? 0,
        currency: (candidate as any).currency || "KES",
        images,
        primaryImageUrl: primaryUrl,
        isAvailableNow: true,
      });
    }

    return {
      availableVehicles: summaries,
      total: summaries.length,
      pickupAt: query.pickupAt,
      returnAt: query.returnAt,
    };
  }

  // --------------------------------------------------------------------------
  // 3. AUTHORITATIVE PUBLIC PRICING QUOTE
  // --------------------------------------------------------------------------

  async calculateQuote(
    tenantId: string,
    dto: PublicQuoteRequestDto
  ): Promise<PricingResult> {
    let categoryId = dto.vehicleCategoryId;
    if (!categoryId && dto.vehicleId) {
      const vehicle = await this.vehicleRepo.findById(dto.vehicleId);
      if (vehicle && vehicle.tenantId === tenantId && vehicle.isPublishedToWebsite !== false) {
        categoryId = (vehicle as any).vehicleCategoryId || vehicle.category;
      }
    }

    return this.pricingService.calculatePrice(tenantId, {
      pickupDateTime: dto.pickupAt,
      returnDateTime: dto.returnAt,
      vehicleId: dto.vehicleId,
      vehicleCategoryId: categoryId,
      promoCode: dto.promoCode,
      currency: dto.currency || "KES",
    });
  }

  // --------------------------------------------------------------------------
  // 4. GUEST CUSTOMER RESOLUTION & CONCURRENCY-SAFE CHECKOUT
  // --------------------------------------------------------------------------

  async checkout(
    tenantId: string,
    dto: PublicCheckoutRequestDto
  ): Promise<PublicBookingVoucherDto> {
    await this.getPublicVehicleDetails(tenantId, dto.vehicleId);
    const requestHash = createHash("sha256").update(JSON.stringify(dto)).digest("hex");
    // 0. Idempotency Check
    if (dto.idempotencyKey) {
      const key = `${tenantId}:${dto.idempotencyKey}`;
      const cached = PublicBookingService.checkoutIdempotencyCache.get(key);
      if (cached) {
        if(cached.requestHash !== requestHash) throw new GuestCustomerInvalidError("This booking key has already been used for different details.");
        return cached.voucher;
      }
    }

    // 1. Validate Guest Details
    if (!dto.guest.fullName || !dto.guest.email || !dto.guest.phone || !dto.guest.idOrPassportNumber) {
      throw new GuestCustomerInvalidError("Full name, email, phone, and ID/Passport number are required.");
    }

    // 2. Concurrency-safe availability check
    const availabilityCheck = await this.availabilityService.checkVehicleAvailability(tenantId, {
      vehicleId: dto.vehicleId,
      pickupAt: dto.pickupAt,
      returnAt: dto.returnAt,
      turnaroundMinutes: 60,
    });

    if (!availabilityCheck.available) {
      throw new VehicleNotAvailableForBookingError(dto.vehicleId, availabilityCheck.message || "Vehicle unavailable");
    }

    // 3. Resolve or Create Guest Customer in Tenant Context
    let customer: Customer | null = await this.customerRepo.findByIdOrPassport(
      dto.guest.idOrPassportNumber,
      tenantId
    );

    if (!customer) {
      customer = await this.customerRepo.findByEmail(dto.guest.email, tenantId);
    }

    if (customer) {
      if (customer.status === "BLOCKED") {
        throw new GuestCustomerBlockedError("Your customer account is flagged. Please contact the branch directly.");
      }
    } else {
      customer = await this.customerRepo.create({
        tenantId,
        customerType: "INDIVIDUAL",
        fullName: dto.guest.fullName,
        email: dto.guest.email,
        phone: dto.guest.phone,
        idOrPassportNumber: dto.guest.idOrPassportNumber,
        licenseNumber: dto.guest.licenseNumber || `DL-${dto.guest.idOrPassportNumber.slice(-6)}`,
        licenseExpiryDate: dto.guest.licenseExpiryDate || new Date(Date.now() + 365 * 86400000 * 5).toISOString(),
        status: "ACTIVE",
        verificationStatus: "PENDING_VERIFICATION",
      });
    }

    // 4. Concurrency-safe reservation hold on the availability engine
    let holdToken: string | undefined;
    try {
      const holdRes = await this.availabilityService.createHold(
        tenantId,
        {
          vehicleId: dto.vehicleId,
          startsAt: dto.pickupAt,
          endsAt: dto.returnAt,
          ttlMinutes: 30,
          reason: "Public checkout reservation hold",
        },
        customer.id
      );
      holdToken = holdRes.hold.holdToken;
    } catch (err: any) {
      if (err.name === "AvailabilityConflictError" || err.code === "AVAILABILITY_CONFLICT") {
        throw new VehicleNotAvailableForBookingError(dto.vehicleId, err.message);
      }
      throw err;
    }

    // 5. Calculate Authoritative Price & Pricing Snapshot
    const quote = await this.pricingService.calculatePrice(tenantId, {
      pickupDateTime: dto.pickupAt,
      returnDateTime: dto.returnAt,
      vehicleId: dto.vehicleId,
      promoCode: dto.promoCode,
      customerId: customer.id,
      currency: "KES",
    });

    // 6. Create Authoritative Booking Aggregate
    const booking = await this.bookingService.createBooking(
      tenantId,
      {
        customerId: customer.id,
        vehicleId: dto.vehicleId,
        assignedVehicleId: dto.vehicleId,
        pickupAt: dto.pickupAt,
        returnAt: dto.returnAt,
        pickupLocation: dto.pickupLocation || "Main Branch",
        returnLocation: dto.returnLocation || dto.pickupLocation || "Main Branch",
        promoCode: dto.promoCode,
        bookingSource: "PUBLIC_WEBSITE",
        status: "PENDING_CONFIRMATION",
        initialStatus: "PENDING_CONFIRMATION",
        idempotencyKey: dto.idempotencyKey,
        holdToken,
      } as any,
      {
        userId: customer.id,
        actorType: "CUSTOMER",
        name: customer.fullName,
      }
    );

    // 7. Payment Handoff (M-Pesa STK push or Card)
    let paymentAttemptInfo: { attemptId: string; status: string; provider: string; checkoutUrl?: string } | undefined;

    if (this.paymentService && dto.paymentMethod !== "PAY_LATER") {
      const provider = dto.paymentMethod === "MPESA" ? "MPESA_DARAJA" : "STRIPE_CARD";
      const paymentAmount = quote.grossRentalTotal.toFixed(4);

      const attempt = await this.paymentService.initiatePaymentAttempt(
        tenantId,
        {
          provider,
          amount: paymentAmount,
          currency: quote.currency,
          purpose: "CUSTOMER_INVOICE",
          targetId: booking.id,
          customerId: customer.id,
          customerName: customer.fullName,
          customerEmail: customer.email,
          customerPhone: dto.paymentDetails?.mpesaPhoneNumber || customer.phone,
          returnUrl: dto.paymentDetails?.returnUrl,
          callbackUrl: dto.paymentDetails?.returnUrl,
          idempotencyKey: dto.idempotencyKey ? `pay_${dto.idempotencyKey}` : undefined,
        },
        {
          userId: customer.id,
          tenantId,
        }
      );

      paymentAttemptInfo = {
        attemptId: attempt.id,
        status: attempt.status,
        provider: attempt.provider,
        checkoutUrl: (attempt as any).checkoutUrl,
      };
    }

    // 7. Fetch vehicle details for voucher
    const vehicle = await this.vehicleRepo.findById(dto.vehicleId, tenantId);

    // 8. Construct Public Voucher
    const voucher: PublicBookingVoucherDto = {
      bookingId: booking.id,
      bookingReference: booking.bookingNumber,
      status: booking.status,
      source: "PUBLIC_WEBSITE",
      vehicle: {
        id: dto.vehicleId,
        make: vehicle?.make || "Unknown",
        model: vehicle?.model || "Vehicle",
        year: vehicle?.year || 2024,
        category: vehicle?.category || "SEDAN",
        image: undefined,
      },
      customer: {
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
      },
      schedule: {
        pickupAt: dto.pickupAt,
        returnAt: dto.returnAt,
        durationDays: quote.rentalDuration.billableDays,
        pickupLocation: dto.pickupLocation,
        returnLocation: dto.returnLocation,
      },
      pricing: {
        currency: quote.currency,
        subtotal: quote.netRentalSubtotal,
        taxAmount: quote.taxCalculation.taxAmount,
        depositAmount: quote.securityDeposit.amount,
        discountAmount: quote.totalDiscount,
        grossTotal: quote.grossRentalTotal,
        isPaid: false,
      },
      payment: paymentAttemptInfo
        ? {
            attemptId: paymentAttemptInfo.attemptId,
            status: paymentAttemptInfo.status,
            provider: paymentAttemptInfo.provider,
            checkoutUrl: paymentAttemptInfo.checkoutUrl,
            instructions:
              dto.paymentMethod === "MPESA"
                ? "Enter your M-Pesa PIN on your phone to complete reservation."
                : "Complete checkout using your card.",
          }
        : undefined,
      createdAt: booking.createdAt,
    };

    if (dto.idempotencyKey) {
      const key = `${tenantId}:${dto.idempotencyKey}`;
      PublicBookingService.checkoutIdempotencyCache.set(key, {requestHash,voucher});
    }

    return voucher;
  }

  // --------------------------------------------------------------------------
  // 5. BOOKING STATUS & SERVER-VERIFIED PAYMENT CONFIRMATION
  // --------------------------------------------------------------------------

  private toPublicTimeline(booking: any): NonNullable<PublicBookingVoucherDto["timeline"]> {
    const labels:Record<string,string>={
      DRAFT:"Booking started",
      PENDING_CONFIRMATION:"Request received",
      QUOTED:"Price confirmed",
      AWAITING_PAYMENT:"Awaiting payment",
      CONFIRMED:"Booking confirmed",
      ACTIVE:"Vehicle handed over",
      COMPLETED:"Rental completed",
      CANCELLED:"Booking cancelled",
      REJECTED:"Booking declined",
      NO_SHOW:"Marked as no-show",
      EXPIRED:"Booking expired",
    };
    return (booking.statusHistory||[])
      .slice()
      .sort((a:any,b:any)=>new Date(a.occurredAt||a.changedAt||0).getTime()-new Date(b.occurredAt||b.changedAt||0).getTime())
      .map((row:any)=>({
        id:row.id,
        status:row.toStatus,
        occurredAt:row.occurredAt||row.changedAt||booking.updatedAt||booking.createdAt,
        title:labels[row.toStatus]||String(row.toStatus||"Update").replaceAll("_"," "),
        message:row.reason||"Your rental team updated this booking.",
      }));
  }

  async getBookingStatus(
    tenantId: string,
    bookingId: string
  ): Promise<PublicBookingVoucherDto> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new PublicBookingNotFoundError(bookingId);
    }

    const customer = await this.customerRepo.findById(booking.customerId, tenantId);
    const vehicle = booking.assignedVehicleId
      ? await this.vehicleRepo.findById(booking.assignedVehicleId, tenantId)
      : null;

    return {
      bookingId: booking.id,
      bookingReference: booking.bookingNumber,
      status: booking.status,
      source: booking.source || "PUBLIC_WEBSITE",
      vehicle: {
        id: vehicle?.id || "N/A",
        make: vehicle?.make || "Unknown",
        model: vehicle?.model || "Vehicle",
        year: vehicle?.year || 2024,
        category: vehicle?.category || "SEDAN",
      },
      customer: {
        fullName: customer?.fullName || "Guest Customer",
        email: customer?.email || "guest@example.com",
        phone: customer?.phone || "",
      },
      schedule: {
        pickupAt: booking.pickupAt || "",
        returnAt: booking.returnAt || "",
        durationDays: booking.pickupAt && booking.returnAt
          ? Math.max(1, Math.ceil((new Date(booking.returnAt).getTime() - new Date(booking.pickupAt).getTime()) / 86400000))
          : 1,
        pickupLocation: booking.pickupLocation,
        returnLocation: booking.returnLocation,
      },
      pricing: {
        currency: booking.pricingSnapshot?.currency || "KES",
        subtotal: booking.pricingSnapshot?.netRentalSubtotal || booking.pricingSnapshot?.baseRentalAmount || 0,
        taxAmount: booking.pricingSnapshot?.tax?.taxAmount || 0,
        depositAmount: booking.pricingSnapshot?.securityDeposit?.amount || 0,
        discountAmount: booking.pricingSnapshot?.totalDiscount || 0,
        grossTotal: booking.pricingSnapshot?.grossRentalTotal || 0,
        isPaid: booking.paymentStatus === "FULLY_PAID",
      },
      timeline: this.toPublicTimeline(booking),
      createdAt: booking.createdAt,
    };
  }

  async getBookingAccount(
    tenantId: string,
    bookingReference: string,
    email: string
  ): Promise<PublicBookingVoucherDto> {
    const booking=await this.bookingRepo.findByBookingNumber(bookingReference.trim(),tenantId);
    if(!booking)throw new PublicBookingNotFoundError(bookingReference);
    const customer=await this.customerRepo.findById(booking.customerId,tenantId);
    if(!customer||customer.email.trim().toLowerCase()!==email.trim().toLowerCase()){
      throw new PublicBookingNotFoundError(bookingReference);
    }
    return this.getBookingStatus(tenantId,booking.id);
  }

  async verifyPaymentAndConfirmBooking(
    tenantId: string,
    attemptId: string
  ): Promise<{ success: boolean; bookingStatus: string; paymentId?: string }> {
    if (!this.paymentService) {
      throw new Error("Payment service not configured");
    }

    const payment = await this.paymentService.verifyPaymentAttempt(
      tenantId,
      attemptId,
      { userId: "public-gateway", tenantId }
    );

    // If payment verified, find the associated booking and confirm it
    const attempt = await (this.paymentService as any).attemptRepo.findById(attemptId, tenantId);
    if (attempt && attempt.targetId) {
      const bookingId = attempt.targetId;
      const updatedBooking = await this.bookingService.confirmBooking(
        tenantId,
        bookingId,
        {
          paymentReference: payment.id,
        },
        { userId: "payment-webhook", actorType: "USER", name: "Payment Processor" }
      );

      return {
        success: true,
        bookingStatus: updatedBooking.status,
        paymentId: payment.id,
      };
    }

    return {
      success: true,
      bookingStatus: "CONFIRMED",
      paymentId: payment.id,
    };
  }
}
