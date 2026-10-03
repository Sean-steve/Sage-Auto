# CAR HIRE OS — SPRINT 30 PRE-IMPLEMENTATION ASSESSMENT
## AUTOMATIC SUBDOMAINS, CUSTOM DOMAINS, HOST RESOLUTION, DOMAIN VERIFICATION, TLS READINESS & TENANT WEBSITE ROUTING

**Document Identifier:** DOC-SPRINT-30-ASSESSMENT  
**Status:** COMPLETED / PENDING USER APPROVAL  
**Author:** Principal Platform Architect & Antigravity Engineering  
**Governing Architecture Standards:** ARCH-001, SEC-001, TEN-001, DEV-001, DEV-006, DEV-007, DEV-008, DEV-009, BRS-001, ADR-001, ADR-009  

---

### EXECUTIVE SUMMARY

Sprint 30 establishes the production-grade Domain Routing, Automatic Subdomains, Custom Domains, DNS Verification, Host Resolution Pipeline, and TLS Readiness layer for Car Hire OS.

Building on the CMS, branding, and shared public-web engine delivered in Sprint 29, Sprint 30 hardens the direct-to-consumer storefront entry point by establishing the authoritative **Host → Domain → Website → Tenant** resolution pipeline. This ensures that every public HTTP request arriving at the shared public-web engine is deterministically, securely, and efficiently mapped to the correct tenant context without relying on client-supplied headers, query parameters, or raw unvetted hostnames.

This pre-implementation assessment rigorously defines all 34 architectural, security, lifecycle, data model, integration, and verification dimensions required prior to code execution.

---

### 1. GOVERNING SPECIFICATIONS & ARCHITECTURAL STANDARDS

The design and implementation of Sprint 30 are governed by the following authoritative Car Hire OS architecture specifications:

- **ARCH-001 (Modular Monolith & Canonical Repository Structure):** Enforces clean domain boundaries across `apps/api` (REST API modules), `apps/public-web` (shared public storefront renderer), `apps/tenant-admin` (operator CMS desk), and shared packages (`packages/types`, `packages/contracts`, `packages/database`, `packages/validation`).
- **SEC-001 (Security, Tenant Isolation & Defense-in-Depth):** Strict tenant isolation on every state mutation and read query. Public-facing endpoints are strictly unauthenticated, non-privileged, rate-limited, and shielded against Host-Header Poisoning, DNS Spoofing, Subdomain Squatting, and cross-tenant hijacking.
- **TEN-001 (Multi-Tenancy & Host Resolution):** Strict rule: HTTP requests traversing the shared public-web engine must resolve target `tenantId` deterministically through the canonical multi-step pipeline: `Host → Domain → Website → Tenant`. Direct `Host → Tenant` or `Header → Tenant` shortcut routing is strictly prohibited.
- **DEV-006 & DEV-007 (Platform Networking, Edge Proxy & Ingress Standards):** Specification for reverse proxy trust configuration, header normalization, port stripping, and TLS termination readiness.
- **DEV-008 (§34-38 - Public Web & Tenant Customization Architecture):** Authoritative rules defining the single shared public-web engine, prohibition of per-tenant code forks, and preservation of automatic platform subdomains even when custom domains are active.
- **DEV-009 (Domain Verification & DNS Challenge Specification):** Defines DNS TXT challenge token structure, CNAME routing targets, verification polling algorithms, and TTL policies.
- **BRS-001 (Business Requirements - Custom Domain Entitlement):** Operators on qualifying subscription plans receive custom domain support governed by the Entitlement Engine (Sprint 7) and Subscription Enforcement (Sprint 8).
- **ADR-001 & ADR-009 (Monorepo Baseline & Multi-Tenant Context Propagation):** Zero cross-tenant pollution at runtime and deterministic context synthesis.

---

### 2. BUSINESS PURPOSE & OPERATIONAL VALUE

