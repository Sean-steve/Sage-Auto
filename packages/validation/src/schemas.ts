import { z } from "zod";

export const CreateVehicleSchema = z.object({
  registrationPlate: z.string().min(2, "Registration plate is required").toUpperCase(),
  make: z.string().min(1, "Vehicle make is required"),
  model: z.string().min(1, "Vehicle model is required"),
  year: z.number().min(1990).max(new Date().getFullYear() + 1),
  category: z.enum(["SUV", "Sedan", "4x4 Offroad", "Luxury", "Hatchback", "Van/Bus"]),
  color: z.string().min(1, "Color is required"),
  vin: z.string().min(6, "Valid VIN or chassis number is required"),
  odometer: z.number().nonnegative(),
  dailyRate: z.number().positive("Daily rate must be greater than zero"),
  transmission: z.enum(["Automatic", "Manual"]),
  seats: z.number().int().min(1).max(60),
  fuelType: z.enum(["Petrol", "Diesel", "Hybrid", "Electric"]),
  ownerId: z.string().min(1, "Owner assignment is required"),
  currentLocation: z.string().default("Main Depot"),
  features: z.array(z.string()).default([]),
  isPublishedToWebsite: z.boolean().default(true),
});

export const CreateCustomerSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().min(8, "Valid phone number required"),
  idOrPassportNumber: z.string().min(4, "National ID or Passport number is required"),
  licenseNumber: z.string().min(4, "Driver's license number is required"),
  licenseExpiryDate: z.string().min(1, "License expiry date is required"),
  address: z.string().default("Nairobi"),
  city: z.string().default("Nairobi"),
  country: z.string().default("Kenya"),
});

export const CreateBookingSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle selection is required"),
  customerId: z.string().min(1, "Customer selection is required"),
  driverId: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  pickupLocation: z.string().default("Nairobi HQ"),
  returnLocation: z.string().default("Nairobi HQ"),
  source: z.enum(["WALK_IN", "PHONE", "PUBLIC_WEBSITE", "AGENT_REFERRAL", "CORPORATE"]).default("WALK_IN"),
});

export const CreateRentalDispatchSchema = z.object({
  bookingId: z.string().min(1, "Booking ID is required"),
  checkoutOdometer: z.number().nonnegative(),
  checkoutFuelLevel: z.number().min(0).max(100),
  inspectorName: z.string().min(2, "Inspector name is required"),
});

export const CreateInspectionSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  rentalId: z.string().optional(),
  type: z.enum(["HANDOVER", "RETURN", "ROUTINE_AUDIT"]),
  inspectorName: z.string().min(1, "Inspector name is required"),
  customerName: z.string().min(1, "Customer name is required"),
  odometer: z.number().nonnegative(),
  fuelLevel: z.number().min(0).max(100),
});

export const MpesaStkPushSchema = z.object({
  phoneNumber: z.string().min(9, "Valid Kenyan mobile number (07... or 254...) required"),
  amount: z.number().positive("Payment amount must be greater than zero"),
  obligationId: z.string().min(1, "Invoice or booking obligation is required"),
  description: z.string().default("Car Hire Reservation Payment"),
});

// ----------------------------------------------------------------------------
// SPRINT 3: IDENTITY & AUTHENTICATION VALIDATION SCHEMAS
// ----------------------------------------------------------------------------
export const RegisterUserSchema = z.object({
  email: z.string().trim().email("Valid email address is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(128, "Password must not exceed 128 characters"),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
  phone: z.string().trim().optional(),
});

export const LoginSchema = z.object({
  email: z.string().trim().email("Valid email address is required"),
  password: z.string().min(1, "Password is required"),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(16, "Valid refresh token is required"),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().optional(),
  allSessions: z.boolean().optional().default(false),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email("Valid email address is required"),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(16, "Valid reset token is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters long")
    .max(128, "New password must not exceed 128 characters"),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(16, "Valid verification token is required"),
});

export const ResendVerificationSchema = z.object({
  email: z.string().trim().email("Valid email address is required"),
});

export type CreateVehicleDto = z.infer<typeof CreateVehicleSchema>;
export type CreateCustomerDto = z.infer<typeof CreateCustomerSchema>;
export type CreateBookingDto = z.infer<typeof CreateBookingSchema>;
export type CreateRentalDispatchDto = z.infer<typeof CreateRentalDispatchSchema>;
export type CreateInspectionDto = z.infer<typeof CreateInspectionSchema>;
export type MpesaStkPushDto = z.infer<typeof MpesaStkPushSchema>;

export type RegisterUserDto = z.infer<typeof RegisterUserSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
export type LogoutDto = z.infer<typeof LogoutSchema>;
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;
export type ResendVerificationDto = z.infer<typeof ResendVerificationSchema>;

// ----------------------------------------------------------------------------
// SPRINT 25: CANONICAL DOMAIN EVENT ENVELOPE VALIDATION SCHEMA
// ----------------------------------------------------------------------------
export const EventActorSchema = z.object({
  type: z.enum(["USER", "SYSTEM", "API_CLIENT", "SUPPORT", "ANONYMOUS"]),
  id: z.string().optional(),
  supportActorId: z.string().optional(),
  impersonatorId: z.string().optional(),
});

export const EventAggregateSchema = z.object({
  type: z.string().min(1, "Aggregate type is required"),
  id: z.string().min(1, "Aggregate id is required"),
  version: z.number().int().nonnegative().optional(),
});

export const EventEnvelopeSchema = z.object({
  eventId: z.string().uuid("Event ID must be a valid UUIDv4"),
  eventType: z.string().min(3, "Event type must be at least 3 characters"),
  eventVersion: z.number().int().min(1, "Event version must be integer >= 1"),
  occurredAt: z.string().datetime("occurredAt must be a valid ISO-8601 UTC timestamp"),
  tenantId: z.string().uuid().nullable().optional(),
  source: z.string().min(1, "Event source is required"),
  correlationId: z.string().uuid("correlationId must be a valid UUID"),
  causationId: z.string().nullable().optional(),
  aggregate: EventAggregateSchema,
  actor: EventActorSchema,
  data: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type EventActorDto = z.infer<typeof EventActorSchema>;
export type EventAggregateDto = z.infer<typeof EventAggregateSchema>;
export type EventEnvelopeDto = z.infer<typeof EventEnvelopeSchema>;


