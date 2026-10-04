// ============================================================================
// CAR HIRE OS — PUBLIC BOOKING CONTROLLER (Sprint 31)
// Resolves tenant context authoritatively via HostResolver
// Exposes Discovery, Availability, Quotes, Guest Checkout & Verification
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { PublicBookingService } from "../application/public-booking.service";
import { HostResolutionService } from "../../domains/application/host-resolution.service";
import { InMemoryTenantWebsiteRepository } from "@carhire/database";
import { z } from "zod";
import { PublicBookingError } from "../domain/public-booking.errors";

export function createPublicBookingController(
  publicBookingService: PublicBookingService,
  hostResolver?: HostResolutionService
): Router {
  const router = Router();

  // Helper to authoritatively resolve tenant context
  const resolveTenantId = async (req: Request): Promise<string> => {
    const siteSlug = typeof req.query.site === "string" ? req.query.site : undefined;
    if (siteSlug && /^[a-z0-9-]{2,80}$/.test(siteSlug)) {
      const site = await new InMemoryTenantWebsiteRepository().findBySubdomain(siteSlug);
      if (site?.status === "PUBLISHED" && !site.isMaintenanceMode) return site.tenantId;
      throw new PublicBookingError("Website is not published or is unavailable.", 404);
    }
    if (hostResolver) return (await hostResolver.resolve(req)).tenantId;
    throw new PublicBookingError("Unable to resolve a published website.", 404);
  };

  // 1. Discover Public Vehicles
  router.get("/vehicles", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = await resolveTenantId(req);
      const vehicles = await publicBookingService.getPublicVehicles(tenantId, {
        category: req.query.category as string,
        fuelType: req.query.fuelType as string,
        transmission: req.query.transmission as string,
        minSeats: req.query.minSeats ? parseInt(req.query.minSeats as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      });

      res.json({ success: true, data: vehicles });
    } catch (err) {
      next(err);
    }
  });

  // 2. Get Public Vehicle Details
  router.get("/vehicles/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = await resolveTenantId(req);
      const vehicle = await publicBookingService.getPublicVehicleDetails(tenantId, req.params.id);
      res.json({ success: true, data: vehicle });
    } catch (err) {
      next(err);
    }
  });

  // 3. Search Live Availability (Non-blocking)
  router.get("/availability", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = await resolveTenantId(req);
      const pickupAt = req.query.pickupAt as string;
      const returnAt = req.query.returnAt as string;

      if (!pickupAt || !returnAt) {
        return res.status(400).json({
          error: "pickupAt and returnAt query parameters (ISO 8601) are required for availability search.",
        });
      }

      const result = await publicBookingService.searchAvailability(tenantId, {
        pickupAt,
        returnAt,
        vehicleCategoryId: req.query.category as string,
        features: req.query.features ? (req.query.features as string).split(",") : undefined,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  // 4. Calculate Authoritative Public Quote
  router.post("/quote", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = await resolveTenantId(req);
      const { vehicleId, vehicleCategoryId, pickupAt, returnAt, promoCode, currency } = req.body;

      if (!pickupAt || !returnAt) {
        return res.status(400).json({ error: "pickupAt and returnAt are required." });
      }

      const quote = await publicBookingService.calculateQuote(tenantId, {
        vehicleId,
        vehicleCategoryId,
        pickupAt,
        returnAt,
        promoCode,
        currency,
      });

      res.json({ success: true, data: quote });
    } catch (err) {
      next(err);
    }
  });

  // 5. Submit Guest Checkout (Concurrency-Safe Reservation & Payment Handoff)
  router.post("/checkout", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = await resolveTenantId(req);
      const input = z.object({
        vehicleId: z.string().min(1).max(100), pickupAt: z.string().datetime(), returnAt: z.string().datetime(),
        pickupLocation: z.string().max(200).optional(), returnLocation: z.string().max(200).optional(),
        guest: z.object({fullName:z.string().trim().min(2).max(150),email:z.string().email().max(254),phone:z.string().min(7).max(30),
          idOrPassportNumber:z.string().min(3).max(80),licenseNumber:z.string().min(2).max(80),licenseExpiryDate:z.string().min(10).max(30)}),
        paymentMethod:z.enum(["PAY_LATER"]), idempotencyKey:z.string().min(16).max(100)
      }).safeParse(req.body);
      if (!input.success || Date.parse(input.data.returnAt) <= Date.parse(input.data.pickupAt) || Date.parse(input.data.pickupAt) < Date.now()) {
        return res.status(400).json({error:"Enter valid contact, licence and future booking dates."});
      }
      const voucher = await publicBookingService.checkout(tenantId, input.data);
      res.status(201).json({ success: true, data: voucher });
    } catch (err: any) {
      if (err instanceof PublicBookingError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      next(err);
    }
  });

  // 6. Get Public Booking Status / Voucher
  router.get("/status/:bookingId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = await resolveTenantId(req);
      const voucher = await publicBookingService.getBookingStatus(tenantId, req.params.bookingId);
      res.json({ success: true, data: voucher });
    } catch (err) {
      next(err);
    }
  });

  // 7. Customer booking account lookup. Booking reference + matching email
  // prevents exposing renter details through a bare public booking identifier.
  router.post("/account/booking", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId=await resolveTenantId(req);
      const parsed=z.object({
        bookingReference:z.string().trim().min(5).max(80),
        email:z.string().trim().email().max(254),
      }).safeParse(req.body);
      if(!parsed.success)return res.status(400).json({error:{message:"Enter your booking reference and the email used for the booking."}});
      const voucher=await publicBookingService.getBookingAccount(tenantId,parsed.data.bookingReference,parsed.data.email);
      res.json({success:true,data:voucher});
    } catch(err:any) {
      if(err instanceof PublicBookingError)return res.status(err.statusCode).json({error:{message:err.message}});
      next(err);
    }
  });

  // 8. Verify Payment & Confirm Booking
  router.post("/verify-payment/:attemptId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = await resolveTenantId(req);
      const result = await publicBookingService.verifyPaymentAndConfirmBooking(
        tenantId,
        req.params.attemptId
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof PublicBookingError) return res.status(err.statusCode).json({error: {message:err.message}});
    next(err);
  });
  return router;
}
