# CAR HIRE OS — SPRINT 29 PRE-IMPLEMENTATION ASSESSMENT
## TENANT WEBSITE CMS, BRANDING, CONTENT MANAGEMENT, VEHICLE PRESENTATION & SHARED PUBLIC-WEB ENGINE FOUNDATION

**Document Identifier:** DOC-SPRINT-29-ASSESSMENT  
**Status:** APPROVED / READY FOR IMPLEMENTATION  
**Author:** Principal Platform Architect & Antigravity Engineering  
**Governing Architecture Standards:** ARCH-001, SEC-001, TEN-001, DEV-001, DEV-004, DEV-008 (§34-38), ADR-001, ADR-009  

---

### EXECUTIVE SUMMARY

Sprint 29 establishes the production-grade Tenant Website CMS, Branding Platform, Vehicle Presentation Engine, and Shared Public-Web Engine Foundation for Car Hire OS. 

Following the successful delivery of Sprint 27 (Secure Files & Document Storage) and Sprint 28 (Media & Image Processing, Derivatives, Thumbnails, EXIF Privacy & Responsive Queries), Car Hire OS now possesses the necessary media and asset infrastructure to power high-performance, branded, direct-to-consumer digital storefronts for every car rental operator tenant on the platform.

This pre-implementation assessment rigorously defines all 35 architectural, security, lifecycle, data model, integration, and verification dimensions required prior to code execution.

---

### 1. GOVERNING SPECIFICATIONS & ARCHITECTURAL STANDARDS

The design and implementation of Sprint 29 are governed by the following authoritative Car Hire OS architecture specifications:

- **ARCH-001 (Modular Monolith & Canonical Repository Structure):** Enforces separation of concerns across `apps/api` (REST API modules), `apps/worker` (BullMQ jobs), `apps/public-web` (shared public storefront renderer), `apps/tenant-admin` (operator CMS desk), and shared packages (`packages/types`, `packages/contracts`, `packages/database`, `packages/validation`).
- **SEC-001 (Security, Tenant Isolation & Defense-in-Depth):** Mandatory tenant isolation on every state mutation and read query. Public-facing endpoints are strictly unauthenticated, non-privileged, rate-limited, and shielded against SQL/NoSQL injection, prototype pollution, and Cross-Site Scripting (XSS).
- **TEN-001 (Multi-Tenancy & Host Resolution):** Every HTTP request traversing the shared public-web engine must resolve its target `tenantId` deterministically from the incoming `Host` header (via subdomain or verified custom domain) or explicit fallback preview headers.
- **DEV-001 / DEV-002 (Engineering Standards & Monorepo Tooling):** Clean TypeScript compilation (`tsc --noEmit`), zero lint warnings, strict contract validation via Zod schemas, and deterministic in-memory test suites.
- **DEV-008 (§34-38 - Public Web & Tenant Customization Architecture):** Authoritative rules defining the single shared public-web engine, prohibition of per-tenant code forks, CMS data separation from executable code, draft vs. published isolation, and fleet single-source-of-truth.
- **ADR-001 (Monorepo Baseline):** Preservation of unified build pipelines and zero runtime cross-tenant pollution.
- **ADR-009 (Tenant Isolation & Context Propagation):** Guarantees that no tenant can inspect, mutate, or render another tenant's draft content, unpublished pages, or private media assets.

---

### 2. BUSINESS PURPOSE & OPERATIONAL VALUE

Car rental operators require a professional, branded web presence to showcase their vehicle fleet, acquire direct customer bookings, communicate branch locations, and establish market credibility. Traditionally, operators faced a painful dilemma:
1. **Fragmented Third-Party CMS (WordPress, Webflow, Squarespace):** Disconnected from fleet truth, inventory availability, rate engines, and booking calendars. Fleet managers were forced to duplicate vehicle specifications, images, and prices across two systems, leading to double-bookings, stale pricing, and manual overhead.
2. **Expensive Bespoke Web Development:** High capital expenditure, ongoing developer retainers, and fragile API synchronizations.

**Car Hire OS Sprint 29 solves this natively:**
- **Zero-Code Digital Storefronts:** Operators launch a fully responsive, SEO-optimized, branded website directly from their existing operational dashboard.
- **Single Source of Truth:** Vehicle models, specifications, categories, and approved public media assets flow directly from the Fleet & Vehicle Media domains into the public showcase without manual re-entry.
- **Brand Autonomy within Governance:** Operators control logos, color palettes, typography, hero banners, promotional copy, navigation menus, and custom domains, while platform guardrails ensure 100% responsive performance, accessibility, security, and uptime.
- **Zero Deployment Overhead:** Operators publish updates instantly with zero build steps, CI/CD pipelines, or server management.

---

### 3. DOMAIN BOUNDARIES & AGGREGATE ROOTS

Sprint 29 introduces two primary aggregate roots and supporting entities within the `apps/api/src/modules/website` domain:

1. **`TenantWebsite` Aggregate Root:**
   - Owns the tenant's top-level website configuration, publication lifecycle state (`DRAFT`, `PUBLISHED`, `MAINTENANCE`, `ARCHIVED`), active published snapshot reference, branding theme, SEO defaults, custom domains, and navigation structure.
   - Enforces the invariant that a tenant may have exactly one active `TenantWebsite` aggregate.
2. **`WebPage` Aggregate Root / Entity:**
   - Represents an individual page route within the website (e.g., `/`, `/fleet`, `/about`, `/contact`, `/terms`, `/promotions`).
   - Maintains independent publication status, slug hierarchy, SEO metadata overrides, and an ordered list of `ContentBlock` entities.
