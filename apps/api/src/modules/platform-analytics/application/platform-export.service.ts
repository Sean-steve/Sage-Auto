// ============================================================================
// CAR HIRE OS — PLATFORM EXPORT SERVICE (Sprint 35: DEV-009, SEC-001)
// Sanitized CSV & Data Exporter for Platform SaaS Intelligence Reports
// Enforces OWASP formula injection defense on all exported values
// ============================================================================

import type { PlatformReportExecutionRecord, PlatformReportType, PlatformReportFilter } from "@carhire/types";
import { CsvSanitizer } from "../../analytics/domain/csv-sanitizer";
import { PlatformReportingService } from "./platform-reporting.service";

export interface PlatformExportServiceDeps {
  reportingService?: PlatformReportingService;
  movementRepo?: any;
  subRepo?: any;
  planRepo?: any;
}

export class PlatformExportService {
  private reportingService: PlatformReportingService;

  constructor(depsOrReportingService?: PlatformExportServiceDeps | PlatformReportingService) {
    if (depsOrReportingService && typeof (depsOrReportingService as any).executeReport !== "function") {
      const deps = depsOrReportingService as PlatformExportServiceDeps;
      this.reportingService = deps.reportingService || new PlatformReportingService();
    } else {
      this.reportingService = (depsOrReportingService as PlatformReportingService) || new PlatformReportingService();
    }
  }

  /**
   * Directly generates sanitized CSV for a given report type and filter set.
   */
  async exportReportCsv(
    reportType: PlatformReportType,
    filters: PlatformReportFilter = {},
    executedBy = "export-service"
  ): Promise<string> {
    const execution = await this.reportingService.executeReport(reportType, filters, executedBy);
    return this.exportToCsv(execution);
  }

  /**
   * Generates sanitized CSV text from a platform report execution record.
   */
  exportToCsv(execution: PlatformReportExecutionRecord): string {
    const data = execution.data || (execution as any).rows || [];
    if (data.length === 0) {
      return "No data available for the specified report filters\r\n";
    }

    let headers: string[] = [];
    let keys: string[] = [];

    if ((execution as any).columns && Array.isArray((execution as any).columns) && (execution as any).columns.length > 0) {
      const cols = (execution as any).columns;
      headers = cols.map((c: any) => c.label || c.name || c.key);
      keys = cols.map((c: any) => c.key || c.name);
    } else {
      const firstRow = data[0];
      keys = Object.keys(firstRow).filter((k) => typeof firstRow[k] !== "object");
      headers = keys;
    }

    const rows = data.map((item: any) => keys.map((k: string) => item[k]));

    return CsvSanitizer.toCsv(headers, rows);
  }

  /**
   * Generates formatted JSON output.
   */
  exportToJson(execution: PlatformReportExecutionRecord): string {
    return JSON.stringify(
      {
        reportType: execution.reportType,
        executedBy: execution.executedBy,
        filters: execution.filters,
        summary: execution.summary,
        rowCount: execution.rowCount,
        data: execution.data,
        createdAt: execution.createdAt,
      },
      null,
      2
    );
  }
}