Car rental operators demand complete brand dignity:
1. **Instant Onboarding:** Every new tenant immediately receives an automatic, zero-config platform subdomain (`{slug}.carhireos.com`) upon website initialization, enabling immediate public vehicle showcase and testing.
2. **Enterprise Brand Authority:** Commercial operators require their own apex or subdomains (e.g., `rentals.safarisuncars.com` or `driveapex.co.ke`) to run marketing campaigns, establish customer trust, and maintain brand equity.
3. **Zero DevOps Overhead:** Operators do not manage servers, Nginx configs, Kubernetes ingresses, or SSL certificates. The platform manages DNS challenge verification, automated TLS readiness, and zero-downtime routing dynamically.
4. **Resilient Dual-Routing:** Connecting a custom domain never breaks the default platform subdomain. Both routes resolve to the same canonical published website snapshot seamlessly.

---

### 3. DOMAIN BOUNDARIES & AGGREGATE ROOTS

Sprint 30 formalizes the `Domain` bounded context (`apps/api/src/modules/domains`) as a peer bounded context to `Website` (`apps/api/src/modules/website`):

1. **`Domain` Aggregate Root (`DomainRecord`):**
   - Encapsulates hostname, tenant ownership, target website mapping, domain type (`PLATFORM_SUBDOMAIN` vs. `CUSTOM_DOMAIN`), verification lifecycle state, DNS tokens, SSL readiness, and primary designation.
   - Enforces domain uniqueness across the entire platform, preventing squatting and duplicate registrations.
2. **`HostResolver` Domain Service:**
   - Stateless, high-performance resolution pipeline converting an incoming raw HTTP request into a validated `PublicWebsiteContext`.
3. **`DnsVerificationService` Domain Service:**
   - Manages cryptographic verification token generation, DNS record lookup (`TXT` and `CNAME`), and status transition logic.
4. **`TlsReadinessCoordinator` Service:**
   - Tracks SSL lifecycle states (`INITIALIZING`, `PROVISIONING`, `ACTIVE`, `RENEWAL_PENDING`, `FAILED`) and interfaces with external certificate managers / edge proxies.

---

### 4. CRITICAL INVARIANT 1: SINGLE SHARED PUBLIC-WEB APPLICATION

- **Rule:** The platform operates **exactly one** shared public-web application instance (`apps/public-web`).
- **Strict Prohibition:** There are NO per-tenant frontend deployments, per-tenant repositories, per-tenant Docker containers, or build-time code branching.
- **Implementation:**
  - One deployment serves all tenants across all platform subdomains and all verified custom domains.
  - Runtime request inspection executes the `HostResolver` pipeline to determine which tenant's published snapshot to render.

---

### 5. CRITICAL INVARIANT 2: HOST HEADER DOES NOT DIRECTLY IDENTIFY A TENANT

- **Rule:** The `Host` header DOES NOT directly identify a tenant.
- **Strict Prohibition:** Direct `Host → Tenant` lookup or parsing the first segment of an arbitrary hostname to query `Tenant.slug` ad-hoc is strictly prohibited.
- **Canonical Architecture:**
  ```
  Request Host ──► Domain Entity ──► Website Entity ──► Tenant Entity ──► PublicWebsiteContext
  ```
  1. Extract and normalize hostname.
  2. Query `Domain` repository for matching hostname.
  3. Validate domain routability (`ACTIVE`, `VERIFIED`, not revoked/suspended).
  4. Query `Website` repository via `domain.websiteId`.
  5. Validate website publication state (`PUBLISHED`, not archived).
  6. Query `Tenant` repository via `website.tenantId` to confirm active account standing.
  7. Construct immutable `PublicWebsiteContext`.

---

### 6. CRITICAL INVARIANT 3: UNVERIFIED CUSTOM DOMAINS MUST NOT BECOME ACTIVE

- **Rule:** Custom domains with status `PENDING_VERIFICATION`, `FAILED`, or `REVOKED` MUST NEVER route traffic to a tenant website.
- **Strict Enforcement:**
  - The `HostResolver` treats unverified domains as non-routable.
  - Traffic arriving on an unverified custom domain receives a safe, generic 404 or domain verification pending response.
  - Only when cryptographic DNS TXT challenge verification succeeds does status transition to `VERIFIED`, activating public routing.

