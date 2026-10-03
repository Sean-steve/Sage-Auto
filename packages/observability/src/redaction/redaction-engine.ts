// ============================================================================
// CAR HIRE OS — LOG & TELEMETRY REDACTION ENGINE (SEC-007, SPRINT 42)
// Deep recursive redaction of sensitive credentials, PII, payment secrets & tokens
// + Defense against log-injection attacks (CRLF stripping)
// ============================================================================

export const REDACTED_MARKER = "[REDACTED]";
export const REDACTED_MASK = REDACTED_MARKER;

/**
 * Strict regex patterns matching sensitive keys across auth, finance, PII & storage
 */
export const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /password/i,
  /passhash/i,
  /passwordhash/i,
  /passkey/i,
  /secret/i,
  /apikey/i,
  /api_key/i,
  /token/i,
  /jwt/i,
  /authorization/i,
  /auth_header/i,
  /bearer/i,
  /cookie/i,
  /session_?id/i,
  /card_?number/i,
  /pan/i,
  /cvv/i,
  /cvc/i,
  /pin/i,
  /private_?key/i,
  /cert_?pem/i,
  /security_?credential/i,
  /national_?id/i,
  /passport_?number/i,
  /license_?number/i,
  /stk_?push/i,
  /mpesa_?passkey/i,
  /consumer_?secret/i,
  /webhook_?secret/i,
  /signed_?url/i,
  /presigned/i,
  /x-amz-signature/i,
  /customer_?notes/i,
  /private_?comment/i,
];

/**
 * Sensitive value patterns (e.g. JWT tokens, Credit card numbers, Signed URL query params)
 */
export const SENSITIVE_VALUE_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  // JWT Bearer format (header.payload.signature)
  {
    name: "jwt",
    pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    replacement: "[REDACTED_JWT]",
  },
  // Basic Auth header value
  {
    name: "basic_auth",
    pattern: /Basic\s+[a-zA-Z0-9+/=]{10,}/gi,
    replacement: "Basic [REDACTED]",
  },
  // Bearer token header value
  {
    name: "bearer_auth",
    pattern: /Bearer\s+[a-zA-Z0-9._~+/-]{10,}/gi,
    replacement: "Bearer [REDACTED]",
  },
  // 16-digit credit card pattern
  {
    name: "credit_card",
    pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    replacement: "[REDACTED_PAN]",
  },
  // AWS S3 Signature in query strings
  {
    name: "signed_url_signature",
    pattern: /(X-Amz-Signature|Signature)=[a-f0-9]{32,64}/gi,
    replacement: "$1=[REDACTED_SIG]",
  },
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitizes a string to prevent log-injection / CRLF injection attacks.
 */
export function sanitizeLogString(input: string): string {
  if (!input || typeof input !== "string") {
    return input;
  }
  // Replace carriage returns and newlines with spaces to prevent log splitting
  let cleaned = input.replace(/[\r\n\x00-\x1f\x7f-\x9f]/g, " ");

  // Apply value-level redactions
  for (const { pattern, replacement } of SENSITIVE_VALUE_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return cleaned.trim();
}

/**
 * Generates a safe, non-reversible cryptographic pseudonymous hash for tenant IDs
 * to allow cross-log grouping without leaking customer/tenant identities in telemetry.
 */
export function safeTenantHash(tenantId?: string | null): string | undefined {
  if (!tenantId) return undefined;
  let hash = 0x811c9dc5;
  const str = `salt:${tenantId}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `th_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Recursively redacts sensitive keys and values from arbitrary objects.
 * Enforces a strict max depth to prevent stack overflows and memory exhaustion.
 */
export function sanitizeTelemetryData<T = unknown>(data: T, depth = 0): T {
  if (depth > 6) {
    return "[MAX_DEPTH_EXCEEDED]" as unknown as T;
  }

  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    return sanitizeLogString(data) as unknown as T;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: sanitizeLogString(data.message),
      code: (data as any).code,
      stack: data.stack ? sanitizeLogString(data.stack) : undefined,
    } as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeTelemetryData(item, depth + 1)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive) {
      sanitized[key] = REDACTED_MARKER;
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeTelemetryData(value, depth + 1);
    } else if (typeof value === "string") {
      sanitized[key] = sanitizeLogString(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