3. **`ContentBlock` Value Object / Entity:**
   - Structured, schema-validated JSON data blocks representing modular page sections (Hero, Vehicle Showcase, Features Grid, Testimonials, FAQ, Contact Details, Call-to-Action).
4. **`WebsiteDomain` Entity:**
   - Represents a hostname mapped to the tenant's website (either platform subdomain `{slug}.carhireos.com` or custom domain `rentals.operator.com`), tracking verification status, DNS challenge tokens, and SSL state.
5. **`WebsiteBranding` Value Object:**
   - Encapsulates color palettes, typography choices, logos, favicons, button styles, and responsive layout preferences.

---

### 4. CORE INVARIANT 1: ONE SHARED PUBLIC-WEB ENGINE (ZERO TENANT CODE FORKS)

- **Rule:** The platform operates **exactly one** shared public-web engine instance (`apps/public-web`).
- **Strict Prohibition:** There are NO per-tenant repositories, per-tenant deployments, Docker containers, Next.js server forks, or runtime code branching.
- **Architectural Implementation:**
  - A single, globally distributed web server handles all incoming traffic.
  - Every incoming HTTP request inspects the HTTP `Host` header.
  - The host header resolves to a unique `tenantId` via the multi-tenant domain resolver.
  - The shared application dynamically loads the tenant's published site bundle (theme, navigation, page blocks, vehicle showcase data) and renders the UI using standard component templates.
  - Styling is customized exclusively at runtime through CSS Custom Properties (`--brand-primary`, `--brand-accent`, `--font-heading`, `--font-body`) injected into the document root.

---

### 5. CORE INVARIANT 2: CMS CONTENT IS DATA, NOT EXECUTABLE CODE

- **Rule:** CMS content is strictly structured, schema-validated JSON data.
- **Strict Prohibition:** CMS content MUST NEVER contain arbitrary JavaScript, executable code, `eval()`, `<script>` tags, inline event handlers (`onclick`, `onload`), React JSX components, or unvetted raw HTML.
- **Architectural Implementation:**
  - Every content block conforms to a strict Zod schema definition.
  - Rich text fields are constrained to safe Markdown or sanitized HTML parsed through a strict whitelist sanitizer (permitting only `<b>`, `<i>`, `<u>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<a>` with `rel="noopener noreferrer"`).
  - All image references must resolve to valid, authenticated platform `MediaAsset` IDs or pre-approved public derivative URLs generated by Sprint 28.
  - The rendering engine utilizes pure React component templates that map typed JSON properties to presentation elements.

---

### 6. CORE INVARIANT 3: DRAFT STATE ISOLATION VS. CANONICAL PUBLISHED VERSION

- **Rule:** Public visitors must NEVER observe unverified, in-progress draft edits.
- **Strict Invariant:**
  - `DraftState`: The working copy modified by tenant operators in the Admin CMS. Draft changes are stored independently and are only viewable by authenticated tenant staff via preview sessions.
  - `PublishedSnapshot`: An immutable, frozen snapshot of the website configuration, theme, pages, blocks, and navigation created at the explicit moment of publication.
  - Public traffic serves strictly from the `PublishedSnapshot`.
  - Publishing is an atomic transactional operation: the system validates schema integrity, freezes the current draft into a versioned published snapshot, updates the active snapshot pointer, records an audit log, and invalidates the edge cache.
  - Rollback capability allows an operator to instantly revert to any previously published snapshot version without data loss.

---

### 7. CORE INVARIANT 4: FLEET & VEHICLE MASTER AUTHORITY (ZERO PRICING/AVAILABILITY DRIFT)

- **Rule:** The CMS NEVER duplicates or overrides master fleet truth.
- **Strict Invariant:**
  - The CMS does NOT store vehicle operational status, availability calendars, license plates, VINs, or base rental pricing rules.
  - The `VehiclePresentation` component acts strictly as a read-model presentation layer over the existing `Fleet` (Sprint 9), `Pricing` (Sprint 11), `Availability` (Sprint 12), and `Media` (Sprint 28) services.
  - The CMS configuration merely defines *presentation filters* (e.g., "Show Category: SUV", "Sort by: Display Priority", "Limit: 6 vehicles", "Featured Vehicle IDs: [...]", "Custom marketing badge: 'Most Popular'").
  - When rendering the vehicle catalogue, the public engine invokes `VehicleQueryService` to retrieve vehicles flagged as `isPublishedToWebsite = true`, with availability evaluated against real-time operational status and public media derivatives attached.

---

### 8. CORE INVARIANT 5: BOOKING EXECUTION BOUNDARY

- **Rule:** Sprint 29 owns vehicle presentation, search filters, and booking intent initiation; Sprint 31 owns complete public booking and checkout execution.
- **Sprint 29 Boundary:**
  - Implements the presentation of the booking search widget (pickup location, return location, pickup date/time, return date/time, vehicle category filter).
  - Implements vehicle selection and rental quotation calculation via the existing Sprint 11 Pricing Engine.
  - Directs customer booking intent to a clean contract abstraction (`PublicBookingDraft` or callback hook).
  - Sprint 31 will implement end-to-end guest customer identity verification, payment gateway execution (M-Pesa STK push / Stripe card checkout), security deposit pre-authorization, and reservation confirmation.

---

### 9. TENANT WEBSITE AGGREGATE & COMPLETE LIFECYCLE STATE MACHINE

