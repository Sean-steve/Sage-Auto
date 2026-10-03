// ============================================================================
// CAR HIRE OS — REPORT SCHEDULE APPLICATION SERVICE (Sprint 34: DOM-003, DEV-009)
// Automated recurring report scheduling, generation triggers & recipient delivery
// ============================================================================

import type { ReportSchedule, ScheduleFrequency, ReportKey, ReportExportFormat } from "@carhire/types";
import { ReportScheduleRepository } from "@carhire/database";
import { ReportExportService } from "./report-export.service";

export class ReportScheduleService {
  constructor(
    private readonly scheduleRepo: ReportScheduleRepository = new ReportScheduleRepository(),
    private readonly exportService: ReportExportService = new ReportExportService()
  ) {}

  /**
   * Creates a new automated report schedule
   */
  async createSchedule(
    tenantId: string,
    data: {
      reportKey: ReportKey;
      frequency: ScheduleFrequency;
      format: ReportExportFormat;
      recipientEmails: string[];
      filterSnapshot?: Record<string, unknown>;
      timezone?: string;
      createdById?: string;
    }
  ): Promise<ReportSchedule> {
    const nextRunAt = this.calculateNextRun(data.frequency);

    return this.scheduleRepo.create({
      tenantId,
      reportKey: data.reportKey,
      frequency: data.frequency,
      format: data.format,
      recipients: data.recipientEmails,
      filtersSnapshot: data.filterSnapshot || {},
      timezone: data.timezone || "UTC",
      enabled: true,
      nextRunAt,
      createdBy: data.createdById || "system",
    });
  }

  /**
   * Lists schedules for a tenant
   */
  async listSchedules(tenantId: string): Promise<ReportSchedule[]> {
    return this.scheduleRepo.listByTenant(tenantId);
  }

  /**
   * Updates an existing schedule
   */
  async updateSchedule(
    id: string,
    tenantId: string,
    updates: Partial<Omit<ReportSchedule, "id" | "tenantId" | "createdAt">>
  ): Promise<ReportSchedule> {
    return this.scheduleRepo.update(id, tenantId, updates);
  }

  /**
   * Deletes a schedule
   */
  async deleteSchedule(id: string, tenantId: string): Promise<boolean> {
    return this.scheduleRepo.delete(id, tenantId);
  }

  /**
   * Processes all due report schedules as of a given timestamp
   */
  async processDueSchedules(asOf: string = new Date().toISOString()): Promise<number> {
    const due = await this.scheduleRepo.listDueSchedules(asOf);
    let count = 0;

    for (const schedule of due) {
      try {
        // Trigger report export
        await this.exportService.requestReportExport(
          schedule.tenantId,
          schedule.reportKey,
          schedule.format,
          schedule.filtersSnapshot,
          schedule.createdBy
        );

        // Update schedule metadata
        const nextRunAt = this.calculateNextRun(schedule.frequency);
        await this.scheduleRepo.update(schedule.id, schedule.tenantId, {
          lastRunAt: new Date().toISOString(),
          nextRunAt,
        });

        count++;
      } catch (err) {
        console.error(`Failed to process schedule ${schedule.id}:`, err);
      }
    }

    return count;
  }

  private calculateNextRun(frequency: ScheduleFrequency, fromDate: Date = new Date()): string {
    const next = new Date(fromDate);
    switch (frequency) {
      case "DAILY":
        next.setUTCDate(next.getUTCDate() + 1);
        next.setUTCHours(6, 0, 0, 0); // 06:00 UTC
        break;
      case "WEEKLY":
        next.setUTCDate(next.getUTCDate() + 7);
        next.setUTCHours(6, 0, 0, 0);
        break;
      case "MONTHLY":
        next.setUTCMonth(next.getUTCMonth() + 1);
        next.setUTCDate(1);
        next.setUTCHours(6, 0, 0, 0);
        break;
    }
    return next.toISOString();
  }
}
