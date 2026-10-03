// ============================================================================
// CAR HIRE OS — CRM PUBLIC STOREFRONT CONTROLLER (Sprint 33)
// ============================================================================

import { Request, Response } from "express";
import { LeadService } from "../application/lead.service";
import { SalesQuoteService } from "../application/sales-quote.service";
import { HostResolutionService } from "../../domains/application/host-resolution.service";

export function createCrmPublicController(
  leadService: LeadService,
  quoteService: SalesQuoteService,
  hostResolver?: HostResolutionService
) {
  return {
    async submitEnquiry(req: Request, res: Response): Promise<void> {
      try {
        let tenantId = req.body.tenantId;

        if (!tenantId && hostResolver) {
          const host = (req.headers["x-forwarded-host"] || req.headers.host || "") as string;
          if (host) {
            try {
              const resolution = await hostResolver.resolve(host);
              tenantId = resolution.tenantId;
            } catch {
              // fallback to body if resolution fails
            }
          }
        }

        const lead = await leadService.handlePublicEnquiry({
          ...req.body,
          tenantId,
        });

        res.status(201).json({
          status: "RECEIVED",
          leadNumber: lead.leadNumber,
          message: "Thank you for reaching out. We have received your inquiry and will be in touch shortly.",
        });
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    async getPublicQuote(req: Request, res: Response): Promise<void> {
      try {
        const { token } = req.params;
        const quote = await quoteService.getQuoteByPublicToken(token);
        // Record that the customer opened the quote
        await quoteService.recordQuoteViewed(token);
        const versions = await quoteService.getVersions(quote.tenantId, quote.id);

        res.json({
          quoteNumber: quote.quoteNumber,
          status: quote.status,
          currency: quote.currency,
          pickupDate: quote.pickupDate,
          returnDate: quote.returnDate,
          pickupLocation: quote.pickupLocation,
          returnLocation: quote.returnLocation,
          validUntil: quote.validUntil,
          subtotal: quote.subtotal,
          taxTotal: quote.taxTotal,
          discountTotal: quote.discountTotal,
          depositTotal: quote.depositTotal,
          grandTotal: quote.grandTotal,
          requiredDepositAmount: quote.requiredDepositAmount,
          customerNotes: quote.customerNotes,
          paymentTerms: quote.paymentTerms,
          versions,
        });
      } catch (err: any) {
        res.status(404).json({ error: { message: err.message } });
      }
    },

    async acceptPublicQuote(req: Request, res: Response): Promise<void> {
      try {
        const { token } = req.params;
        const quote = await quoteService.acceptQuote({ publicToken: token }, "customer_web");
        res.json({
          status: quote.status,
          quoteNumber: quote.quoteNumber,
          message: "Quote accepted successfully. Our team will contact you with booking confirmation and deposit instructions.",
        });
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    async rejectPublicQuote(req: Request, res: Response): Promise<void> {
      try {
        const { token } = req.params;
        const quote = await quoteService.rejectQuote(
          { publicToken: token },
          req.body.reason,
          "customer_web"
        );
        res.json({
          status: quote.status,
          quoteNumber: quote.quoteNumber,
          message: "Quote decline noted. Thank you for your feedback.",
        });
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },
  };
}