The `TenantWebsite` aggregate lifecycle adheres to a deterministic finite state machine:

```
                  ┌──────────────┐
                  │ UNCONFIGURED │
                  └──────┬───────┘
                         │ initializeWebsite()
                         ▼
                  ┌──────────────┐
       ┌─────────►│    DRAFT     │◄────────┐
       │          └──────┬───────┘         │
       │                 │ publish()       │
       │                 ▼                 │
       │          ┌──────────────┐         │
       │ revert() │  PUBLISHED   │─────────┤ editDraft()
       │          └──┬─────────┬─┘         │
       │             │         │           │
       │  maintenance│         │ unpublish()
       │             ▼         ▼           │
       │      ┌─────────────┐ ┌────────────┴┐
       └──────┤ MAINTENANCE │ │   DRAFT     │
              └─────────────┘ └─────────────┘
```

- **States:**
  - `UNCONFIGURED`: Initial tenant state prior to CMS initialization.
  - `DRAFT`: Content edited, unsaved or unpublished; public engine renders a friendly "Website Coming Soon" placeholder if no prior version was published.
  - `PUBLISHED`: Active, public-facing canonical version rendered to public visitors.
  - `MAINTENANCE`: Operator-initiated temporary maintenance mode; public visitors receive a branded maintenance notice with contact details.
  - `ARCHIVED`: Website deactivated due to tenant suspension or cancellation (enforced via Sprint 8 Subscription Enforcement).

- **Lifecycle Operations:**
  - `createWebsite(tenantId, initialConfig)`
  - `updateDraftConfig(tenantId, configUpdates)`
  - `publishWebsite(tenantId, publishedByUserId, changeSummary)`
  - `unpublishWebsite(tenantId)`
  - `setMaintenanceMode(tenantId, enabled, maintenanceMessage)`
  - `rollbackToVersion(tenantId, snapshotVersionId)`

---

### 10. WEBSITE BRANDING & DYNAMIC THEME RESOLUTION ENGINE

The `WebsiteBranding` value object defines the visual identity of the tenant's public website:

- **Branding Fields:**
  - `logoMediaAssetId`: Reference to a verified `MediaAsset` (Sprint 28) with generated derivatives (`logo_light`, `logo_dark`).
  - `faviconMediaAssetId`: Reference to a 32x32 / 64x64 icon derivative.
  - `primaryColor`: Hex color code (e.g., `#059669`) with automated WCAG AA contrast calculation against white/black.
  - `secondaryColor`: Hex color code (e.g., `#0f172a`).
  - `accentColor`: Hex color code (e.g., `#f59e0b`).
  - `backgroundColor`: Light mode base neutral (`#ffffff` or `#f8fafc`).
  - `fontHeading`: Selected typography from an approved font registry (`Inter`, `Plus Jakarta Sans`, `Outfit`, `Playfair Display`, `Montserrat`).
  - `fontBody`: Body typography (`Inter`, `Plus Jakarta Sans`, `System Sans`).
  - `borderRadius`: UI roundness level (`none`: 0px, `sm`: 4px, `md`: 8px, `lg`: 12px, `full`: 9999px).
  - `buttonStyle`: Visual archetype (`solid`, `outline`, `soft`).

- **CSS Variable Injection:**
  The shared public-web engine transforms `WebsiteBranding` into scoped CSS custom properties at the document root:
  ```css
  :root {
    --brand-primary: #059669;
    --brand-primary-hover: #047857;
    --brand-primary-foreground: #ffffff;
    --brand-secondary: #0f172a;
    --brand-accent: #f59e0b;
    --brand-bg: #f8fafc;
    --brand-font-heading: 'Outfit', sans-serif;
    --brand-font-body: 'Plus Jakarta Sans', sans-serif;
    --brand-radius: 8px;
  }
  ```

---

### 11. CUSTOM DOMAIN MANAGEMENT & VERIFICATION LIFECYCLE

Operators can connect their own branded domain (e.g., `rentals.safarisun.com`) or apex domain (`safarisunrentals.com`):

- **Domain Entity Attributes:**
  - `id`: Unique domain mapping identifier.
  - `tenantId`: Tenant owner.
  - `hostname`: Normalized lowercase FQDN (e.g., `rentals.safarisun.com`).
  - `type`: `PLATFORM_SUBDOMAIN` | `CUSTOM_DOMAIN`.
  - `verificationStatus`: `PENDING_VERIFICATION` | `VERIFIED` | `FAILED` | `REVOKED`.
  - `verificationMethod`: `DNS_TXT` | `DNS_CNAME`.
  - `verificationToken`: Secure cryptographically random token (`ch-verify-` + 32-character hex).
  - `expectedTxtRecord`: `_carhireos-challenge.rentals.safarisun.com = ch-verify-...`
  - `expectedCnameRecord`: `rentals.safarisun.com -> cname.carhireos.com`
  - `sslStatus`: `INITIALIZING` | `ACTIVE` | `RENEWAL_PENDING` | `FAILED`.
  - `isPrimary`: Boolean designating the canonical domain for SEO canonical tags and redirects.
  - `verifiedAt`: ISO timestamp of successful verification.

- **Verification Lifecycle:**
  1. Operator registers custom domain in Tenant Admin CMS.
  2. System generates verification token and provides exact DNS instructions.
  3. Operator configures DNS CNAME and TXT challenge at their DNS registrar.
  4. Operator triggers "Verify DNS" (or background worker polls).
  5. System resolves DNS records via `dns.promises.resolveTxt()` and `dns.promises.resolveCname()`.
  6. Upon match, domain status transitions to `VERIFIED`, SSL provisioning is initiated, and the domain mapping is activated.

