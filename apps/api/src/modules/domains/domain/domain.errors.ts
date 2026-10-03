// ============================================================================
// CAR HIRE OS — DOMAIN ROUTING & HOST RESOLUTION ERRORS (TEN-001, DEV-009, SEC-001)
// ============================================================================

import {
  WebsiteDomainError,
  DomainAlreadyRegisteredError,
  DomainVerificationFailedError,
  DomainNotFoundError,
} from "../../website/domain/website.errors";

export {
  WebsiteDomainError,
  DomainAlreadyRegisteredError,
  DomainVerificationFailedError,
  DomainNotFoundError,
};

export class DomainRoutingError extends WebsiteDomainError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 400
  ) {
    super(message, code, statusCode);
  }
}

export class DomainNotRoutableError extends DomainRoutingError {
  constructor(hostname: string, status: string) {
    super(
      `Domain '${hostname}' is not routable because its verification status is '${status}'. Only verified domains route traffic.`,
      "DOMAIN_NOT_ROUTABLE",
      404
    );
  }
}

export class DomainEntitlementRequiredError extends DomainRoutingError {
  constructor(tenantId: string) {
    super(
      `Tenant '${tenantId}' does not have the 'custom_domain' feature entitlement required to register custom domains. Upgrade subscription plan to enable custom domains.`,
      "DOMAIN_ENTITLEMENT_REQUIRED",
      403
    );
  }
}

export class CannotDeletePlatformSubdomainError extends DomainRoutingError {
  constructor(hostname: string) {
    super(
      `Cannot delete or remove automatic platform subdomain '${hostname}'. The primary platform subdomain is permanent.`,
      "CANNOT_DELETE_PLATFORM_SUBDOMAIN",
      400
    );
  }
}

export class ReservedSubdomainError extends DomainRoutingError {
  constructor(subdomain: string) {
    super(
      `Subdomain '${subdomain}' is a reserved platform keyword and cannot be registered or assigned.`,
      "RESERVED_SUBDOMAIN",
      400
    );
  }
}

export class CrossTenantDomainDeniedError extends DomainRoutingError {
  constructor(requestTenantId: string, domainTenantId: string) {
    super(
      `Cross-tenant access violation: Tenant '${requestTenantId}' cannot mutate or inspect domain belonging to Tenant '${domainTenantId}'.`,
      "CROSS_TENANT_DOMAIN_DENIED",
      403
    );
  }
}

export class InvalidDomainFormatError extends DomainRoutingError {
  constructor(hostname: string, reason: string) {
    super(
      `Invalid domain format for '${hostname}': ${reason}`,
      "INVALID_DOMAIN_FORMAT",
      400
    );
  }
}

export class DomainVerificationRateLimitedError extends DomainRoutingError {
  constructor(hostname: string) {
    super(
      `Verification checks for domain '${hostname}' have exceeded the rate limit. Please wait 15 minutes before re-attempting DNS verification.`,
      "DOMAIN_VERIFICATION_RATE_LIMITED",
      429
    );
  }
}
