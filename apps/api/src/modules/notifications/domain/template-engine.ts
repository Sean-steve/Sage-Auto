// ============================================================================
// CAR HIRE OS — TEMPLATE ENGINE (DEV-012, SPRINT 32)
// Secure variable interpolation, safe escaping & formatters
// ============================================================================

export class TemplateEngine {
  private static escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Resolves a nested property path from an object, e.g. "booking.vehicle.registration"
   */
  private static resolveValue(path: string, context: Record<string, unknown>): unknown {
    const parts = path.trim().split(".");
    let current: any = context;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  /**
   * Renders a template string with double-bracket tokens, e.g. {{customerName}}
   */
  public static render(
    template: string,
    variables: Record<string, unknown> = {},
    options: { escapeHtml?: boolean; fallbackValue?: string } = {}
  ): string {
    if (!template) return "";

    const { escapeHtml = false, fallbackValue = "" } = options;
    const tokenRegex = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

    return template.replace(tokenRegex, (match, path) => {
      const value = this.resolveValue(path, variables);

      if (value === undefined || value === null) {
        return fallbackValue;
      }

      const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
      return escapeHtml ? this.escapeHtml(stringValue) : stringValue;
    });
  }

  /**
   * Validates required variables against a schema
   */
  public static validateVariables(
    schema: Array<{ name: string; required: boolean }>,
    variables: Record<string, unknown>
  ): { isValid: boolean; missingVariables: string[] } {
    const missing: string[] = [];

    for (const item of schema) {
      if (item.required) {
        const value = this.resolveValue(item.name, variables);
        if (value === undefined || value === null || value === "") {
          missing.push(item.name);
        }
      }
    }

    return {
      isValid: missing.length === 0,
      missingVariables: missing,
    };
  }

  /**
   * Extracts all variable tokens used in a template string
   */
  public static extractVariables(template: string): string[] {
    const tokenRegex = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
    const tokens = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(template)) !== null) {
      tokens.add(match[1]);
    }

    return Array.from(tokens);
  }
}