---

### 12. MULTI-TENANT HOST ROUTING & DOMAIN RESOLUTION ENGINE

The domain resolution engine is responsible for resolving every public HTTP request to its owning tenant:

- **Resolution Precedence:**
  1. **Exact Custom Domain Match:** Query `WebsiteDomain` where `hostname = request.host` and `verificationStatus = 'VERIFIED'`.
  2. **Platform Subdomain Match:** If `request.host` ends with `.carhireos.com` (or configured platform domain), extract prefix `{subdomain}` and query `TenantWebsite` where `subdomain = prefix`.
  3. **Development / Preview Header Fallback:** If running in local or staging environment (`NODE_ENV !== 'production'`), accept `x-tenant-id` or `?tenantId=` query param for authenticated tenant preview.
  4. **Fallback:** If no mapping matches, return HTTP 404 with a generic platform landing page ("Storefront Not Found").

- **Edge Resolution Caching:**
  - Domain-to-tenant mappings are cached in-memory / Redis with a 5-minute TTL.
  - When a domain is added, updated, or removed, a cache invalidation event clears the lookup cache.

---

### 13. WEBPAGE AGGREGATE & HIERARCHICAL SLUG MANAGEMENT

- **WebPage Schema:**
  - `id`: Unique page identifier.
  - `websiteId`: Owning `TenantWebsite` ID.
  - `tenantId`: Scoped tenant isolation ID.
  - `slug`: Normalized URL path segment (e.g., `/`, `fleet`, `about-us`, `contact`, `terms-and-conditions`).
  - `title`: Internal and display title.
  - `pageType`: `HOME` | `FLEET_CATALOGUE` | `ABOUT` | `CONTACT` | `CUSTOM` | `LEGAL`.
  - `isStandardPage`: Boolean indicating core system pages that cannot be deleted (e.g., Home, Fleet).
  - `status`: `DRAFT` | `PUBLISHED` | `ARCHIVED`.
  - `displayOrder`: Integer order for navigation positioning.
  - `seoConfig`: Page-specific meta title, meta description, and social share image.
  - `contentBlocks`: Ordered array of `ContentBlock` items.
  - `publishedVersion`: Snapshot version number when published.

- **Slug Invariants:**
  - Slugs must be unique per `websiteId`.
  - Root path `/` is reserved for the `HOME` page.
  - `/fleet` (or `/vehicles`) is reserved for the `FLEET_CATALOGUE` page.
  - Slugs are strictly validated: lowercase alphanumeric characters and hyphens only (`^[a-z0-9]+(?:-[a-z0-9]+)*$`).

---

### 14. CONTENT BLOCK SCHEMA & COMPONENT TAXONOMY

Each page is constructed from an ordered list of modular, typed content blocks:

1. **`HERO` Block:**
   - Headline, subheadline, background image (media asset ref), primary CTA button (label, link), secondary CTA button, search widget toggle.
2. **`VEHICLE_SHOWCASE` Block:**
   - Section heading, subtitle, category filter tabs, vehicle count limit, display layout (`GRID_3`, `GRID_4`, `CAROUSEL`), sort order (`PRICE_ASC`, `POPULARITY`, `FEATURED`).
3. **`FEATURE_GRID` Block:**
   - Section title, 3 to 6 value proposition items (icon name from approved Lucide list, title, description).
4. **`TEXT_IMAGE` Block:**
   - Two-column layout (editorial story + image), image alignment (`LEFT` | `RIGHT`), rich text content, optional button.
5. **`TESTIMONIALS` Block:**
   - Customer quotes, author name, rating (1-5 stars), author avatar image.
6. **`FAQ` Block:**
   - Accordion of questions and answers regarding rental policies, required documents, deposits, and insurance.
7. **`CONTACT_INFO` Block:**
   - Physical branch address, Google Maps coordinate embed, phone, WhatsApp direct link, email, operating hours.
8. **`CALL_TO_ACTION` (CTA) Block:**
   - High-impact banner with compelling offer, urgency copy, and button link.

---

### 15. CONTENT SANITIZATION, SAFE HTML HANDLING & STRICT XSS PREVENTION

To guarantee complete immunity from stored Cross-Site Scripting (XSS) and code injection:

- **Validation at Ingestion:**
  - All block payloads are parsed through strict Zod schemas before persistence.
  - Block payloads disallow additional undeclared properties (`strip` or `strict`).
- **Sanitization Strategy:**
  - Text inputs intended for plain text (headlines, button labels, titles) are stripped of all HTML tags via regex / sanitizer.
  - Rich text fields (e.g., Terms, About narrative) are processed through an HTML sanitizer with a restrictive whitelist:
    - Allowed tags: `p`, `b`, `i`, `strong`, `em`, `u`, `ul`, `ol`, `li`, `br`, `a`.
    - Allowed attributes: `a.href` (strictly HTTP/HTTPS protocols, blocking `javascript:`), `a.target`, `a.rel="noopener noreferrer"`.
    - Stripped tags: `script`, `iframe`, `object`, `embed`, `style`, `link`, `svg`, `img`, `form`, `input`.
    - Stripped attributes: `style`, all `on*` event handlers (`onclick`, `onerror`, etc.).
- **Safe React Rendering:**
  - Standard blocks render plain text directly via React JSX (`{block.headline}`), ensuring standard escaping.
  - Rich text blocks render sanitized HTML only via dedicated sanitization components.

