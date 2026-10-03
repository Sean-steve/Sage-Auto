// ============================================================================
// CAR HIRE OS — GENERAL LEDGER CONTROLLER (Sprint 20: DOM-003 §35-40)
// REST API Presentation Layer for Chart of Accounts, Journals, Posting & Reports
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { LedgerService, LedgerActor } from "../application/ledger.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";

export function createLedgerController(
  ledgerService: LedgerService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActor = (req: Request): LedgerActor => {
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
      email: user?.email,
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
  // CHART OF ACCOUNTS
  // --------------------------------------------------------------------------

  // List accounts
  router.get(
    "/accounts",
    guard(TENANT_PERMISSIONS.LEDGER_ACCOUNT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const filter = {
          classification: req.query.classification as any,
          status: req.query.status as any,
          search: req.query.search as string,
        };
        const accounts = await ledgerService.listAccounts(tenantId, filter);
        res.json({ success: true, data: accounts });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create custom account
  router.post(
    "/accounts",
    guard(TENANT_PERMISSIONS.LEDGER_ACCOUNT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const account = await ledgerService.createAccount(tenantId, req.body, actor);
        res.status(201).json({ success: true, data: account });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get account details
  router.get(
    "/accounts/:id",
    guard(TENANT_PERMISSIONS.LEDGER_ACCOUNT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const account = await ledgerService.getAccount(tenantId, req.params.id);
        res.json({ success: true, data: account });
      } catch (err) {
        next(err);
      }
    }
  );

  // Update account
  router.patch(
    "/accounts/:id",
    guard(TENANT_PERMISSIONS.LEDGER_ACCOUNT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const updated = await ledgerService.updateAccount(tenantId, req.params.id, req.body, actor);
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // JOURNAL TRANSACTIONS & POSTING
  // --------------------------------------------------------------------------

  // List journal transactions
  router.get(
    "/journals",
    guard(TENANT_PERMISSIONS.LEDGER_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const filter = {
          sourceType: req.query.sourceType as any,
          status: req.query.status as any,
          startDate: req.query.startDate as string,
          endDate: req.query.endDate as string,
          search: req.query.search as string,
        };
        const journals = await ledgerService.listJournals(tenantId, filter);
        res.json({ success: true, data: journals });
      } catch (err) {
        next(err);
      }
    }
  );

  // Post manual journal
  router.post(
    "/journals",
    guard(TENANT_PERMISSIONS.LEDGER_JOURNAL_POST),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const journal = await ledgerService.postJournal(tenantId, req.body, actor);
        res.status(201).json({ success: true, data: journal });
      } catch (err) {
        next(err);
      }
    }
  );

  // Post from financial source contract
  router.post(
    "/post-source",
    guard(TENANT_PERMISSIONS.LEDGER_JOURNAL_POST),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const journal = await ledgerService.postFromSourceContract(tenantId, req.body, actor);
        res.status(201).json({ success: true, data: journal });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get journal by ID
  router.get(
    "/journals/:id",
    guard(TENANT_PERMISSIONS.LEDGER_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const journal = await ledgerService.getJournal(tenantId, req.params.id);
        res.json({ success: true, data: journal });
      } catch (err) {
        next(err);
      }
    }
  );

  // Reverse journal transaction
  router.post(
    "/journals/:id/reverse",
    guard(TENANT_PERMISSIONS.LEDGER_JOURNAL_REVERSE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const reason = req.body?.reason || "Operational reversal requested";
        const reversal = await ledgerService.reverseJournal(tenantId, req.params.id, actor, reason);
        res.json({ success: true, data: reversal });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // FINANCIAL REPORTS & LEDGER STATEMENTS
  // --------------------------------------------------------------------------

  // Get Trial Balance
  router.get(
    "/trial-balance",
    guard(TENANT_PERMISSIONS.LEDGER_TRIAL_BALANCE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const asOfDate = req.query.asOfDate as string;
        const report = await ledgerService.getTrialBalance(tenantId, asOfDate);
        res.json({ success: true, data: report });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get General Ledger Account Statement
  router.get(
    "/statements/:accountId",
    guard(TENANT_PERMISSIONS.LEDGER_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query = {
          accountId: req.params.accountId,
          startDate: req.query.startDate as string,
          endDate: req.query.endDate as string,
          vehicleId: req.query.vehicleId as string,
          customerId: req.query.customerId as string,
        };
        const statement = await ledgerService.getGeneralLedgerStatement(tenantId, req.params.accountId, query);
        res.json({ success: true, data: statement });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