---

### 7. CRITICAL INVARIANT 4: AUTOMATIC PLATFORM SUBDOMAIN MUST REMAIN AVAILABLE

- **Rule:** Connecting a custom domain MUST NOT deactivate or replace the tenant's automatic platform subdomain.
- **Enforcement:**
  - Every website maintains its permanent canonical platform subdomain (`{slug}.carhireos.com`).
  - Custom domains act as additional aliases pointing to the same website.
  - If a custom domain expires or DNS changes, the platform subdomain remains 100% operational as a fallback.

---

### 8. CRITICAL INVARIANT 5: ZERO TRUST IN CLIENT-SUPPLIED TENANT IDENTIFIERS

- **Rule:** Public routing MUST NOT trust client-supplied tenant identifiers.
- **Strict Prohibition:**
  - Do NOT trust `X-Tenant-ID` header.
  - Do NOT trust `?tenantId=...` query parameter.
  - Do NOT trust request body `tenantId` fields for public store routing.
  - Do NOT trust raw, unvetted `X-Forwarded-Host` from untrusted clients.
- **Enforcement:**
  - Public endpoints derive tenant identity exclusively from the resolved request hostname via `HostResolver`.

---

### 9. CRITICAL INVARIANT 6: SPRINT SCOPE DISCIPLINE

- **Rule:** Sprint 30 strictly owns Domain Routing, Custom Domains, DNS Verification, Host Resolution, and TLS Readiness.
- **Strict Scope Boundary:**
  - Sprint 30 DOES NOT implement public vehicle booking execution, guest checkout, deposit pre-authorizations, or reservation creation.
  - Public booking and payment flows are exclusively owned by Sprint 31.

---

### 10. AUTOMATIC PLATFORM SUBDOMAIN GENERATION & CANONICAL FORMATTING

- **Platform Base Domain:** Configured via environment (default: `carhireos.com`).
- **Subdomain Rules:**
  - Derived from tenant slug upon website initialization: `{subdomain}.carhireos.com`.
  - Normalization: Lowercase, alphanumeric and hyphens only (`^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$`).
  - Reserved Subdomains: `api`, `admin`, `app`, `auth`, `billing`, `cdn`, `dev`, `mail`, `platform`, `staging`, `status`, `test`, `www`, `portal`.
  - Automatic collision prevention: Appends deterministic counter or unique hash if requested subdomain is already claimed.
  - Subdomain records are created with `type: "PLATFORM_SUBDOMAIN"`, `verificationStatus: "VERIFIED"`, and `sslStatus: "ACTIVE"` immediately upon creation.

---

### 11. CUSTOM DOMAIN AGGREGATE & COMPLETE LIFECYCLE STATE MACHINE

Custom domains adhere to a strict finite state machine:

```
  ┌──────────────────────┐
  │ PENDING_VERIFICATION │◄────────┐
  └──────────┬───────────┘         │
             │ verifyDns()         │ re-verify / retry
             ▼                     │
  ┌──────────────────────┐         │
  │       VERIFIED       │         │
  └──────────┬───────────┘         │
             │ dnsChanged()        │
             ▼                     │
  ┌──────────────────────┐         │
  │        FAILED        ├─────────┘
  └──────────┬───────────┘
             │ operatorRevoke()
             ▼
  ┌──────────────────────┐
  │       REVOKED        │
  └──────────────────────┘
```

- **State Descriptions:**
  - `PENDING_VERIFICATION`: Domain registered by operator; DNS challenge issued; traffic NOT routed.
  - `VERIFIED`: DNS records cryptographically verified; SSL initialized; domain actively routes public traffic.
  - `FAILED`: DNS verification check failed; challenge record missing or incorrect; traffic remains blocked.
  - `REVOKED`: Domain disconnected by operator or revoked due to plan downgrade; mapping disabled.

---

### 12. DNS VERIFICATION ENGINE & CHALLENGE PROTOCOL