---

### 16. NAVIGATION MENUS & SITE TOPOLOGY ARCHITECTURE

The website navigation defines how visitors traverse the storefront:

- **Navigation Aggregate Structure:**
  - `headerNavigation`: Primary top-bar menu items.
  - `footerNavigation`: Footer columns (e.g., "Company", "Fleet", "Legal", "Support").
- **Navigation Item Schema:**
  - `id`: Item identifier.
  - `label`: Display text (e.g., "Our Fleet", "Airport Transfers", "Contact Us").
  - `type`: `INTERNAL_PAGE` | `EXTERNAL_URL` | `CATEGORY_FILTER` | `ANCHOR`.
  - `pageId`: Optional reference to a `WebPage` ID (dynamically resolves the current slug).
  - `url`: Absolute external URL or relative anchor.
  - `target`: `_self` | `_blank`.
  - `sortOrder`: Sequence integer.
  - `children`: Optional nested submenu items (max depth: 2).

---

### 17. VEHICLE PRESENTATION & CATALOGUE SHOWCASE ENGINE

The vehicle catalogue bridge links fleet inventory to public presentation:

- **Fleet Read-Model Integration:**
  - Invokes `VehicleQueryService` filtering on `tenantId = activeTenantId`, `isPublishedToWebsite = true`, and operational status `ACTIVE`.
  - Retrieves vehicle specification details: make, model, year, transmission (`AUTOMATIC` | `MANUAL`), fuel type (`PETROL`, `DIESEL`, `ELECTRIC`, `HYBRID`), seats, doors, luggage capacity, air conditioning, and feature badges.
- **Dynamic Pricing Presentation:**
  - Evaluates standard daily rate for display (`from KES 7,500 / day`).
  - Calls `PricingCalculationService` to compute transparent rental estimates for customer-selected date ranges.
- **Media Derivative Integration:**
  - Fetches vehicle image derivatives generated by Sprint 28:
    - Primary card thumbnail: `card_thumbnail` (600x400 WebP).
    - Detail gallery: `gallery_detail` (1200x800 WebP).
  - Fallback placeholder if no vehicle media has been processed yet.

---

### 18. INTEGRATION WITH SPRINT 28 MEDIA & DERIVATIVE PIPELINES

Sprint 29 leverages Sprint 28 media architecture across all visual touchpoints:

- **Asset Associations:**
  - `WebsiteBranding.logoMediaAssetId` -> `MediaAsset` with `profile = "BRAND_LOGO"`.
  - `WebsiteBranding.faviconMediaAssetId` -> `MediaAsset` with `profile = "BRAND_FAVICON"`.
  - `ContentBlock.heroImageMediaAssetId` -> `MediaAsset` with `profile = "WEBSITE_HERO"`.
  - `VehicleMedia` -> `MediaAsset` with `profile = "VEHICLE_SHOWCASE"`.
- **Responsive Derivative Resolution:**
  - The public rendering engine does NOT serve master raw image uploads.
  - It resolves responsive `<picture>` tags utilizing public derivatives generated by `MediaDerivativeRepository`:
    - AVIF/WebP formats with appropriate `srcset` (mobile 400w, tablet 800w, desktop 1600w).
- **Public Visibility Enforcement:**
  - Validates that media referenced on the public website is marked with `visibility = 'PUBLIC'` and associated with verified derivatives.

---

### 19. SEO ENGINE, OPENGRAPH METADATA & STRUCTURED DATA

Every published website automatically generates rich SEO and social sharing metadata:

- **Standard Meta Tags:**
  - `<title>{pageTitle} | {tenantCompanyName}</title>`
  - `<meta name="description" content="{metaDescription}">`
  - `<link rel="canonical" href="https://{primaryDomain}{pageSlug}">`
- **OpenGraph & Twitter Card Tags:**
  - `og:site_name`, `og:title`, `og:description`, `og:url`, `og:type = 'website'`.
  - `og:image`: Resolves to the tenant's configured social share image derivative (1200x630 WebP).
  - `twitter:card = 'summary_large_image'`.
- **JSON-LD Structured Data:**
  - Injects schema.org compliant JSON-LD:
    - **`AutoRental` Schema:** Name, logo, address, telephone, priceRange, openingHoursSpecification, currenciesAccepted.
    - **`Car` / `Vehicle` Schema (on catalogue view):** Model, manufacturer, vehicleConfiguration, numberOfDoors, seatingCapacity, fuelType, offers (price, priceCurrency, availability).
    - **`BreadcrumbList` Schema:** Breadcrumb navigation trail.

---

### 20. DYNAMIC SITEMAP.XML AND ROBOTS.TXT GENERATION

The public engine dynamically serves search engine crawlers:

- **`/robots.txt` Route:**
  - Evaluates whether the website is in `PUBLISHED` state.
  - If published, outputs:
    ```
    User-agent: *
    Allow: /
    Disallow: /api/
    Disallow: /preview/
    Sitemap: https://{primaryDomain}/sitemap.xml
    ```
  - If in `DRAFT` or `MAINTENANCE`, outputs `Disallow: /` to prevent indexing of staging or maintenance pages.
- **`/sitemap.xml` Route:**
  - Queries all published pages for the tenant.
  - Generates valid XML listing `<url>` nodes with `<loc>`, `<lastmod>`, `<changefreq>`, and `<priority>` (e.g., home = 1.0, fleet = 0.9, content = 0.7).

---

