// ============================================================================
// CAR HIRE OS — TEST HARNESS: CANONICAL TEST FACTORIES & FIXTURES
// Generates schema-compliant, isolated domain entity fixtures for tests.
// ============================================================================

import { defaultIdGen } from "./ids";
import { defaultTestClock } from "./clock";
import type {
  Tenant,
  User,
  Vehicle,
  Customer,
  CorporateAccount,
  Booking,
  RentalContract,
  Rental,
  VehicleInspection,
  OperationalInvoice,
  Payment,
  Subscription,
  LeadRecord,
  SalesQuoteRecord,
} from "@carhire/types";

export class TestFixtures {
  private idGen = defaultIdGen;
  private clock = defaultTestClock;

  public buildTenant(overrides: Partial<Tenant> = {}): Omit<Tenant, "createdAt" | "updatedAt"> & { id: string } {
    const slug = overrides.slug || `tenant-${this.idGen.next("slug").slice(0, 8)}`;
    return {
      id: overrides.id || this.idGen.tenant(slug),
      name: overrides.name || `Tenant ${slug.toUpperCase()}`,
      slug,
      status: overrides.status || "ACTIVE",
      planId: overrides.planId || "plan-enterprise",
      currency: overrides.currency || "KES",
      ...overrides,
    };
  }

  public buildUser(overrides: Partial<User> = {}): Omit<User, "createdAt" | "updatedAt"> & { id: string } {
    const id = overrides.id || this.idGen.user(`user-${Math.random()}`);
    return {
      id,
      email: overrides.email || `user-${id.slice(0, 8)}@example.com`,
      passwordHash: overrides.passwordHash || "$scrypt$N=16384,r=8,p=1$synthetic_test_hash",
      fullName: overrides.fullName || "Jane Doe",
      isPlatformStaff: overrides.isPlatformStaff ?? false,
      status: overrides.status || "ACTIVE",
      emailVerified: overrides.emailVerified ?? true,
      ...overrides,
    };
  }

  public buildVehicle(tenantId: string, overrides: Partial<Vehicle> = {}): Omit<Vehicle, "id" | "createdAt" | "updatedAt"> {
    const plate = overrides.registrationPlate || `KDA-${Math.floor(100 + Math.random() * 899)}Z`;
    return {
      tenantId,
      registrationPlate: plate,
      vin: overrides.vin || `VIN${plate.replace("-", "")}99999`,
      make: overrides.make || "Toyota",
      model: overrides.model || "RAV4",
      year: overrides.year || 2024,
      category: (overrides.category || "SUV") as any,
      transmission: (overrides.transmission || "AUTOMATIC") as any,
      fuelType: (overrides.fuelType || "PETROL") as any,
      seats: overrides.seats || 5,
      odometer: overrides.odometer || 15000,
      fuelLevel: overrides.fuelLevel || 100,
      lifecycleStatus: overrides.lifecycleStatus || "ACTIVE",
      availabilityStatus: overrides.availabilityStatus || "AVAILABLE",
      dailyRate: overrides.dailyRate || 6500,
      features: overrides.features || ["Air Conditioning", "Bluetooth"],
      imageUrl: overrides.imageUrl || "https://images.unsplash.com/photo-1549399542-7e3f8b79c341",
      ...overrides,
    };
  }

  public buildCustomer(tenantId: string, overrides: Partial<Customer> = {}): Omit<Customer, "id" | "createdAt" | "updatedAt"> {
    return {
      tenantId,
      customerNumber: overrides.customerNumber || `CUS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerType: overrides.customerType || "INDIVIDUAL",
      fullName: overrides.fullName || "Alice Smith",
      email: overrides.email || `customer-${Math.random().toString(36).slice(2, 8)}@example.com`,
      phone: overrides.phone || "+254711000001",
      idOrPassportNumber: overrides.idOrPassportNumber || "ID12345678",
      licenseNumber: overrides.licenseNumber || "DL987654321",
      licenseExpiryDate: overrides.licenseExpiryDate || "2028-12-31",
      address: overrides.address || "123 Nairobi Expressway, Nairobi",
      status: overrides.status || "ACTIVE",
      verificationStatus: overrides.verificationStatus || "VERIFIED",
      totalRentalsCount: overrides.totalRentalsCount || 0,
      version: overrides.version || 1,
      ...overrides,
    };
  }

  public buildBooking(
    tenantId: string,
    customerId: string,
    vehicleId: string,
    overrides: Partial<Booking> = {}
  ): Omit<Booking, "id" | "createdAt" | "updatedAt"> {
    return {
      tenantId,
      customerId,
      assignedVehicleId: vehicleId,
      bookingNumber: overrides.bookingNumber || `BK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: overrides.status || "CONFIRMED",
      pickupAt: overrides.pickupAt || "2026-10-01T09:00:00.000Z",
      returnAt: overrides.returnAt || "2026-10-05T18:00:00.000Z",
      pickupLocationName: overrides.pickupLocationName || "Nairobi CBD Hub",
      returnLocationName: overrides.returnLocationName || "Nairobi CBD Hub",
      netRentalSubtotal: overrides.netRentalSubtotal || 26000,
      taxAmount: overrides.taxAmount || 4160,
      grossTotal: overrides.grossTotal || 30160,
      depositRequired: overrides.depositRequired || 15000,
      currency: overrides.currency || "KES",
      paymentStatus: overrides.paymentStatus || "UNPAID",
      version: overrides.version || 1,
      statusHistory: overrides.statusHistory || [],
      ...overrides,
    };
  }
}

export const defaultFixtures = new TestFixtures();
