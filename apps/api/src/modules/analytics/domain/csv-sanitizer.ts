// ============================================================================
// CAR HIRE OS — CSV SANITIZER (Sprint 34: SEC-001, SEC-003)
// OWASP CSV Injection Defense: Sanitizes formula indicators (=, +, -, @, \t, \r)
// ============================================================================

export class CsvSanitizer {
  private static readonly INJECTION_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

  /**
   * Sanitizes a single cell value for CSV output to prevent DDE / formula execution
   */
  public static sanitizeCell(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    let stringVal = String(value);

    // Check if the cell begins with dangerous formula injection characters
    const trimmed = stringVal.trimStart();
    const isDangerous = CsvSanitizer.INJECTION_PREFIXES.some(
      (prefix) => stringVal.startsWith(prefix) || (trimmed.length > 0 && trimmed.startsWith(prefix))
    );
    if (isDangerous) {
      // Prepend a single quote so spreadsheets treat it as a literal string
      stringVal = `'${stringVal}`;
    }

    // Standard RFC 4180 CSV escaping: quote if contains comma, quote, or newline
    if (stringVal.includes(",") || stringVal.includes('"') || stringVal.includes("\n") || stringVal.includes("\r")) {
      return `"${stringVal.replace(/"/g, '""')}"`;
    }

    return stringVal;
  }

  /**
   * Serializes rows into compliant, sanitized CSV text
   */
  public static toCsv(headers: string[], rows: unknown[][]): string {
    const headerLine = headers.map((h) => CsvSanitizer.sanitizeCell(h)).join(",");
    const dataLines = rows.map((row) => row.map((cell) => CsvSanitizer.sanitizeCell(cell)).join(","));
    return [headerLine, ...dataLines].join("\r\n");
  }
}

export function sanitizeCsvValue(value: unknown): string {
  return CsvSanitizer.sanitizeCell(value);
}

export function sanitizeCsvRow(row: unknown[]): string[] {
  return row.map((cell) => CsvSanitizer.sanitizeCell(cell));
}