- **Challenge Generation:**
  - Token: `ch-verify-` + 32-character cryptographically secure random hexadecimal string.
  - Expected TXT Record:
    - Host: `_carhireos-challenge.{customDomain}`
    - Value: `carhire-verification={verificationToken}`
  - Expected CNAME Record:
    - Host: `{customDomain}`
    - Target: `cname.carhireos.com`
- **Verification Execution:**
  - Multi-check verification: Queries DNS for TXT token and validates CNAME target.
  - Safe timeout and retry policy preventing blocking on external DNS server latency.
  - Simulated verification support for automated test suites and offline local development.

---

### 13. HOST RESOLUTION PIPELINE & REQUEST NORMALIZATION

The `HostResolver` executes an 8-stage deterministic pipeline:
1. **Extraction:** Extract host string from trusted request sources (respecting reverse proxy configuration).
2. **Normalization:**
   - Strip port numbers (`example.com:3000` -> `example.com`).
   - Convert to lowercase (`Example.COM` -> `example.com`).
   - Trim whitespace and remove trailing dots.
3. **Lookup:** Query domain repository for normalized hostname.
4. **Verification Gate:** Confirm `verificationStatus === "VERIFIED"`. If not, return `DomainNotRoutableError`.
5. **Website Resolution:** Fetch `TenantWebsite` using `domain.websiteId`.
6. **Publication Gate:** Validate `website.status === "PUBLISHED"` and active snapshot exists. If in maintenance mode, flag context accordingly.
7. **Tenant Validation:** Confirm `Tenant` exists and is in `ACTIVE` or `TRIAL` standing.
8. **Context Assembly:** Return immutable `PublicWebsiteContext`.

---

### 14. HOST HEADER SECURITY, ANTI-POISONING & REVERSE PROXY TRUST

- **Host-Header Poisoning Mitigation:**
  - Applications behind reverse proxies (Nginx, Cloudflare, Google Cloud Load Balancer) must only trust `X-Forwarded-Host` if the connecting socket IP is in the configured `TRUSTED_PROXY_CIDRS` list.
  - Untrusted client-supplied `X-Forwarded-Host` or `X-Forwarded-Proto` headers are discarded.
  - Direct requests without trusted proxy validation rely strictly on the standard HTTP/1.1 `Host` header.
- **Port Stripping:** All host comparisons strictly discard port numbers.

---

### 15. TLS READINESS & SSL CERTIFICATE LIFECYCLE

- **SSL States:**
  - `INITIALIZING`: Verification complete; certificate provisioning requested.
  - `PROVISIONING`: ACME challenge in progress with certificate authority.
  - `ACTIVE`: Valid TLS certificate bound; HTTPS active.
  - `RENEWAL_PENDING`: Approaching 30-day renewal threshold.
  - `FAILED`: Certificate issuance failed.
- **Edge Architecture:**
  - SNI (Server Name Indication) dynamic certificate termination at the platform ingress layer.
  - Domain records maintain `sslStatus` and `sslExpiresAt` for operational monitoring and automated renewal alerts.

---

### 16. DOMAIN ENTITLEMENT & SAAS TIER GATING

- **Integration with Sprint 7 (Entitlement Engine) & Sprint 8 (Subscription Enforcement):**
  - Automatic platform subdomains are granted on ALL plans (Starter, Professional, Enterprise).
  - Custom domain registration requires the `custom_domain` feature entitlement.
  - When a tenant attempts to register a custom domain, `EntitlementEngine.checkFeature(tenantId, 'custom_domain')` is evaluated.
  - If tenant subscription lapses or downgrades to a plan without custom domains, existing custom domains transition to `REVOKED`, while platform subdomains remain active.

---

### 17. PRIMARY VS. SECONDARY DOMAINS & CANONICAL REDIRECT POLICY

- **Primary Flag (`isPrimary`):**
  - A website can have multiple custom domains (e.g., `rentals.apex.com` and `www.apexrentals.com`), but exactly one primary domain.
  - The primary domain defines the canonical URL injected into `<link rel="canonical">` and OpenGraph tags for SEO authority.
- **Redirect Policy:**
  - Secondary domains can be configured to 301-redirect to the primary domain to avoid duplicate content penalties.

---