### 21. SHARED PUBLIC-WEB RENDERING ENGINE ARCHITECTURE (`apps/public-web`)

The public storefront frontend is structured cleanly within `apps/public-web`:

- **Component Hierarchy:**
  - `PublicWebsiteView`: Master shell component resolving tenant context, theme injection, top announcement banner, header, dynamic page router, and footer.
  - `ThemeInjector`: Dynamic `<style>` element binding CSS custom properties derived from `WebsiteBranding`.
  - `BlockRenderer`: Pattern-matching component dispatcher that renders the appropriate React component for each `ContentBlock` item.
  - `CatalogueView`: Vehicle inventory explorer with category filters, sorting, search bar, vehicle cards, and specifications modal.
  - `SearchWidget`: Booking search bar (pickup/return dates, times, locations) triggering fleet search.
  - `MaintenanceBanner`: Friendly maintenance notification displayed when website is in maintenance mode.

---

### 22. TENANT ADMIN CMS MANAGEMENT EXPERIENCE (`apps/tenant-admin`)

Tenant operators manage their website through an intuitive, visual CMS desk:

- **CMS Desk Sections:**
  - **Site Overview:** Current status (`DRAFT` / `PUBLISHED`), last publish timestamp, live site URL, quick actions (Publish, Preview, Unpublish, Maintenance).
  - **Branding & Identity:** Logo uploader (integrated with Sprint 28 media upload), color picker (primary, secondary, accent) with instant contrast preview, typography selector.
  - **Page Builder:** Visual list of pages, add page dialog, re-order pages, block builder with live editing of headlines, content, and imagery.
  - **Navigation Manager:** Drag-and-drop hierarchy builder for header and footer menus.
  - **Domain Settings:** Subdomain configuration (`{subdomain}.carhireos.com`), custom domain registration, DNS verification checker with real-time status.
  - **SEO & Social:** Global meta title, meta description, favicon, social share banner preview.

---

### 23. PUBLIC WEB STOREFRONT EXPERIENCE & CUSTOMER JOURNEY FLOW

The public customer journey is fast, intuitive, and conversion-focused:

1. **Discovery & Arrival:** Customer visits `rentals.safarisun.com` (or platform subdomain). Host resolution loads branded site within milliseconds.
2. **Hero Engagement:** Customer views operator's value proposition, hero visuals, and search bar.
3. **Date & Location Search:** Customer inputs pickup date/time, return date/time, and preferred branch.
4. **Catalogue Browsing:** Customer browses available vehicles, filters by category (SUV, Sedan, Van, Luxury), compares specifications, and views pricing.
5. **Vehicle Selection:** Customer selects a vehicle, inspects detailed specifications and high-res image gallery.
6. **Booking Initiation:** Customer clicks "Book Now", transitioning to the booking reservation flow (Sprint 31 execution).

---

### 24. REST API ENDPOINTS & CONTRACTS (`packages/contracts`)

The API surface is cleanly separated into Public (unauthenticated) and Tenant Admin (authenticated) endpoints:

#### Public Endpoints (`apps/api/src/modules/website/presentation/public-website.controller.ts`)
- `GET /api/v1/public/website/resolve`: Resolves tenant website configuration by incoming `host` header.
- `GET /api/v1/public/website/pages/:slug`: Fetches a published page by slug for the resolved tenant.
- `GET /api/v1/public/website/vehicles`: Returns the published vehicle catalogue with media derivatives and calculated base rates.
- `GET /api/v1/public/website/sitemap.xml`: Generates XML sitemap.
- `GET /api/v1/public/website/robots.txt`: Generates robots.txt.

#### Tenant Admin Endpoints (`apps/api/src/modules/website/presentation/tenant-website.controller.ts`)
- `GET /api/v1/tenant/website`: Retrieves full website aggregate (draft configuration, published status, domains).
- `PUT /api/v1/tenant/website/branding`: Updates branding theme configuration.
- `POST /api/v1/tenant/website/pages`: Creates a new page.
- `PUT /api/v1/tenant/website/pages/:pageId`: Updates page metadata and content blocks.
- `DELETE /api/v1/tenant/website/pages/:pageId`: Deletes a non-standard page.
- `POST /api/v1/tenant/website/publish`: Atomically publishes current draft into a new version snapshot.
- `POST /api/v1/tenant/website/maintenance`: Toggles maintenance mode.
- `POST /api/v1/tenant/website/domains`: Adds a custom domain.
- `POST /api/v1/tenant/website/domains/:domainId/verify`: Triggers DNS verification.
- `DELETE /api/v1/tenant/website/domains/:domainId`: Removes a custom domain.

---

### 25. DOMAIN EVENTS, OUTBOX RELAY & AUDIT TRAIL ARCHITECTURE

All state changes publish canonical domain events to the `OutboxRepository` (Sprint 24):

- **Domain Events:**
  - `WebsiteCreatedEvent`: Emitted when website is initialized.
  - `WebsiteDraftUpdatedEvent`: Emitted when draft content or branding changes.
  - `WebsitePublishedEvent`: Emitted when draft is published. Triggers CDN cache invalidation and search index notification.
  - `WebsiteUnpublishedEvent`: Emitted when website is unpublished.
  - `WebsiteMaintenanceModeToggledEvent`: Emitted when maintenance mode changes.
  - `DomainRegisteredEvent`: Emitted when custom domain is registered.
  - `DomainVerifiedEvent`: Emitted when custom domain DNS verification succeeds. Triggers SSL provisioning job.
  - `DomainRemovedEvent`: Emitted when custom domain is deleted.
