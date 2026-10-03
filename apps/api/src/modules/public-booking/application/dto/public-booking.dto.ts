// ============================================================================
// CAR HIRE OS — PUBLIC BOOKING DATA TRANSFER OBJECTS (Sprint 31: DEV-006, DEV-008)
// ============================================================================

export interface PublicVehicleFilterDto {
  category?: string;
  fuelType?: string;
  transmission?: string;
  minSeats?: number;
  limit?: number;
  offset?: number;
}

export interface PublicAvailabilityQueryDto {
  pickupAt: string;
  returnAt: string;
  vehicleCategoryId?: string;
  pickupBranchId?: string;
  returnBranchId?: string;
  features?: string[];
}

export interface PublicQuoteRequestDto {
  vehicleId?: string;
  vehicleCategoryId?: string;
  pickupAt: string;
  returnAt: string;
  promoCode?: string;
  currency?: string;
  requestedAddOns?: Array<{ code: string; quantity?: number }>;
}

export interface PublicGuestCustomerDto {
  fullName: string;
  email: string;
  phone: string;
  idOrPassportNumber: string;
  licenseNumber?: string;
  licenseExpiryDate?: string;
}

export interface PublicCheckoutRequestDto {
  vehicleId: string;
  pickupAt: string;
  returnAt: string;
  pickupLocation?: string;
  returnLocation?: string;
  promoCode?: string;
  guest: PublicGuestCustomerDto;
  paymentMethod: "MPESA" | "CARD" | "PAY_LATER";
  paymentDetails?: {
    mpesaPhoneNumber?: string;
    returnUrl?: string;
    cancelUrl?: string;
  };
  idempotencyKey?: string;
}

export interface PublicVehicleSummaryDto {
  id: string;
  make: string;
  model: string;
  year: number;
  category: string;
  categoryName?: string;
  transmission: string;
  fuelType: string;
  seatingCapacity: number;
  luggageCapacity?: number;
  features: string[];
  dailyRate: number;
  currency: string;
  images: string[];
  primaryImageUrl?: string;
  isAvailableNow: boolean;
}

export interface PublicBookingVoucherDto {
  bookingId: string;
  bookingReference: string;
  status: string;
  source: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    category: string;
    image?: string;
  };
  customer: {
    fullName: string;
    email: string;
    phone: string;
  };
  schedule: {
    pickupAt: string;
    returnAt: string;
    durationDays: number;
    pickupLocation?: string;
    returnLocation?: string;
  };
  pricing: {
    currency: string;
    subtotal: number;
    taxAmount: number;
    depositAmount: number;
    discountAmount: number;
    grossTotal: number;
    isPaid: boolean;
  };
  payment?: {
    attemptId?: string;
    status: string;
    provider?: string;
    checkoutUrl?: string;
    instructions?: string;
  };
  createdAt: string;
}
