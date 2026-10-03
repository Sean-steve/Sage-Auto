// ============================================================================
// CAR HIRE OS — BOOKINGS MODULE (DOM-003 §14-16, DEV-006, DEV-007, BRS-001)
// Bounded Context: Bookings & Reservations
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  BookingRepository,
  CustomerRepository,
  CorporateAccountRepository,
  DriverRepository,
  AgentRepository,
  VehicleRepository,
  VehicleCategoryRepository,
  SubscriptionRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
  VehicleAllocationRepository,
} from "@carhire/database";
import { BookingService } from "./application/booking.service";
import { BookingReaderService } from "./application/booking-reader.service";
import { createBookingController } from "./presentation/booking.controller";
import { PricingService } from "../pricing/application/pricing.service";
import { AvailabilityService } from "../availability/application/availability.service";

export class BookingsModule {
  public readonly bookingService: BookingService;
  public readonly readerService: BookingReaderService;
  public readonly router: Router;

  constructor(
    pricingService?: PricingService,
    availabilityService?: AvailabilityService,
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const bookingRepo = new BookingRepository();
    const customerRepo = new CustomerRepository();
    const corporateRepo = new CorporateAccountRepository();
    const driverRepo = new DriverRepository();
    const agentRepo = new AgentRepository();
    const vehicleRepo = new VehicleRepository();
    const categoryRepo = new VehicleCategoryRepository();
    const subRepo = new SubscriptionRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();
    const idempotencyRepo = new IdempotencyRepository();
    const allocationRepo = new VehicleAllocationRepository();

    this.bookingService = new BookingService(
      bookingRepo,
      pricingService,
      availabilityService,
      customerRepo,
      corporateRepo,
      driverRepo,
      agentRepo,
      vehicleRepo,
      categoryRepo,
      subRepo,
      auditRepo,
      outboxRepo,
      idempotencyRepo
    );

    this.readerService = new BookingReaderService(
      bookingRepo,
      customerRepo,
      driverRepo,
      vehicleRepo,
      allocationRepo
    );

    this.router = createBookingController(
      this.bookingService,
      this.readerService,
      permissionGuard
    );
  }
}
