// ============================================================================
// CAR HIRE OS — BOOKING READER & HANDOVER READINESS SERVICE (DEV-006, BRS-001)
// Public Interface Foundation for Sprint 14 (Handover, Key Dispatch & Active Rental Execution)
// ============================================================================

import type { Booking, BookingReadinessForHandoverDto } from "@carhire/types";
import {
  IBookingRepository,
  BookingRepository,
  ICustomerRepository,
  CustomerRepository,
  IDriverRepository,
  DriverRepository,
  IVehicleRepository,
  VehicleRepository,
  IVehicleAllocationRepository,
  VehicleAllocationRepository,
  BookingNotFoundError,
} from "@carhire/database";

export class BookingReaderService {
  private readonly bookingRepo: IBookingRepository;
  private readonly customerRepo: ICustomerRepository;
  private readonly driverRepo: IDriverRepository;
  private readonly vehicleRepo: IVehicleRepository;
  private readonly allocationRepo: IVehicleAllocationRepository;

  constructor(
    bookingRepo?: IBookingRepository,
    customerRepo?: ICustomerRepository,
    driverRepo?: IDriverRepository,
    vehicleRepo?: IVehicleRepository,
    allocationRepo?: IVehicleAllocationRepository
  ) {
    this.bookingRepo = bookingRepo || new BookingRepository();
    this.customerRepo = customerRepo || new CustomerRepository();
    this.driverRepo = driverRepo || new DriverRepository();
    this.vehicleRepo = vehicleRepo || new VehicleRepository();
    this.allocationRepo = allocationRepo || new VehicleAllocationRepository();
  }

  /**
   * Evaluates comprehensive handover readiness for transitioning Booking -> Rental in Sprint 14
   */
  async evaluateHandoverReadiness(
    tenantId: string,
    bookingId: string
  ): Promise<BookingReadinessForHandoverDto> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. Status Check
    if (booking.status !== "CONFIRMED") {
      blockers.push(`Booking is in '${booking.status}' status. Only CONFIRMED bookings can be handed over to start a rental.`);
    }

    // 2. Customer Eligibility
    let customerEligible = false;
    const customer = await this.customerRepo.findById(booking.customerId, tenantId);
    if (!customer) {
      blockers.push(`Customer '${booking.customerId}' not found.`);
    } else if (customer.status === "BLOCKED") {
      blockers.push(`Customer '${customer.fullName}' is in BLOCKED status.`);
    } else {
      customerEligible = true;
    }

    // 3. Driver Eligibility
    let driverEligible = false;
    const driverId = booking.primaryDriverId;
    if (!driverId) {
      warnings.push("No primary driver designated. Booking customer will be assumed primary driver.");
      driverEligible = customerEligible;
    } else {
      const driver = await this.driverRepo.findById(driverId, tenantId);
      if (!driver) {
        blockers.push(`Assigned driver '${driverId}' not found.`);
      } else if (driver.status === "BLACKLISTED" || (driver.status as any) === "SUSPENDED" || (driver.status as any) === "DISQUALIFIED") {
        blockers.push(`Assigned driver '${driver.fullName}' is ${driver.status}.`);
      } else {
        driverEligible = true;
      }
    }

    // 4. Vehicle Operability
    let vehicleOperable = false;
    const vehicleId = booking.assignedVehicleId;
    if (!vehicleId) {
      blockers.push("No vehicle assigned to booking reservation.");
    } else {
      const vehicle = await this.vehicleRepo.findById(vehicleId, tenantId);
      if (!vehicle) {
        blockers.push(`Assigned vehicle '${vehicleId}' not found.`);
      } else if (
        vehicle.lifecycleStatus === "RETIRED" ||
        vehicle.lifecycleStatus === "SOLD" ||
        (vehicle.lifecycleStatus as any) === "DECOMMISSIONED"
      ) {
        blockers.push(`Assigned vehicle (${vehicle.registrationPlate}) is ${vehicle.lifecycleStatus}.`);
      } else {
        vehicleOperable = true;
      }
    }

    // 5. Deposit & Payment
    let depositSecured = false;
    if (booking.depositStatus === "HELD") {
      depositSecured = true;
    } else if (booking.depositRequired === 0 || booking.depositStatus === "NOT_REQUIRED") {
      depositSecured = true;
    } else {
      warnings.push(`Security deposit (${booking.currency} ${booking.depositRequired}) is in '${booking.depositStatus}' status.`);
    }

    // 6. Allocation Active
    let allocationActive = false;
    if (booking.allocationId) {
      const allocation = await this.allocationRepo.findById(booking.allocationId, tenantId);
      if (allocation && (allocation.status === "ACTIVE" || allocation.status === "CONFIRMED")) {
        allocationActive = true;
      } else {
        blockers.push("Vehicle allocation record is inactive or missing.");
      }
    } else {
      blockers.push("No active vehicle allocation linked to this booking.");
    }

    const isReady = blockers.length === 0;

    return {
      isReady,
      blockers,
      warnings,
      booking,
      customerEligible,
      driverEligible,
      vehicleOperable,
      depositSecured,
      allocationActive,
    };
  }

  /**
   * Retrieves authoritative confirmed booking for rental dispatch
   */
  async getConfirmedBookingForRental(
    tenantId: string,
    bookingId: string
  ): Promise<Booking> {
    const readiness = await this.evaluateHandoverReadiness(tenantId, bookingId);
    if (!readiness.isReady) {
      throw new Error(`Booking #${readiness.booking.bookingNumber} is not ready for handover: ${readiness.blockers.join("; ")}`);
    }
    return readiness.booking;
  }
}