### 18. DOMAIN COLLISION & CROSS-TENANT HIJACKING PREVENTION

- **Global Hostname Uniqueness:**
  - The database enforces a global unique index on `Domain.hostname`.
  - No two tenants can register or claim the same hostname.
- **Subdomain Squatting Guard:**
  - Reserved names are blocked.
  - Re-registration of recently released domains enforces a 30-day quarantine period.

---

### 19. PUBLIC WEBSITE CONTEXT FACTORY & TENANT HYDRATION

The resolution pipeline constructs a typed `PublicWebsiteContext`:
```typescript
export interface PublicWebsiteContext {
  tenantId: string;
  websiteId: string;
  domainId: string;
  hostname: string;
  domainType: DomainType;
  isPrimary: boolean;
  subdomain: string;
  status: WebsiteStatus;
  isMaintenanceMode: boolean;
  maintenanceMessage?: string;
  publishedVersion: number;
  branding: WebsiteBranding;
  navigation: WebsiteNavigation;
  activePages: Array<{
    id: string;
    slug: string;
    title: string;
    pageType: WebPageType;
    displayOrder: number;
  }>;
}
```

---

### 20. EDGE & IN-MEMORY CACHING OF HOST RESOLUTION

- **Resolution Caching:**
  - Host resolution queries are cached with a configurable TTL (default: 300 seconds).
  - Key: `domain:resolve:{hostname}`.
- **Cache Invalidation:**
  - Publishing a website, updating domains, verifying DNS, or toggling maintenance emits an event that instantly evicts the hostname cache entry.

---

### 21. FALLBACK & SAFE FAILURE HANDLING

- **Unknown Host:** Request for unregistered or unmapped domain returns a clean, branded generic 404 ("Storefront Not Found") without leaking system internals.
- **Unverified Custom Domain:** Returns HTTP 404 or a neutral "Domain Setup in Progress" page.
- **Unpublished Website:** If website is in `DRAFT` with no published snapshot, returns "Website Under Construction".
- **Maintenance Mode:** Returns HTTP 503 or 200 with `isMaintenanceMode: true` and rendered maintenance banner.
- **Suspended Tenant:** Returns HTTP 403 / "Service Temporarily Unavailable".

---

### 22. DEDICATED DOMAIN BOUNDED CONTEXT MODULE ARCHITECTURE

Module directory structure: `apps/api/src/modules/domains`:
- `domain/`: Domain entity, domain errors (`domain.errors.ts`), value objects.
- `application/`:
  - `domain.service.ts`: CRUD, registration, deletion, primary designation.
  - `domain-verification.service.ts`: DNS lookup, challenge generation, verification state machine.
  - `host-resolution.service.ts`: Normalization, multi-step resolution pipeline.
- `presentation/`:
  - `public-resolution.controller.ts`: Public `/api/v1/public/resolve` endpoint.
  - `tenant-domain.controller.ts`: Authenticated `/api/v1/tenant/domains` endpoints.
- `domains.module.ts`: NestJS / Express DI registration.

---

### 23. SHARED PUBLIC-WEB BOOTSTRAP & REQUEST MIDDLEWARE

- In `apps/public-web`:
  - Incoming request passes through `HostResolutionMiddleware`.
  - Middleware calls `HostResolver.resolve(req)`.
  - Synthesizes `PublicWebsiteContext` and attaches to request or React root context.
  - Legacy development fallbacks (such as query parameter `?tenantId=`) are strictly restricted to non-production environments with warning logs.

---

### 24. REST API ENDPOINTS & CONTRACTS

#### Public Resolution Endpoints (`/api/v1/public`)
- `GET /api/v1/public/domains/resolve`: Resolves incoming request `Host` to `PublicWebsiteContext`.
- `GET /api/v1/public/domains/health`: Edge ping and domain routing health check.

#### Tenant Admin Domain Endpoints (`/api/v1/tenant/domains`)
- `GET /api/v1/tenant/domains`: Lists all domains (platform subdomain and custom domains) for tenant.
- `POST /api/v1/tenant/domains`: Registers a new custom domain.
- `POST /api/v1/tenant/domains/:domainId/verify`: Triggers DNS verification for a domain.
- `POST /api/v1/tenant/domains/:domainId/set-primary`: Sets domain as primary.
- `DELETE /api/v1/tenant/domains/:domainId`: Disconnects/deletes a custom domain (platform subdomain cannot be deleted).

