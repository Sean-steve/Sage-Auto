// ============================================================================
// CAR HIRE OS — WEBSITE CMS & BRANDING DOMAIN ERRORS (ARCH-001, SEC-001, DEV-008)
// Strict error taxonomy for Tenant Website, Branding, Custom Domains & Public Engine
// ============================================================================

export class WebsiteDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WebsiteNotFoundError extends WebsiteDomainError {
  constructor(identifier: string) {
    super(
      `Tenant website not found for identifier: ${identifier}`,
      "WEBSITE_NOT_FOUND",
      404
    );
  }
}

export class WebPageNotFoundError extends WebsiteDomainError {
  constructor(pageIdOrSlug: string) {
    super(
      `Website page not found: ${pageIdOrSlug}`,
      "WEBPAGE_NOT_FOUND",
      404
    );
  }
}

export class DuplicatePageSlugError extends WebsiteDomainError {
  constructor(slug: string) {
    super(
      `A page with slug '${slug}' already exists for this website.`,
      "WEBPAGE_SLUG_EXISTS",
      409
    );
  }
}

export class StandardPageCannotBeDeletedError extends WebsiteDomainError {
  constructor(slug: string) {
    super(
      `Standard system page '${slug}' is required by the storefront architecture and cannot be deleted.`,
      "STANDARD_PAGE_CANNOT_BE_DELETED",
      400
    );
  }
}

export class DomainAlreadyRegisteredError extends WebsiteDomainError {
  constructor(hostname: string) {
    super(
      `Domain '${hostname}' is already registered on the platform.`,
      "DOMAIN_ALREADY_REGISTERED",
      409
    );
  }
}

export class DomainVerificationFailedError extends WebsiteDomainError {
  constructor(hostname: string, reason: string) {
    super(
      `DNS challenge verification failed for domain '${hostname}': ${reason}`,
      "DOMAIN_VERIFICATION_FAILED",
      422
    );
  }
}

export class DomainNotFoundError extends WebsiteDomainError {
  constructor(domainId: string) {
    super(
      `Custom domain mapping not found for ID: ${domainId}`,
      "DOMAIN_NOT_FOUND",
      404
    );
  }
}

export class InvalidContentBlockError extends WebsiteDomainError {
  constructor(reason: string) {
    super(
      `Content block rejected: ${reason}`,
      "INVALID_CONTENT_BLOCK",
      400
    );
  }
}

export class WebsiteUnpublishedError extends WebsiteDomainError {
  constructor(subdomainOrHost: string) {
    super(
      `The website for '${subdomainOrHost}' is currently in draft or unconfigured state and has not been published yet.`,
      "WEBSITE_UNPUBLISHED",
      404
    );
  }
}

export class CrossTenantWebsiteDeniedError extends WebsiteDomainError {
  constructor(requestTenantId: string, resourceTenantId: string) {
    super(
      `Cross-tenant access violation: Tenant '${requestTenantId}' cannot mutate or access website resource belonging to Tenant '${resourceTenantId}'.`,
      "CROSS_TENANT_WEBSITE_DENIED",
      403
    );
  }
}
