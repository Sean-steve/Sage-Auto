// ============================================================================
// CAR HIRE OS — BOOKING PRESENTATION CONTROLLER (DEV-007, BRS-001)
// Bounded Context: Bookings & Reservations
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { BookingService, BookingActor } from "../application/booking.service";
import { BookingReaderService } from "../application/booking-reader.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import {
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
} from "@carhire/types";

export function createBookingController(
  bookingService: BookingService,
  readerService: BookingReaderService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = (perm: string) => permissionGuard ? permissionGuard(perm) : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActor = (req: Request): BookingActor => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const userId = auth?.userId || user?.id || user?.sub;
    if (!userId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return {
      userId,
      actorType: "USER",
      name: user?.fullName || user?.name,
    };
  };

  const getTenantId = (req: Request): string => {
    const ctx = (req as any).tenantContext;
    const tenantId = ctx?.tenantId;
    if (!tenantId) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tenantId;
  };

  // --------------------------------------------------------------------------
  // Quote Preview (Stateless)
  // --------------------------------------------------------------------------
  router.post(
    "/quote",
    guard(TENANT_PERMISSIONS.BOOKING_READ || "booking.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto = req.body as CalculateBookingQuoteDto;
        const result = await bookingService.calculateQuote(tenantId, dto);
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Create Booking
  // --------------------------------------------------------------------------
  router.post(
    "/",
    guard(TENANT_PERMISSIONS.BOOKING_CREATE || "booking.create"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const dto = req.body as CreateBookingDto;
        const booking = await bookingService.createBooking(tenantId, dto, actor);
        res.status(201).json({ success: true, data: booking });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // List Bookings
  // --------------------------------------------------------------------------
  router.get(
    "/",
    guard(TENANT_PERMISSIONS.BOOKING_READ || "booking.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query: BookingListQueryDto = {
          status: req.query.status as any,
          customerId: req.query.customerId as string,
          corporateAccountId: req.query.corporateAccountId as string,
          vehicleId: req.query.vehicleId as string,
          driverId: req.query.driverId as string,
          agentId: req.query.agentId as string,
          source: req.query.source as any,
          pickupFrom: req.query.pickupFrom as string,
          pickupTo: req.query.pickupTo as string,
          returnFrom: req.query.returnFrom as string,
          returnTo: req.query.returnTo as string,
          search: req.query.search as string,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
          sortBy: req.query.sortBy as any,
          sortOrder: req.query.sortOrder as any,
        };

        const result = await bookingService.listBookings(tenantId, query);
        res.json({ success: true, data: result.items, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Get Booking by ID
  // --------------------------------------------------------------------------
  router.get(
    "/:id",
    guard(TENANT_PERMISSIONS.BOOKING_READ || "booking.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const booking = await bookingService.getBooking(tenantId, req.params.id);
        res.json({ success: true, data: booking });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Update Draft Booking
  // --------------------------------------------------------------------------
  router.patch(
    "/:id",
    guard(TENANT_PERMISSIONS.BOOKING_UPDATE || "booking.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const dto = req.body as UpdateDraftBookingDto;
        const updated = await bookingService.updateDraft(tenantId, req.params.id, dto, actor);
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Formal Quote Generation
  // --------------------------------------------------------------------------
  router.post(
    "/:id/quote",
    guard(TENANT_PERMISSIONS.BOOKING_UPDATE || "booking.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const dto = req.body as QuoteBookingDto;
        const quoted = await bookingService.quoteBooking(tenantId, req.params.id, dto, actor);
        res.json({ success: true, data: quoted });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Request Payment
  // --------------------------------------------------------------------------
  router.post(
    "/:id/request-payment",
    guard(TENANT_PERMISSIONS.BOOKING_UPDATE || "booking.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const booking = await bookingService.requestPayment(tenantId, req.params.id, actor);
        res.json({ success: true, data: booking });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Confirm Booking
  // --------------------------------------------------------------------------
  router.post(
    "/:id/confirm",
    guard(TENANT_PERMISSIONS.BOOKING_CONFIRM || "booking.confirm"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const dto = req.body as ConfirmBookingDto;
        const confirmed = await bookingService.confirmBooking(tenantId, req.params.id, dto, actor);
        res.json({ success: true, data: confirmed });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Cancel Booking
  // --------------------------------------------------------------------------
  router.post(
    "/:id/cancel",
    guard(TENANT_PERMISSIONS.BOOKING_CANCEL || "booking.cancel"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const dto = req.body as CancelBookingDto;
        const cancelled = await bookingService.cancelBooking(tenantId, req.params.id, dto, actor);
        res.json({ success: true, data: cancelled });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Reject Booking
  // --------------------------------------------------------------------------
  router.post(
    "/:id/reject",
    guard(TENANT_PERMISSIONS.BOOKING_UPDATE || "booking.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const dto = req.body as RejectBookingDto;
        const rejected = await bookingService.rejectBooking(tenantId, req.params.id, dto, actor);
        res.json({ success: true, data: rejected });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Expire Booking
  // --------------------------------------------------------------------------
  router.post(
    "/:id/expire",
    guard(TENANT_PERMISSIONS.BOOKING_UPDATE || "booking.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const dto = req.body as ExpireBookingDto;
        const expired = await bookingService.expireBooking(tenantId, req.params.id, dto, actor);
        res.json({ success: true, data: expired });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Mark No-Show
  // --------------------------------------------------------------------------
  router.post(
    "/:id/no-show",
    guard(TENANT_PERMISSIONS.BOOKING_UPDATE || "booking.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const dto = req.body as NoShowBookingDto;
        const noShow = await bookingService.markNoShow(tenantId, req.params.id, dto, actor);
        res.json({ success: true, data: noShow });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Substitute Vehicle
  // --------------------------------------------------------------------------
  router.post(
    "/:id/substitute-vehicle",
    guard(TENANT_PERMISSIONS.BOOKING_SUBSTITUTE_VEHICLE || "booking.substitute_vehicle"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const dto = req.body as SubstituteBookingVehicleDto;
        const substituted = await bookingService.substituteVehicle(tenantId, req.params.id, dto, actor);
        res.json({ success: true, data: substituted });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Amend Dates
  // --------------------------------------------------------------------------
  router.post(
    "/:id/amend-dates",
    guard(TENANT_PERMISSIONS.BOOKING_UPDATE || "booking.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const dto = req.body as AmendBookingDatesDto;
        const amended = await bookingService.amendDates(tenantId, req.params.id, dto, actor);
        res.json({ success: true, data: amended });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Handover Readiness (Sprint 14 Foundation)
  // --------------------------------------------------------------------------
  router.get(
    "/:id/handover-readiness",
    guard(TENANT_PERMISSIONS.BOOKING_READ || "booking.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const readiness = await readerService.evaluateHandoverReadiness(tenantId, req.params.id);
        res.json({ success: true, data: readiness });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