---

### 25. DOMAIN EVENTS, OUTBOX RELAY & AUDIT LOGGING

State transitions emit canonical events:
- `DomainRegisteredEvent`: Custom domain added; verification pending.
- `DomainVerifiedEvent`: DNS verification succeeded; routing activated; SSL initialized.
- `DomainVerificationFailedEvent`: DNS check failed with diagnostic details.
- `DomainPrimaryUpdatedEvent`: Primary domain switch.
- `DomainRemovedEvent`: Custom domain deleted; route deactivated; cache evicted.
- `TlsStatusUpdatedEvent`: SSL certificate status change.

All actions record an audit log with `userId`, `tenantId`, `ipAddress`, and `timestamp`.

---

### 26. SECURITY ARCHITECTURE, RBAC PERMISSIONS & TENANT ISOLATION

- **Permissions (`packages/constants`):**
  - `WEBSITE_DOMAIN_READ`: View domains and verification statuses.
  - `WEBSITE_DOMAIN_MANAGE`: Register, verify, set primary, and remove custom domains.
- **Tenant Isolation:**
  - All domain mutations verify that `domain.tenantId === ctx.tenantId`.
  - Cross-tenant domain tampering raises `CrossTenantWebsiteDeniedError`.

---

### 27. RATE LIMITING & DENIAL-OF-SERVICE PROTECTION

- Verification endpoint `/verify` is strictly rate-limited (max 5 attempts per 15 minutes per domain) to prevent DNS amplification and registrar abuse.
- Public resolution endpoint `/resolve` is protected by IP rate limiting (max 100 requests per minute per IP).

---

### 28. DATABASE SCHEMA & RELATIONAL PERSISTENCE MODELING

Entity definition in `packages/database`:
- **`WebsiteDomainRecord` / Table `website_domains`:**
  - `id`: UUID (PK)
  - `tenantId`: UUID (FK -> `tenants.id`, indexed)
  - `websiteId`: UUID (FK -> `tenant_websites.id`, indexed)
  - `hostname`: VARCHAR(255) (UNIQUE, indexed)
  - `type`: VARCHAR(50) (`PLATFORM_SUBDOMAIN`, `CUSTOM_DOMAIN`)
  - `verificationStatus`: VARCHAR(50) (`PENDING_VERIFICATION`, `VERIFIED`, `FAILED`, `REVOKED`)
  - `verificationMethod`: VARCHAR(50) (`DNS_TXT`, `DNS_CNAME`)
  - `verificationToken`: VARCHAR(255)
  - `expectedTxtRecord`: TEXT
  - `expectedCnameRecord`: VARCHAR(255)
  - `sslStatus`: VARCHAR(50) (`INITIALIZING`, `PROVISIONING`, `ACTIVE`, `RENEWAL_PENDING`, `FAILED`)
  - `isPrimary`: BOOLEAN (default false)
  - `verifiedAt`: TIMESTAMP (nullable)
  - `createdAt`: TIMESTAMP
  - `updatedAt`: TIMESTAMP

---

### 29. IN-MEMORY REPOSITORY IMPLEMENTATIONS & SEED STATES

- **`IWebsiteDomainRepository` / `InMemoryWebsiteDomainRepository`:**
  - `findById(id: string): Promise<WebsiteDomainRecord | null>`
  - `findByHostname(hostname: string): Promise<WebsiteDomainRecord | null>`
  - `listByWebsiteId(websiteId: string): Promise<WebsiteDomainRecord[]>`
  - `listByTenantId(tenantId: string): Promise<WebsiteDomainRecord[]>`
  - `save(domain: WebsiteDomainRecord): Promise<WebsiteDomainRecord>`
  - `delete(id: string): Promise<boolean>`

---

