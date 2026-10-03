// ============================================================================
// CAR HIRE OS — PUBLIC BOOKING MODULE (Sprint 31)
// Bounded Context: Public Vehicle Discovery, Live Availability, Public Pricing,
// Guest Booking, Checkout & Payment Handoff (DEV-006, DEV-008, SEC-001)
// ============================================================================

import { Router } from "express";
import { PublicBookingService } from "./application/public-booking.service";
import { createPublicBookingController } from "./presentation/public-booking.controller";
import { HostResolutionService } from "../domains/application/host-resolution.service";
import { BookingService } from "../bookings/application/booking.service";
import { AvailabilityService } from "../availability/application/availability.service";
import { PricingService } from "../pricing/application/pricing.service";
import { PaymentService } from "../payments/application/payment.service";
import {
  VehicleRepository,
  VehicleCategoryRepository,
  CustomerRepository,
  BookingRepository,
  VehicleMediaRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";

export interface PublicBookingModuleOptions {
  hostResolver?: HostResolutionService;
  bookingService?: BookingService;
  availabilityService?: AvailabilityService;
  pricingService?: PricingService;
  paymentService?: PaymentService;
  vehicleRepo?: VehicleRepository;
}

export class PublicBookingModule {
  public readonly publicBookingService: PublicBookingService;
  public readonly router: Router;

  constructor(options: PublicBookingModuleOptions = {}) {
    const vehicleRepo = options.vehicleRepo || new VehicleRepository();
    const categoryRepo = new VehicleCategoryRepository();
    const customerRepo = new CustomerRepository();
    const bookingRepo = new BookingRepository();
    const mediaRepo = new VehicleMediaRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    const availabilityService =
      options.availabilityService || new AvailabilityService();
    const pricingService = options.pricingService || new PricingService();
    const bookingService =
      options.bookingService ||
      new BookingService(
        bookingRepo,
        pricingService,
        availabilityService,
        customerRepo,
        undefined,
        undefined,
        undefined,
        vehicleRepo,
        categoryRepo
      );

    this.publicBookingService = new PublicBookingService({
      vehicleRepo,
      categoryRepo,
      customerRepo,
      bookingRepo,
      mediaRepo,
      availabilityService,
      pricingService,
      bookingService,
      paymentService: options.paymentService,
      auditRepo,
      outboxRepo,
    });

    this.router = createPublicBookingController(
      this.publicBookingService,
      options.hostResolver
    );
  }
}
