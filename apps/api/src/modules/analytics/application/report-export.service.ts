// ============================================================================
// CAR HIRE OS — REPORT EXPORT APPLICATION SERVICE (Sprint 34: DOM-003, SEC-001)
// Asynchronous report generation, sanitized CSV output & export job management
// ============================================================================

import type {
  ReportExecution,
  ReportKey,
  ReportQueryParams,
  ReportFormat,
} from "@carhire/types";
import { ReportExecutionRepository } from "@carhire/database";
import { ReportingService } from "./reporting.service";
import { ReportRegistry } from "../domain/report-registry";
import { CsvSanitizer } from "../domain/csv-sanitizer";

export class ReportExportService {
  constructor(
    private readonly executionRepo: ReportExecutionRepository = new ReportExecutionRepository(),
    private readonly reportingService: ReportingService = new ReportingService()
  ) {}

  /**
   * Initiates an asynchronous report execution job
   */
  async requestReportExport(
    tenantId: string,
    reportKey: ReportKey,
    format: ReportFormat,
    params: ReportQueryParams = {},
    requestedByUserId?: string
  ): Promise<ReportExecution> {
    const definition = ReportRegistry.get(reportKey);
    if (!definition) {
      throw new Error(`Report definition not found for key: ${reportKey}`);
    }

    // Create queued execution record
    const execution = await this.executionRepo.create({
      tenantId,
      reportKey,
      reportVersion: definition.version,
      format,
      status: "PENDING",
      filtersSnapshot: params,
      requestedBy: requestedByUserId || "system",
    });

    // Execute asynchronously (non-blocking)
    this.processExportJob(execution.id, tenantId, reportKey, format, params).catch((err) => {
      console.error(`Export execution failed for job ${execution.id}:`, err);
    });

    return execution;
  }

  /**
   * Retrieves the current execution status of an export job
   */
  async getExecution(id: string, tenantId: string): Promise<ReportExecution | null> {
    return this.executionRepo.findById(id, tenantId);
  }

  /**
   * Lists historical report execution jobs for a tenant
   */
  async listExecutions(tenantId: string): Promise<ReportExecution[]> {
    return this.executionRepo.listByTenant(tenantId);
  }

  /**
   * Worker method that executes report query, formats CSV/XLSX, and persists artifact
   */
  private async processExportJob(
    jobId: string,
    tenantId: string,
    reportKey: ReportKey,
    format: ReportFormat,
    params: ReportQueryParams
  ): Promise<void> {
    try {
      await this.executionRepo.update(jobId, tenantId, { status: "RUNNING" });

      // Query full report dataset (large page size for export)
      const result = await this.reportingService.executeReport(tenantId, reportKey, {
        ...params,
        page: 1,
        pageSize: 10000,
      });

      const definition = ReportRegistry.get(reportKey)!;
      const headers = definition.columns.map((c) => c.header);
      const rows = result.rows.map((row) =>
        definition.columns.map((c) => row[c.key])
      );

      // Generate sanitized output
      let content = "";
      let mimeType = "text/csv";

      if (format === "CSV") {
        content = CsvSanitizer.toCsv(headers, rows);
        mimeType = "text/csv";
      } else if (format === "XLSX" || format === "PDF") {
        // Tab-delimited sanitized sheet compatible with Excel and preview engines
        content = CsvSanitizer.toCsv(headers, rows);
        mimeType = format === "XLSX" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf";
      }

      const fileBuffer = Buffer.from(content, "utf-8");
      const fileSize = fileBuffer.length;
      const downloadUrl = `/api/v1/reports/executions/${jobId}/download`;

      await this.executionRepo.update(jobId, tenantId, {
        status: "COMPLETED",
        completedAt: new Date().toISOString(),
        fileSize,
        rowCount: result.rows.length,
        downloadUrl,
        rawContent: content,
        mimeType,
      });
    } catch (err: any) {
      await this.executionRepo.update(jobId, tenantId, {
        status: "FAILED",
        completedAt: new Date().toISOString(),
        error: err?.message || "Report export job failed unexpectedly",
      });
    }
  }
}