- **Audit Logging:**
  - Every publication, rollback, and domain modification records an audit trail record capturing `userId`, `tenantId`, `timestamp`, `action`, and `changeSummary`.

---

### 26. SECURITY ARCHITECTURE, RBAC PERMISSIONS & TENANT ISOLATION

Strict adherence to SEC-001 and TEN-001:

- **RBAC Permissions (`packages/constants`):**
  - `website:view`: View website configuration and drafts (Operator, Marketing).
  - `website:manage`: Edit draft content, pages, blocks, and branding.
  - `website:publish`: Publish site changes or toggle maintenance mode (Admin, Owner).
  - `website:domain:manage`: Register and verify custom domains (Admin, Owner).
- **Tenant Isolation:**
  - All admin queries strictly enforce `tenantId = ctx.tenantId`.
  - Public queries strictly enforce `tenantId = resolvedTenant.id`.
  - In-memory and Prisma repositories reject any query missing a valid tenant scope.
- **Zero Public State Mutation:**
  - Public endpoints are strictly read-only (`GET` only). No state mutations can be triggered from public routes.

---

### 27. PUBLIC API RATE LIMITING, CACHING & PERFORMANCE OPTIMIZATION

- **Rate Limiting:**
  - Public resolution endpoints are protected by IP-based rate limiting (e.g., max 120 requests/minute per client IP) to prevent denial-of-service or scraping attacks.
- **HTTP Cache Headers:**
  - Published page responses include `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400`.
  - Responses include `ETag` headers based on the active `publishedVersion` snapshot ID.
- **Fast Dynamic Fallbacks:**
  - If a visitor requests a non-existent page slug, the API returns a structured 404 response without leaking internal stack traces or database errors.

---

### 28. DATABASE SCHEMA & RELATIONAL PERSISTENCE MODELING (`packages/database`)

The domain entities are modeled for persistence in PostgreSQL / Prisma:

- **`TenantWebsiteEntity`:**
  - `id` (UUID PK), `tenantId` (UUID FK unique), `subdomain` (VARCHAR unique), `status` (VARCHAR), `activeSnapshotId` (UUID nullable), `maintenanceMessage` (TEXT nullable), `createdAt`, `updatedAt`.
- **`WebsiteBrandingEntity`:**
  - `id` (UUID PK), `websiteId` (UUID FK), `tenantId` (UUID FK), `logoMediaAssetId` (UUID nullable), `faviconMediaAssetId` (UUID nullable), `primaryColor` (VARCHAR), `secondaryColor` (VARCHAR), `accentColor` (VARCHAR), `fontHeading` (VARCHAR), `fontBody` (VARCHAR), `borderRadius` (VARCHAR), `buttonStyle` (VARCHAR).
- **`WebPageEntity`:**
  - `id` (UUID PK), `websiteId` (UUID FK), `tenantId` (UUID FK), `slug` (VARCHAR), `title` (VARCHAR), `pageType` (VARCHAR), `isStandardPage` (BOOLEAN), `status` (VARCHAR), `displayOrder` (INT), `seoConfig` (JSONB), `contentBlocks` (JSONB), `version` (INT), `createdAt`, `updatedAt`.
- **`WebsiteDomainEntity`:**
  - `id` (UUID PK), `tenantId` (UUID FK), `websiteId` (UUID FK), `hostname` (VARCHAR unique), `type` (VARCHAR), `verificationStatus` (VARCHAR), `verificationToken` (VARCHAR), `sslStatus` (VARCHAR), `isPrimary` (BOOLEAN), `verifiedAt` (TIMESTAMP nullable), `createdAt`, `updatedAt`.
- **`WebsiteSnapshotEntity`:**
  - `id` (UUID PK), `websiteId` (UUID FK), `tenantId` (UUID FK), `versionNumber` (INT), `snapshotData` (JSONB - complete serialized site snapshot), `publishedByUserId` (UUID), `changeSummary` (VARCHAR), `publishedAt` (TIMESTAMP).

---

### 29. IN-MEMORY REPOSITORY IMPLEMENTATIONS & SEED STATES

To enable lightning-fast, zero-dependency unit and integration testing:

- **Repository Implementations:**
  - `InMemoryTenantWebsiteRepository`: Implements `ITenantWebsiteRepository`.
  - `InMemoryWebPageRepository`: Implements `IWebPageRepository`.
  - `InMemoryWebsiteDomainRepository`: Implements `IWebsiteDomainRepository`.
  - `InMemoryWebsiteSnapshotRepository`: Implements `IWebsiteSnapshotRepository`.
- **Seed States:**
  - Seed initial website aggregate with default branding, standard pages (`/` Home, `/fleet` Fleet, `/about` About, `/contact` Contact), standard content blocks, and `{tenantSlug}.carhireos.com` subdomain.

---

### 30. ERROR HANDLING HIERARCHY, DOMAIN EXCEPTIONS & HTTP STATUS MAPPINGS

Domain exceptions in `website.errors.ts` map cleanly to HTTP status codes:

- `WebsiteNotFoundError` -> 404 Not Found
- `WebPageNotFoundError` -> 404 Not Found
- `DuplicatePageSlugError` -> 409 Conflict ("A page with this slug already exists.")
- `StandardPageDeletionError` -> 400 Bad Request ("Standard system pages cannot be deleted.")
- `DomainAlreadyRegisteredError` -> 409 Conflict ("This domain is already registered.")
- `DomainVerificationFailedError` -> 422 Unprocessable Entity ("DNS challenge records not detected.")
- `InvalidContentBlockSchemaError` -> 400 Bad Request ("Content block does not conform to schema.")
- `WebsiteUnpublishedError` -> 404 Not Found ("This tenant website has not been published.")
- `CrossTenantWebsiteAccessViolationError` -> 403 Forbidden ("Access denied to foreign tenant website.")

