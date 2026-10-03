// ============================================================================
// CAR HIRE OS — PLATFORM BACKFILL SERVICE (Sprint 35: DOM-003, DEV-004)
// Idempotent historical backfill & replay of platform SaaS snapshots and movements
// ============================================================================

import type { PlatformDailySnapshotRecord } from "@carhire/types";
import { PlatformProjectionService } from "./platform-projection.service";
import { PlatformCohortService } from "./platform-cohort.service";

export interface PlatformBackfillServiceDeps {
  projectionService?: PlatformProjectionService;
  cohortService?: PlatformCohortService;
  snapshotRepo?: any;
}

export class PlatformBackfillService {
  private projectionService: PlatformProjectionService;
  private cohortService: PlatformCohortService;

  constructor(
    depsOrProjectionService?: PlatformBackfillServiceDeps | PlatformProjectionService,
    cohortService?: PlatformCohortService
  ) {
    if (depsOrProjectionService && typeof (depsOrProjectionService as any).generateDailySnapshot !== "function") {
      const deps = depsOrProjectionService as PlatformBackfillServiceDeps;
      this.projectionService = deps.projectionService || new PlatformProjectionService();
      this.cohortService = deps.cohortService || new PlatformCohortService();
    } else {
      this.projectionService = (depsOrProjectionService as PlatformProjectionService) || new PlatformProjectionService();
      this.cohortService = cohortService || new PlatformCohortService();
    }
  }

  /**
   * Backfills a date range of snapshots between fromDate and toDate (inclusive).
   */
  async runBackfill(
    fromDate: string,
    toDate: string,
    currency = "KES"
  ): Promise<{ daysProcessed: number; snapshotsCreated: number; snapshots: PlatformDailySnapshotRecord[] }> {
    const snapshots: PlatformDailySnapshotRecord[] = [];
    const start = new Date(fromDate);
    const end = new Date(toDate);

    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const snapshot = await this.projectionService.generateDailySnapshot(dateStr, currency);
      snapshots.push(snapshot);
      current.setDate(current.getDate() + 1);
    }

    await this.cohortService.recomputeCohorts(currency);

    return {
      daysProcessed: snapshots.length,
      snapshotsCreated: snapshots.length,
      snapshots,
    };
  }

  /**
   * Backfills daily snapshots for the past N days.
   * Execution is idempotent: re-running overwrites existing daily keys with identical deterministic data.
   */
  async backfillDays(days = 30, currency = "KES"): Promise<{ processedDays: number; snapshots: PlatformDailySnapshotRecord[] }> {
    const snapshots: PlatformDailySnapshotRecord[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const targetDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = targetDate.toISOString().split("T")[0];

      const snapshot = await this.projectionService.generateDailySnapshot(dateStr, currency);
      snapshots.push(snapshot);
    }

    // Recompute cohort matrices
    await this.cohortService.recomputeCohorts(currency);

    return {
      processedDays: snapshots.length,
      snapshots,
    };
  }
}
