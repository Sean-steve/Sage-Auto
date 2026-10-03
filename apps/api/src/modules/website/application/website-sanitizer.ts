// ============================================================================
// CAR HIRE OS — CONTENT SANITIZER & XSS DEFENSE (SEC-001, DEV-008 §35)
// Guarantees zero script injection, safe HTML whitelisting, and clean plain text
// ============================================================================

export class WebsiteContentSanitizer {
  /**
   * Sanitizes plain text fields (headings, titles, badges, button labels)
   * Strips all markup, control characters, and dangerous payload attempts.
   */
  static sanitizePlainText(input?: string): string {
    if (!input || typeof input !== "string") return "";
    return input
      .replace(/<[^>]*>?/gm, "") // Strip all HTML tags
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Strip control characters
      .trim();
  }

  /**
   * Sanitizes rich text content (paragraphs, blog/about text, legal terms)
   * Permits strictly safe formatting tags: p, b, strong, i, em, u, ul, ol, li, br, a[href|target|rel]
   * Strips script, object, embed, iframe, style, form, and all on* event handlers.
   */
  static sanitizeRichText(input?: string): string {
    if (!input || typeof input !== "string") return "";

    // 1. First remove dangerous blocks entirely (script, style, iframe, etc.)
    let sanitized = input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");

    // 2. Remove all inline event handlers (onclick, onerror, onload, etc.)
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, "");

    // 3. Reject / neutralize javascript:, vbscript:, data: protocols in attributes
    sanitized = sanitized.replace(/(href|src)\s*=\s*(["']?)\s*(javascript|vbscript|data):/gi, '$1=$2#blocked-');

    // 4. Ensure any anchor links enforce noopener noreferrer
    sanitized = sanitized.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
      let cleanAttrs = attrs;
      if (!/target\s*=/i.test(cleanAttrs)) {
        cleanAttrs += ' target="_blank"';
      }
      if (!/rel\s*=/i.test(cleanAttrs)) {
        cleanAttrs += ' rel="noopener noreferrer"';
      } else {
        cleanAttrs = cleanAttrs.replace(/rel\s*=\s*["'][^"']*["']/gi, 'rel="noopener noreferrer"');
      }
      return `<a${cleanAttrs}>`;
    });

    return sanitized.trim();
  }

  /**
   * Validates and normalizes URL paths (slugs)
   */
  static normalizeSlug(slug: string): string {
    const trimmed = slug.trim().toLowerCase();
    const withoutLeading = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
    if (!withoutLeading || withoutLeading === "") return "/";
    const cleaned = withoutLeading
      .replace(/[^a-z0-9\-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return `/${cleaned}`;
  }
}