---

### 31. CROSS-DOMAIN SERVICE INTEGRATIONS

Sprint 29 cleanly coordinates with existing platform domains:

- **Fleet Domain (Sprint 9):**
  - Consumes `VehicleQueryService` to query vehicles with `isPublishedToWebsite = true`.
- **Pricing Domain (Sprint 11):**
  - Consumes `PricingCalculationService` to compute transparent, real-time rental estimates for storefront date ranges.
- **Media Domain (Sprint 28):**
  - Consumes `MediaQueryService` to resolve public derivative URLs for vehicle cards, gallery carousels, logos, and hero banners.
- **Tenancy Domain (Sprint 4):**
  - Consumes `TenantService` to retrieve tenant legal company name, default currency, contact phone, and operating branches.
- **Subscription Enforcement (Sprint 8):**
  - Verifies tenant entitlement for custom domains (`feature: custom_domain`) prior to domain activation.

---

### 32. TEST SUITE ARCHITECTURE & VERIFICATION STRATEGY (`packages/database/test`)

A dedicated, comprehensive integration test suite will be created at:
`/packages/database/test/tenant-website-cms-and-branding.test.ts`

- **Execution Command:** Added to root `package.json` as `"test:website": "tsx packages/database/test/tenant-website-cms-and-branding.test.ts"`.
- **Execution Target:** 100% passing tests covering the entire domain lifecycle, edge cases, error conditions, and multi-tenant isolation.

---

### 33. DETAILED STEP-BY-STEP TEST SCENARIOS & ASSERTION MATRIX

The test suite executes 10 focused test suites verifying all core requirements:

1. **Website Initialization & Defaults:** Verify aggregate creation with standard pages (Home, Fleet, About, Contact), default branding colors, and assigned platform subdomain.
2. **Draft Content Mutation & Schema Validation:** Verify adding, updating, and reordering content blocks; verify rejection of invalid block types or malformed payloads.
3. **Draft vs. Published Snapshot Isolation:** Verify that draft mutations do NOT affect public-facing responses until `publishWebsite()` is called.
4. **Atomic Publication & Version Snapshotting:** Verify publication freezes the draft into an immutable snapshot, increments version number, updates active pointer, and emits `WebsitePublishedEvent`.
5. **Rollback Capability:** Verify rolling back to a previous snapshot restores published state cleanly.
6. **Multi-Tenant Host Resolution:** Verify host routing via platform subdomain (`alpha.carhireos.com`), verified custom domain (`rentals.alphacars.com`), and fallback 404 for unknown hosts.
7. **Custom Domain Verification Lifecycle:** Verify domain registration, TXT/CNAME token generation, simulated DNS verification, status transition to `VERIFIED`, and rejection of unverified domains.
8. **Fleet & Vehicle Presentation Integration:** Verify that only `isPublishedToWebsite = true` vehicles are returned, with calculated daily rates and public media derivatives attached.
9. **XSS Sanitization & Security Protection:** Verify that malicious `<script>` tags, inline handlers, and foreign protocols are stripped from rich text and block headlines.
10. **Cross-Tenant Security Isolation:** Verify that Tenant A cannot inspect, edit, publish, or delete Tenant B's website, pages, or domains.

---

### 34. EXPLICITLY DEFERRED SCOPE & SPRINT BOUNDARIES

To maintain razor-sharp scope discipline:

- **Deferred to Sprint 30 (Customer Portal & Profile Management):**
  - Customer login/signup on the public storefront.
  - Customer booking history, profile management, and driving license re-verification.
- **Deferred to Sprint 31 (Public Booking & Payment Execution):**
  - End-to-end guest booking checkout flow.
  - Live M-Pesa STK push and Stripe payment processing on public storefront.
  - Security deposit pre-authorization capture.
  - Real-time booking reservation confirmation emails and PDF vouchers.

---

### 35. IMPLEMENTATION ROADMAP & EXECUTION SEQUENCING

The implementation of Sprint 29 will proceed in 6 clean, verified stages:

- **Stage 1 (Domain Models & Types):** Extend `packages/types` with complete `TenantWebsite`, `WebPage`, `ContentBlock`, `WebsiteBranding`, `WebsiteDomain`, and `WebsiteSnapshot` contracts.
- **Stage 2 (Persistence & Repositories):** Implement `TenantWebsiteRepository`, `WebPageRepository`, `WebsiteDomainRepository`, and `WebsiteSnapshotRepository` in `packages/database`.
- **Stage 3 (Application Services & Business Logic):** Build `TenantWebsiteService`, `WebPageService`, `DomainVerificationService`, and `PublicWebsiteQueryService` in `apps/api/src/modules/website`.
- **Stage 4 (API Controllers & Contracts):** Define REST routes and Zod request/response contracts for public and tenant admin access.
- **Stage 5 (Shared Public-Web & Admin UI):** Upgrade `apps/public-web` and `src/components/PublicWebsiteView.tsx` with dynamic theme injection, block rendering, and full CMS desk controls.
- **Stage 6 (Verification & Test Suite):** Execute test suite (`npm run test:website`), verify `compile_applet` and `lint_applet`.

---

**End of Pre-Implementation Assessment**