### 30. ERROR HANDLING HIERARCHY, DOMAIN EXCEPTIONS & HTTP STATUS MAPPINGS

Domain exceptions map cleanly to HTTP responses:
- `DomainNotFoundError` -> 404 Not Found
- `DomainAlreadyRegisteredError` -> 409 Conflict
- `DomainVerificationFailedError` -> 422 Unprocessable Entity
- `DomainNotRoutableError` -> 404 Not Found
- `DomainEntitlementRequiredError` -> 403 Forbidden (Subscription upgrade required)
- `CannotDeletePlatformSubdomainError` -> 400 Bad Request
- `ReservedSubdomainError` -> 400 Bad Request
- `CrossTenantDomainDeniedError` -> 403 Forbidden

---

### 31. CROSS-DOMAIN SERVICE INTEGRATIONS

- **Entitlement Engine (Sprint 7):** Validates `custom_domain` feature entitlement.
- **Tenancy (Sprint 4):** Validates tenant existence and subscription state.
- **Website CMS (Sprint 29):** Connects domains to websites and snapshots.
- **Audit & Outbox (Sprint 24):** Records audit logs and emits domain events.

---

### 32. TEST SUITE ARCHITECTURE & VERIFICATION STRATEGY

A dedicated test suite will be created at:
`/packages/database/test/domains-and-host-resolution.test.ts`

- **Execution Command:** `"test:domains": "tsx packages/database/test/domains-and-host-resolution.test.ts"`
- **Target:** 100% deterministic, passing assertions covering all states and edge cases.

---

### 33. DETAILED STEP-BY-STEP TEST SCENARIOS & ASSERTION MATRIX

The test suite will execute 11 comprehensive suites:
1. **Automatic Platform Subdomain Provisioning:** Verified platform subdomain is created upon website initialization; cannot be deleted.
2. **Custom Domain Registration & Token Generation:** Cryptographic verification token generated with exact TXT/CNAME records; status `PENDING_VERIFICATION`.
3. **Plan Entitlement Enforcement:** Registration rejected when tenant lacks `custom_domain` plan feature.
4. **Reserved Subdomain Protection:** Registration of reserved names (`api`, `admin`, `www`, `portal`) rejected.
5. **Global Domain Collision Prevention:** Duplicate domain registration across tenants rejected with 409 Conflict.
6. **DNS Verification Lifecycle:** Simulated DNS check transitions status to `VERIFIED` and `sslStatus` to `ACTIVE`; failed check transitions to `FAILED`.
7. **Canonical Host Resolution Pipeline:** Resolves `Host → Domain → Website → Tenant` for platform subdomains and verified custom domains.
8. **Unverified Custom Domain Routing Rejection:** Requests arriving on unverified domains are rejected; traffic is never routed.
9. **Zero-Trust Security & Header Poisoning Protection:** Insecure `X-Tenant-ID` or untrusted `X-Forwarded-Host` are strictly ignored; only trusted Host resolves.
10. **Primary Domain Switching & Canonical URL Tags:** Setting primary domain updates metadata and sets `isPrimary = true` atomically.
11. **Cross-Tenant Security Isolation:** Tenant A cannot inspect, verify, set primary, or remove Tenant B's domains.

---

### 34. SCOPE VERIFICATION & SPRINT 31 BOUNDARY

- **Explicitly Included in Sprint 30:**
  - Automatic platform subdomain generation and formatting.
  - Custom domain registration and lifecycle.
  - DNS challenge verification engine (TXT and CNAME).
  - Production Host Resolver pipeline (`Host → Domain → Website → Tenant`).
  - TLS readiness state machine and status tracking.
  - Integration with Entitlement Engine for custom domain gating.
  - Safe error fallbacks and host-header poisoning defenses.
- **Explicitly Deferred to Sprint 31 (Public Booking & Payment Execution):**
  - Public vehicle search date/time/branch availability querying.
  - Guest customer checkout and identity verification.
  - M-Pesa STK push and Stripe payment processing on public storefront.
  - Security deposit pre-authorization capture.
  - Booking reservation creation and voucher confirmation emails.

---

**End of Pre-Implementation Assessment**
