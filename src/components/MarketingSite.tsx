import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck2,
  CarFront,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Code2,
  CreditCard,
  FileCheck2,
  Gauge,
  Globe2,
  Headphones,
  KeyRound,
  Layers3,
  LifeBuoy,
  LineChart,
  LockKeyhole,
  Menu,
  Network,
  ReceiptText,
  Route,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Wrench,
  X,
  Zap,
} from "lucide-react";

type PageDefinition = {
  eyebrow: string;
  title: string;
  description: string;
  outcomes: string[];
  capabilities: string[];
  cta?: string;
};

const productPages: Record<string, PageDefinition> = {
  "fleet": {
    eyebrow: "Fleet control",
    title: "Know what every vehicle is doing—and what it needs next.",
    description: "Turn your fleet from a collection of records into an operating asset base. Sage Auto connects vehicle identity, ownership, availability, compliance, maintenance, inspections and media around one vehicle truth.",
    outcomes: ["See rentable, blocked and unavailable vehicles clearly", "Reduce missed compliance and maintenance work", "Keep ownership and vehicle economics attached to the right asset", "Give every team the same vehicle history"],
    capabilities: ["Vehicle register and asset profiles", "Ownership records and commercial terms", "Availability state and operational blockers", "Compliance documents and expiry controls", "Maintenance schedules and work orders", "Inspection and damage history", "Vehicle media and customer-facing publication"],
  },
  "customers-drivers": {
    eyebrow: "Customer & driver operations",
    title: "Move renters from enquiry to approved driver without rebuilding their record every time.",
    description: "Keep customers, drivers, documents, eligibility and rental history connected so teams can serve repeat customers faster and make safer handover decisions.",
    outcomes: ["Shorten repeat-customer processing", "Reduce duplicated customer and driver records", "Keep licence and identity evidence close to the booking", "Give operations a cleaner view of customer history"],
    capabilities: ["Customer profiles", "Driver records and eligibility", "Party documents", "Corporate accounts", "Booking and rental history", "Role-aware access to customer data"],
  },
  "pricing": {
    eyebrow: "Pricing control",
    title: "Quote consistently without giving away margin.",
    description: "Build rate plans and pricing rules once, then use the same commercial logic across quotes, bookings and customer channels.",
    outcomes: ["Reduce manual rate mistakes", "Protect pricing consistency across staff and channels", "Respond to enquiries faster", "Preserve the commercial snapshot behind each booking"],
    capabilities: ["Rate plans", "Pricing rules", "Duration-aware calculations", "Discount and promotion controls", "Deposits and taxes", "Immutable pricing snapshots"],
  },
  "availability": {
    eyebrow: "Availability",
    title: "Sell the car you can actually deliver.",
    description: "Make availability a live operational decision—not a spreadsheet guess. Sage Auto evaluates reservations, allocations and vehicle blocks before a booking is committed.",
    outcomes: ["Reduce double-booking risk", "See why a vehicle cannot be sold", "Improve utilization without losing operational control", "Give sales and operations one availability answer"],
    capabilities: ["Real-time availability checks", "Vehicle allocations", "Operational blocks", "Date-range conflict detection", "Candidate vehicle evaluation", "Booking readiness signals"],
  },
  "bookings": {
    eyebrow: "Booking operations",
    title: "Turn enquiries into confirmed rentals with less chasing.",
    description: "Move from quote to reservation, confirmation and fulfilment in a connected workflow that preserves pricing, customer, vehicle and readiness context.",
    outcomes: ["Move bookings forward with clear next actions", "Keep commercial promises visible to operations", "Reduce handoff gaps between sales and fleet teams", "Give customers a more dependable booking journey"],
    capabilities: ["Booking registration", "Quotes and pricing snapshots", "Lifecycle states", "Amendments and substitutions", "Readiness checks", "Public booking integration"],
  },
  "contracts-handover": {
    eyebrow: "Contract & handover",
    title: "Start every rental with the commercial and physical truth aligned.",
    description: "Connect the confirmed booking to a versioned contract, pre-rental inspection and handover so the vehicle only goes on-road when the required evidence is in place.",
    outcomes: ["Reduce ambiguous handovers", "Create a defensible start-of-rental record", "Keep contract versions tied to the booking", "Make missing prerequisites visible before release"],
    capabilities: ["Versioned rental contracts", "Contract terms snapshots", "Pre-rental inspection dependency", "Handover workflow", "Start odometer and fuel evidence", "Rental readiness boundary"],
  },
  "rentals": {
    eyebrow: "On-road rental control",
    title: "Stay in control after the keys leave the desk.",
    description: "Track active rentals, extensions, incidents and return expectations around the same record used by bookings and finance.",
    outcomes: ["Know which vehicles are on-road and when they are due", "Handle extensions without losing the original agreement", "Connect incidents to the correct rental", "Give operations a reliable active-rental picture"],
    capabilities: ["Rental lifecycle", "Start snapshots", "Scheduled and actual return tracking", "Extensions", "Incident linkage", "Status history"],
  },
  "returns-inspections": {
    eyebrow: "Returns & inspections",
    title: "Close rentals with evidence, not memory.",
    description: "Capture the physical return, compare inspection condition, calculate final charges and create the financial truth needed to close the rental.",
    outcomes: ["Reduce disputes over vehicle condition", "Catch damage and return variances consistently", "Create auditable final calculations", "Move completed rentals cleanly into finance"],
    capabilities: ["Return records", "Post-rental inspections", "Inspection comparison", "Damage capture", "Final calculation", "Return-to-finance handoff"],
  },
  "maintenance": {
    eyebrow: "Maintenance",
    title: "Keep revenue vehicles available without waiting for breakdowns.",
    description: "Plan preventive work, record defects and connect maintenance costs back to vehicles and financial reporting.",
    outcomes: ["See upcoming maintenance before it becomes downtime", "Keep work history on the vehicle", "Separate owner-deductible and company costs", "Understand the operational cost of each asset"],
    capabilities: ["Maintenance schedules", "Work orders", "Due calculations", "Service-provider records", "Maintenance expense ingestion", "Vehicle maintenance history"],
  },
  "compliance": {
    eyebrow: "Compliance",
    title: "Make expiry risk visible before it stops a vehicle.",
    description: "Track required records and continuous coverage so compliance becomes an operating control rather than an end-of-month scramble.",
    outcomes: ["Surface expiring requirements earlier", "Block unsafe or non-compliant operations when necessary", "Keep evidence tied to the right vehicle", "Give managers a readiness view"],
    capabilities: ["Compliance requirements", "Document records", "Expiry monitoring", "Readiness evaluation", "Overrides with governance", "Coverage history"],
  },
  "payments": {
    eyebrow: "Payments",
    title: "Collect money without losing the audit trail.",
    description: "Connect payment attempts, verification, allocation, refunds and provider references so every payment has an operational purpose and a financial destination.",
    outcomes: ["Reconcile collections more cleanly", "Reduce unallocated payment confusion", "Support M-Pesa and card payment journeys", "Keep refunds controlled and traceable"],
    capabilities: ["Payment attempts", "Provider verification", "M-Pesa integration boundary", "Card provider boundary", "Payment allocation", "Refund lifecycle", "Webhook verification"],
  },
  "finance": {
    eyebrow: "Finance",
    title: "Know what was earned, collected, owed and spent.",
    description: "Turn completed operations into invoices, expenses, deposits, credit notes and ledger-ready financial events without rebuilding the story in another system.",
    outcomes: ["See outstanding customer balances", "Keep deposits separate from revenue", "Connect operating expenses to vehicles and rentals", "Create a stronger month-end trail"],
    capabilities: ["Operational invoices", "Deposits", "Credit notes", "Expenses", "Receivable balances", "Ledger posting contracts", "Reconciliation boundaries"],
  },
  "owner-settlements": {
    eyebrow: "Owner settlements",
    title: "Pay vehicle owners from explainable numbers.",
    description: "Calculate, review and pay owner obligations from rental and cost data while preserving disputes, adjustments and approvals.",
    outcomes: ["Reduce owner payout disputes", "Show how a settlement was calculated", "Separate payable approval from payout execution", "Track owner economics over time"],
    capabilities: ["Settlement periods", "Calculation batches", "Owner statements", "Payables", "Disputes and adjustments", "Payout workflow", "Vehicle profitability"],
  },
  "crm": {
    eyebrow: "CRM",
    title: "Keep demand moving until it becomes a booking.",
    description: "Capture leads, activities, tasks and sales quotes around the same customer and pricing engine that operations will eventually fulfil.",
    outcomes: ["Reduce forgotten enquiries", "Give sales a visible pipeline", "Turn qualified demand into bookings with less re-entry", "Keep follow-up ownership clear"],
    capabilities: ["Lead pipeline", "Activities", "Tasks", "Sales quotes", "Quote versions", "Customer linkage"],
  },
  "analytics": {
    eyebrow: "Analytics",
    title: "Make decisions from operating data, not end-of-month guesses.",
    description: "Bring utilization, revenue, outstanding balances, maintenance, owner economics and platform activity into reusable reports and decision views.",
    outcomes: ["Spot underused assets", "See where cash is stuck", "Compare vehicle economics", "Give managers a shared performance view"],
    capabilities: ["Operational dashboards", "Reporting projections", "Saved reports", "Scheduled reporting", "Exports", "Profitability views"],
  },
  "websites": {
    eyebrow: "Customer websites",
    title: "Turn your fleet into a direct booking channel.",
    description: "Publish a branded rental website connected to real vehicle records, pricing and public booking flows—so marketing and operations stop living in separate worlds.",
    outcomes: ["Capture direct booking demand", "Publish only the vehicles you intend customers to see", "Connect quotes to your operating system", "Reduce re-entry from website enquiry to booking"],
    capabilities: ["Tenant website CMS", "Branding", "Published vehicle catalogue", "Public quotes", "Guest checkout", "Custom-domain architecture"],
  },
  "automation": {
    eyebrow: "Automation",
    title: "Let routine operating work happen without becoming invisible.",
    description: "Use events, workers, notifications and scheduled jobs to move repetitive processes while keeping retries, auditability and human control.",
    outcomes: ["Reduce manual follow-up", "Surface time-sensitive work earlier", "Keep background work observable", "Automate without bypassing business rules"],
    capabilities: ["Event outbox", "Background workers", "Scheduled jobs", "Notifications", "Retry handling", "Operational audit trail"],
  },
};

const solutionPages: Record<string, PageDefinition> = {
  "rental-companies": {
    eyebrow: "For rental companies",
    title: "Run the whole rental operation from demand to cash.",
    description: "Replace disconnected spreadsheets, messaging threads and point tools with one system that connects customers, vehicles, bookings, handovers, rentals, returns and finance.",
    outcomes: ["One operating picture across the rental lifecycle", "Fewer handoff gaps between front desk and operations", "Cleaner payment and balance visibility", "A customer journey that stays connected to back-office truth"],
    capabilities: ["Fleet operations", "Bookings and contracts", "Rental lifecycle", "Payments and finance", "Customer website", "Analytics"],
  },
  "fleet-owners": {
    eyebrow: "For managed fleets",
    title: "Grow a third-party fleet without losing owner trust.",
    description: "Keep ownership terms, vehicle performance, expenses and settlements connected so owners can understand how their assets perform.",
    outcomes: ["Explain owner earnings clearly", "Separate company and owner obligations", "Track profitability by vehicle", "Build a stronger basis for retaining asset owners"],
    capabilities: ["Ownership records", "Owner settlement periods", "Adjustments and disputes", "Payables and payout", "Vehicle profitability", "Owner history"],
  },
  "multi-branch": {
    eyebrow: "For multi-branch operators",
    title: "Give every branch local speed without losing central control.",
    description: "Standardize pricing, permissions and operational truth across teams while keeping tenancy, roles and data access explicit.",
    outcomes: ["Reduce process drift between branches", "Give leadership a comparable operating view", "Control who can see and change what", "Scale workflows without cloning spreadsheets"],
    capabilities: ["Role-based access", "Tenant boundaries", "Shared operating models", "Branch-ready workflows", "Central reporting", "Audit history"],
  },
  "chauffeur-driver-hire": {
    eyebrow: "For chauffeur & driver hire",
    title: "Coordinate vehicles, drivers and customer commitments in one flow.",
    description: "Use customer, driver, vehicle and booking records together so dispatch decisions start from complete operating context.",
    outcomes: ["Match the right driver and vehicle to each commitment", "Keep licence and customer evidence accessible", "Reduce last-minute readiness surprises", "Preserve trip and customer history"],
    capabilities: ["Driver profiles", "Vehicle records", "Bookings", "Availability", "Compliance", "Customer history"],
  },
  "corporate-rentals": {
    eyebrow: "For corporate rentals",
    title: "Serve business customers without losing commercial control.",
    description: "Keep corporate accounts, approved drivers, booking history, invoices and balances connected for repeat business.",
    outcomes: ["Speed up repeat corporate bookings", "Keep account-level history visible", "Improve invoice and balance follow-up", "Give teams consistent account context"],
    capabilities: ["Corporate accounts", "Customer and driver linkage", "Bookings", "Invoices", "Payment allocation", "Reporting"],
  },
  "growing-rental-businesses": {
    eyebrow: "For growing operators",
    title: "Build operating discipline before complexity arrives.",
    description: "Start with the workflows that protect revenue and customer experience, then expand into finance, owners, automation and analytics as the business grows.",
    outcomes: ["Move away from fragile spreadsheets", "Create repeatable booking and fleet processes", "Add controls without replacing the platform", "Build a system your next hires can understand"],
    capabilities: ["Fleet", "Customers", "Bookings", "Payments", "Website", "Expandable modules"],
  },
  "enterprise": {
    eyebrow: "For larger operators",
    title: "Standardize the operating model without flattening the business.",
    description: "Use explicit permissions, event-driven workflows, financial controls and reporting boundaries for more complex teams and operations.",
    outcomes: ["Create clearer governance", "Reduce cross-team ambiguity", "Preserve auditability at higher transaction volume", "Support deeper integrations and operating controls"],
    capabilities: ["Granular permissions", "Platform controls", "Event architecture", "Financial invariants", "Reporting", "Integration boundaries"],
  },
};

const productLinks = [
  ["Fleet", "/product/fleet"],
  ["Customers & Drivers", "/product/customers-drivers"],
  ["Pricing", "/product/pricing"],
  ["Availability", "/product/availability"],
  ["Bookings", "/product/bookings"],
  ["Contracts & Handover", "/product/contracts-handover"],
  ["Rentals", "/product/rentals"],
  ["Returns & Inspections", "/product/returns-inspections"],
  ["Maintenance", "/product/maintenance"],
  ["Compliance", "/product/compliance"],
  ["Payments", "/product/payments"],
  ["Finance", "/product/finance"],
  ["Owner Settlements", "/product/owner-settlements"],
  ["CRM", "/product/crm"],
  ["Analytics", "/product/analytics"],
  ["Customer Websites", "/product/websites"],
  ["Automation", "/product/automation"],
] as const;

const solutionLinks = [
  ["Rental Companies", "/solutions/rental-companies"],
  ["Fleet Owners", "/solutions/fleet-owners"],
  ["Multi-Branch Operators", "/solutions/multi-branch"],
  ["Chauffeur & Driver Hire", "/solutions/chauffeur-driver-hire"],
  ["Corporate Rentals", "/solutions/corporate-rentals"],
  ["Growing Rental Businesses", "/solutions/growing-rental-businesses"],
  ["Enterprise", "/solutions/enterprise"],
] as const;

const resourceCards = [
  { title: "Guides", copy: "Practical operating playbooks for pricing, bookings, fleet control, handovers and finance.", href: "/resources/guides", icon: BookOpen },
  { title: "Help Centre", copy: "Understand core workflows and how each part of Sage Auto fits into the rental lifecycle.", href: "/resources/help", icon: LifeBuoy },
  { title: "Product Documentation", copy: "Explore the system model, operating concepts and integration boundaries.", href: "/resources/docs", icon: FileCheck2 },
  { title: "Blog", copy: "Ideas for running a more measurable, customer-ready rental business.", href: "/resources/blog", icon: ReceiptText },
  { title: "FAQ", copy: "Straight answers to common questions before you adopt a new operating platform.", href: "/resources/faq", icon: SearchCheck },
  { title: "What's New", copy: "Follow the product as workflows, integrations and operating controls evolve.", href: "/resources/changelog", icon: Sparkles },
];

const guidePages: Record<string, PageDefinition> = {
  "guides": {
    eyebrow: "Operating guides",
    title: "Build a rental business that can scale without losing control.",
    description: "Use these guides to improve the operating system around your fleet—not just the software screen in front of it.",
    outcomes: ["Design a booking process with clear ownership", "Create a handover record that protects both sides", "Separate deposits, revenue and outstanding balances", "Measure vehicle performance beyond headline revenue"],
    capabilities: ["Booking operations guide", "Fleet readiness checklist", "Handover and return playbook", "Owner settlement framework", "Payment reconciliation guide", "Vehicle profitability framework"],
  },
  "help": {
    eyebrow: "Help Centre",
    title: "Find the next action, not just the next button.",
    description: "Sage Auto help content is organized around real jobs: register a vehicle, confirm a booking, release a rental, close a return, collect money and pay owners.",
    outcomes: ["Understand workflows end-to-end", "See what must happen before the next state", "Know where records originate", "Reduce trial-and-error for new team members"],
    capabilities: ["Getting started", "Fleet", "Customers and drivers", "Bookings", "Rentals and returns", "Finance and payments", "Owner settlements", "Workspace access"],
  },
  "docs": {
    eyebrow: "Product documentation",
    title: "Understand the system behind the workflow.",
    description: "Documentation for teams evaluating integrations, controls, data boundaries and how Sage Auto models a rental operation.",
    outcomes: ["Evaluate platform fit before rollout", "Understand domain boundaries", "Plan integrations with less ambiguity", "Give technical teams a shared operating vocabulary"],
    capabilities: ["Domain model", "API boundaries", "Events", "Permissions", "Tenancy", "Payment providers", "Public booking", "Website architecture"],
  },
  "blog": {
    eyebrow: "Sage Auto journal",
    title: "Better rental operations start with better operating questions.",
    description: "A growing collection of practical thinking on utilization, direct bookings, deposits, fleet economics, customer experience and operational control.",
    outcomes: ["Improve the questions managers ask", "Turn common rental pain points into measurable workflows", "Learn from operating patterns across the platform", "Build stronger internal processes"],
    capabilities: ["Utilization", "Pricing discipline", "Direct booking", "Fleet economics", "Customer experience", "Operations"],
  },
  "faq": {
    eyebrow: "Frequently asked questions",
    title: "Know what Sage Auto changes before you change your operation.",
    description: "The short version: Sage Auto is an operating platform for rental businesses that connects commercial demand, fleet readiness, fulfilment and financial truth.",
    outcomes: ["Understand who the platform is for", "See how customer websites connect to operations", "Understand payments and owner settlements", "Know how roles and tenant boundaries work"],
    capabilities: ["Can I run multiple teams?", "Can customers book online?", "Does Sage Auto support M-Pesa and card flows?", "Can I manage third-party vehicle owners?", "Can I track maintenance and compliance?", "Can I export reporting data?"],
  },
  "changelog": {
    eyebrow: "What's new",
    title: "Follow the workflows as Sage Auto gets deeper.",
    description: "Product evolution is organized around complete operating experiences—not isolated screens.",
    outcomes: ["See which workflows have been refined", "Understand changes that affect operations", "Prepare teams for new capabilities", "Keep implementation expectations clear"],
    capabilities: ["Fleet experience", "Customers & drivers", "Pricing", "Availability", "Bookings", "Contract & handover", "Returns", "Owner settlements"],
  },
};

const comparePages: Record<string, PageDefinition> = {
  "spreadsheets": {
    eyebrow: "Sage Auto vs spreadsheets",
    title: "Keep spreadsheets for analysis—not for running the rental lifecycle.",
    description: "Spreadsheets are flexible, but they cannot reliably enforce booking state, vehicle readiness, payment allocation, permissions and audit history across a growing team.",
    outcomes: ["Replace duplicate operational entry", "Reduce version-of-truth disputes", "Make workflow state explicit", "Keep operational and financial records connected"],
    capabilities: ["Shared domain records", "Permissions", "Lifecycle rules", "Audit history", "Availability checks", "Payment allocation"],
  },
  "point-tools": {
    eyebrow: "Sage Auto vs disconnected point tools",
    title: "Stop stitching the customer journey together by hand.",
    description: "A booking tool, accounting tool, spreadsheet and messaging app may each solve a slice of the work. Sage Auto is designed around the handoffs between those slices.",
    outcomes: ["Reduce re-entry between systems", "Keep one booking context through fulfilment", "Connect returns to finance", "Connect owner economics to the same vehicle history"],
    capabilities: ["Connected domains", "Shared customer record", "Shared vehicle record", "Financial handoff", "Event automation", "Reporting"],
  },
};

const seoPages: Record<string, PageDefinition> = {
  "/car-rental-software": {
    eyebrow: "Car rental software",
    title: "Car rental software built around the whole operating day.",
    description: "From the first enquiry to the final invoice, Sage Auto keeps fleet, customer, booking, rental and finance workflows connected.",
    outcomes: ["Sell available vehicles with more confidence", "Reduce manual handoffs", "Track outstanding balances", "Give managers a clearer operating picture"],
    capabilities: ["Fleet", "Pricing", "Availability", "Bookings", "Rentals", "Payments", "Finance", "Analytics"],
  },
  "/fleet-management-software": {
    eyebrow: "Fleet management software for rental businesses",
    title: "Manage fleet readiness in the context of revenue.",
    description: "Sage Auto combines asset records with availability, bookings, compliance, maintenance, ownership and profitability so fleet decisions reflect the rental business around them.",
    outcomes: ["See revenue readiness by vehicle", "Reduce preventable downtime", "Track owner and company assets together", "Understand operating history before allocation"],
    capabilities: ["Asset profiles", "Availability", "Compliance", "Maintenance", "Ownership", "Inspections", "Profitability"],
  },
  "/car-hire-management-software": {
    eyebrow: "Car hire management software",
    title: "Give your car hire team one operating system.",
    description: "Run customer acquisition, booking fulfilment, vehicle handover, returns, payments and owner obligations without rebuilding the same story in separate tools.",
    outcomes: ["Create repeatable workflows", "Keep staff aligned on next actions", "Improve customer response", "Strengthen financial visibility"],
    capabilities: ["CRM", "Bookings", "Handover", "Rentals", "Payments", "Owner settlements", "Reports"],
  },
};

const navGroups = [
  { label: "Product", href: "/product" },
  { label: "Solutions", href: "/solutions" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "About", href: "/about" },
];

const benefits = [
  { icon: CalendarCheck2, title: "Sell with operational confidence", copy: "Pricing, availability and booking decisions stay connected to the vehicles your team must actually deliver." },
  { icon: ClipboardCheck, title: "Fulfil with evidence", copy: "Contracts, inspections, handovers, returns and status history create a clearer record of what happened." },
  { icon: CircleDollarSign, title: "Turn operations into financial truth", copy: "Payments, deposits, invoices, expenses and owner settlements stay tied to the work that created them." },
  { icon: LineChart, title: "Manage from one picture", copy: "See fleet, customer, rental and financial signals without stitching together multiple operational versions." },
];

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function LinkButton({ href, children, secondary = false }: { href: string; children: React.ReactNode; secondary?: boolean }) {
  return (
    <a href={href} className={cx(
      "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition",
      secondary
        ? "border border-slate-300 bg-white text-slate-900 hover:border-slate-950"
        : "bg-slate-950 text-white hover:bg-emerald-700"
    )}>
      {children}<ArrowRight size={16} />
    </a>
  );
}

function SectionTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return <div className="max-w-3xl">
    <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
    <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h2>
    {copy && <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">{copy}</p>}
  </div>;
}

function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const dropdowns = {
    Product: productLinks.slice(0, 9),
    Solutions: solutionLinks.slice(0, 6),
    Resources: resourceCards.map(item => [item.title, item.href] as const),
  } as const;
  return <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[#fbfaf7]/95 backdrop-blur">
    <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8">
      <a href="/" className="flex items-center gap-3 font-semibold tracking-tight text-slate-950">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-white"><CarFront size={19}/></span>
        <span className="text-lg">Sage Auto</span>
      </a>
      <nav className="hidden items-center gap-2 lg:flex" aria-label="Primary navigation">
        {navGroups.map(item => {
          const dropdown = dropdowns[item.label as keyof typeof dropdowns];
          return <div key={item.href} className="group relative">
            <a href={item.href} className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-950">
              {item.label}{dropdown && <ChevronDown size={14}/>}
            </a>
            {dropdown && <div className="invisible absolute left-0 top-full z-50 mt-2 w-72 translate-y-1 rounded-2xl border border-slate-200 bg-white p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              {dropdown.map(item => { const label=item[0], href=item[1]; return <a key={href} href={href} className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-slate-700 hover:bg-[#f4f1e9] hover:text-slate-950"><span>{label}</span><ArrowRight size={14}/></a>; })}
              <a href={item.href} className="mt-1 flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">View all <ArrowRight size={13}/></a>
            </div>}
          </div>;
        })}
      </nav>
      <div className="hidden items-center gap-3 lg:flex">
        <a href="/login" className="px-3 py-2 text-sm font-semibold text-slate-700 hover:text-slate-950">Sign in</a>
        <LinkButton href="/register">Get started</LinkButton>
      </div>
      <button aria-label="Toggle navigation" className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(v => !v)}>{open ? <X/> : <Menu/>}</button>
    </div>
    {open && <div className="border-t border-slate-200 bg-[#fbfaf7] px-5 py-5 lg:hidden">
      <nav className="grid gap-1">{navGroups.map(item => <a key={item.href} href={item.href} className="rounded-xl px-3 py-3 font-medium text-slate-800 hover:bg-white">{item.label}</a>)}</nav>
      <div className="mt-4 grid grid-cols-2 gap-3"><a href="/login" className="rounded-full border border-slate-300 px-4 py-3 text-center text-sm font-semibold">Sign in</a><a href="/register" className="rounded-full bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white">Get started</a></div>
    </div>}
  </header>;
}

function MarketingFooter() {
  const groups = [
    ["Product", [["Fleet","/product/fleet"],["Bookings","/product/bookings"],["Finance","/product/finance"],["Owner settlements","/product/owner-settlements"],["Analytics","/product/analytics"],["Websites","/product/websites"]]],
    ["Company", [["About","/about"],["Contact","/contact"],["Security","/security"],["Integrations","/integrations"],["Status","/status"],["Careers","/about/careers"]]],
    ["Resources", [["Guides","/resources/guides"],["Help Centre","/resources/help"],["Documentation","/resources/docs"],["Blog","/resources/blog"],["FAQ","/resources/faq"],["Developers","/developers"]]],
    ["Legal", [["Privacy","/legal/privacy"],["Terms","/legal/terms"],["Cookies","/legal/cookies"],["Data Processing","/legal/dpa"]]],
  ] as const;
  return <footer className="border-t border-slate-200 bg-slate-950 text-slate-300">
    <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[1.2fr_3fr]">
      <div><div className="flex items-center gap-3 text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600"><CarFront size={18}/></span><strong>Sage Auto</strong></div><p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">The operating platform for rental businesses that want commercial speed, fleet control and financial clarity in one system.</p></div>
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">{groups.map(([title,items])=><div key={title}><h3 className="mb-4 text-sm font-semibold text-white">{title}</h3><div className="grid gap-3">{items.map(item=>{const label=item[0], href=item[1]; return <a className="text-sm text-slate-400 hover:text-white" href={href} key={href}>{label}</a>;})}</div></div>)}</div>
    </div>
    <div className="border-t border-slate-800 px-5 py-6 text-center text-xs text-slate-500">Sage Auto · Rental operations, connected.</div>
  </footer>;
}

function HeroVisual() {
  return <div className="relative">
    <div className="absolute -inset-6 rounded-[2.5rem] bg-emerald-200/40 blur-3xl"/>
    <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-300/40">
      <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white">
        <div className="flex items-center justify-between"><div><p className="text-xs text-slate-400">Illustrative workspace</p><p className="mt-1 font-semibold">Operations overview</p></div><span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-300">Live workflow</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[["Fleet ready","24"],["Due returns","07"],["Open balances","KES 184k"]].map(([a,b])=><div className="rounded-2xl bg-white/7 p-4" key={a}><p className="text-xs text-slate-400">{a}</p><p className="mt-1 text-xl font-semibold">{b}</p></div>)}
        </div>
      </div>
      <div className="grid gap-4 p-2 pt-5 md:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between"><strong className="text-sm">Rental flow</strong><Route size={17} className="text-emerald-700"/></div>
          <div className="grid gap-3">{["Booking confirmed","Vehicle ready","Handover complete","Rental active"].map((step,i)=><div key={step} className="flex items-center gap-3"><span className={cx("grid h-7 w-7 place-items-center rounded-full text-xs font-bold", i<3?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-800")}>{i<3?<Check size={14}/>:4}</span><span className="text-sm text-slate-700">{step}</span></div>)}</div>
        </div>
        <div className="rounded-2xl bg-[#f4f1e9] p-4"><div className="flex items-center justify-between"><strong className="text-sm">Vehicle readiness</strong><Gauge size={17}/></div><p className="mt-6 text-3xl font-semibold">Ready</p><p className="mt-2 text-sm leading-6 text-slate-600">Availability, compliance and maintenance checks are aligned for the next booking.</p></div>
      </div>
    </div>
  </div>;
}

function HomePage() {
  return <>
    <section className="overflow-hidden bg-[#fbfaf7]">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:py-28">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800"><Sparkles size={14}/> Rental operations, connected</div>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-6xl lg:text-7xl">Run the rental business you can actually see.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Sage Auto connects demand, fleet readiness, bookings, handovers, rentals, payments, finance and owner settlements—so your team can move faster without losing operational control.</p>
          <div className="mt-8 flex flex-wrap gap-3"><LinkButton href="/register">Create your workspace</LinkButton><LinkButton href="/product" secondary>See how it works</LinkButton></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">{["Built for rental workflows","M-Pesa & card payment boundaries","Customer website connected to operations"].map(x=><span className="flex items-center gap-2" key={x}><Check size={16} className="text-emerald-700"/>{x}</span>)}</div>
        </div>
        <HeroVisual/>
      </div>
    </section>

    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><SectionTitle eyebrow="The outcome" title="Less operational guessing. More controlled growth." copy="Sage Auto is designed around the moments where rental businesses lose time, margin or customer trust: quoting unavailable cars, incomplete handovers, missing collections, unclear expenses and disputed owner payouts."/>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">{benefits.map(({icon:Icon,title,copy})=><article key={title} className="rounded-3xl border border-slate-200 p-6"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon/></span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p></article>)}</div>
      </div>
    </section>

    <section className="bg-[#f4f1e9]">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <SectionTitle eyebrow="One operating flow" title="From the first customer signal to the final financial record." copy="Each team sees the part they own, while the business keeps one connected record of the rental lifecycle."/>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            [Users,"Win demand","CRM, customers, direct website and quotes turn interest into qualified bookings."],
            [CalendarCheck2,"Commit inventory","Pricing and availability protect the promise before operations has to fulfil it."],
            [KeyRound,"Deliver the rental","Contracts, inspections and handovers establish what leaves, when and in what condition."],
            [ReceiptText,"Close the money","Returns, invoices, payments, deposits, expenses and settlements close the commercial loop."],
          ].map(([Icon,title,copy]:any)=><div key={title} className="rounded-3xl bg-white p-7"><Icon className="text-emerald-700"/><h3 className="mt-5 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{copy}</p></div>)}
        </div>
      </div>
    </section>

    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><SectionTitle eyebrow="Product" title="Every module exists to move the operation forward." copy="Use Sage Auto as one system instead of forcing your team to reconstruct the rental story across separate tools."/><a href="/product" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">Explore the product <ArrowRight size={16}/></a></div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{productLinks.slice(0,12).map(([label,href],i)=>{const icons=[CarFront,Users,CircleDollarSign,CalendarCheck2,ClipboardCheck,KeyRound,Route,SearchCheck,Wrench,ShieldCheck,CreditCard,ReceiptText];const Icon=icons[i]||Layers3;return <a href={href} key={href} className="group rounded-3xl border border-slate-200 p-6 transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-lg"><Icon className="text-emerald-700"/><h3 className="mt-4 font-semibold">{label}</h3><p className="mt-2 text-sm text-slate-500">See the workflow and business outcome.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">Explore <ArrowRight size={15} className="transition group-hover:translate-x-1"/></span></a>})}</div>
      </div>
    </section>

    <section className="bg-slate-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Built for the realities of rental</p><h2 className="mt-4 text-4xl font-semibold tracking-tight">Local payment realities. Global operating discipline.</h2><p className="mt-5 text-lg leading-8 text-slate-300">Sage Auto is designed for businesses that need M-Pesa and card payment paths, mixed owned and third-party fleets, direct customer channels and strong operating controls—without locking the product to one market.</p><div className="mt-8"><LinkButton href="/solutions" secondary>Explore solutions</LinkButton></div></div>
        <div className="grid gap-4 sm:grid-cols-2">{[
          [CreditCard,"Collections that reconcile","Keep provider references, verification and allocation attached to the purpose of each payment."],
          [WalletCards,"Owner economics","Explain owner settlements from vehicle activity, costs, adjustments and approvals."],
          [Globe2,"Direct booking","Connect your public fleet and quote experience to the same operational system."],
          [ShieldCheck,"Controlled access","Give people the records and actions required by their responsibilities."],
        ].map(([Icon,title,copy]:any)=><div key={title} className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><Icon className="text-emerald-400"/><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{copy}</p></div>)}</div>
      </div>
    </section>

    <section className="bg-[#fbfaf7]">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><SectionTitle eyebrow="Adoption" title="Start where the pain is. Keep the same operating foundation as you grow." copy="A smaller operator can begin with fleet, customers and bookings. A more complex business can extend the same records into finance, owner settlements, automation, analytics and deeper governance."/>
        <div className="mt-10 grid gap-5 md:grid-cols-3">{[
          ["1","Establish the truth","Bring fleet, customers and team access into one workspace."],
          ["2","Connect the rental flow","Use pricing, availability, bookings, contracts, handovers and returns together."],
          ["3","Close the commercial loop","Connect payments, finance, owner settlements, reporting and automation."],
        ].map(([n,title,copy])=><div key={n} className="rounded-3xl bg-white p-7 shadow-sm"><span className="text-sm font-bold text-emerald-700">{n.padStart(2,"0")}</span><h3 className="mt-8 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{copy}</p></div>)}</div>
      </div>
    </section>

    <CallToAction/>
  </>;
}

function CallToAction() {
  return <section className="bg-emerald-700 text-white"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-16 sm:px-8 lg:flex-row lg:items-center"><div><p className="text-sm font-semibold text-emerald-100">Build the operating foundation first.</p><h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">Give your team one place to run the rental business.</h2></div><div className="flex flex-wrap gap-3"><a href="/register" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-emerald-800">Create workspace <ArrowRight size={16}/></a><a href="/contact" className="rounded-full border border-emerald-400 px-5 py-3 text-sm font-semibold">Talk through your operation</a></div></div></section>;
}

function DetailPage({ page }: { page: PageDefinition }) {
  return <>
    <section className="bg-[#fbfaf7]"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28"><div className="max-w-4xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">{page.eyebrow}</p><h1 className="mt-5 text-5xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-6xl">{page.title}</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">{page.description}</p><div className="mt-8 flex flex-wrap gap-3"><LinkButton href="/register">Get started</LinkButton><LinkButton href="/contact" secondary>Talk to us</LinkButton></div></div></div></section>
    <section className="border-y border-slate-200 bg-white"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-18 sm:px-8 lg:grid-cols-2"><SectionTitle eyebrow="Business outcome" title="What changes when this workflow is connected"/><div className="grid gap-3">{page.outcomes.map(x=><div key={x} className="flex gap-3 rounded-2xl bg-[#f7f6f2] p-4"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800"><Check size={14}/></span><p className="text-sm leading-6 text-slate-700">{x}</p></div>)}</div></div></section>
    <section className="bg-[#f4f1e9]"><div className="mx-auto max-w-7xl px-5 py-18 sm:px-8"><SectionTitle eyebrow="How Sage Auto supports it" title="Capabilities that serve the outcome"/><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{page.capabilities.map((x,i)=><div key={x} className="rounded-3xl bg-white p-6"><span className="text-xs font-bold text-emerald-700">{String(i+1).padStart(2,"0")}</span><h3 className="mt-5 text-lg font-semibold">{x}</h3></div>)}</div></div></section>
    <CallToAction/>
  </>;
}

function HubPage({ type }: { type: "product" | "solutions" }) {
  const items = type === "product" ? productLinks : solutionLinks;
  return <>
    <section className="bg-[#fbfaf7]"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><SectionTitle eyebrow={type === "product" ? "Product" : "Solutions"} title={type === "product" ? "One system around the entire rental lifecycle." : "A stronger operating model for the business you actually run."} copy={type === "product" ? "Sage Auto modules share the same customer, vehicle, booking, rental and financial context so each workflow starts with what the previous workflow already knows." : "Different rental businesses feel different pressure. Sage Auto keeps one operating foundation while letting you focus on the outcomes that matter most to your model."}/></div></section>
    <section className="bg-white"><div className="mx-auto max-w-7xl px-5 py-18 sm:px-8"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map(item=>{const label=item[0], href=item[1]; return <a href={href} key={href} className="group rounded-3xl border border-slate-200 p-7 hover:border-emerald-300 hover:shadow-lg"><h2 className="text-xl font-semibold">{label}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{type === "product" ? "See the workflow, operating controls and business outcome." : "See how Sage Auto supports this operating model."}</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">Explore <ArrowRight size={15} className="transition group-hover:translate-x-1"/></span></a>;})}</div></div></section>
    <CallToAction/>
  </>;
}

function PricingPage() {
  const plans = [
    { name: "Launch", for: "For operators establishing one reliable operating flow.", focus: ["Fleet, customers and drivers", "Pricing, availability and bookings", "Contracts, handover and rentals", "Core payments and finance"] },
    { name: "Growth", for: "For teams adding deeper controls, reporting and customer channels.", focus: ["Everything in Launch", "Maintenance and compliance", "Direct customer website", "CRM and analytics", "Expanded team workflows"] },
    { name: "Scale", for: "For larger and more complex rental operations.", focus: ["Everything in Growth", "Owner settlements", "Advanced governance", "Automation and reporting", "Integration support"] },
    { name: "Enterprise", for: "For organizations with custom operating, integration or governance requirements.", focus: ["Tailored rollout", "Deeper integration planning", "Complex access models", "Operational governance support"] },
  ];
  return <>
    <section className="bg-[#fbfaf7]"><div className="mx-auto max-w-7xl px-5 py-20 text-center sm:px-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Pricing</p><h1 className="mx-auto mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">Pay for the operating depth your business needs.</h1><p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">Sage Auto pricing is structured around business stage, workflow depth and operational complexity. Public rates will be published once packaging is finalized; we will not invent a price just to fill the page.</p></div></section>
    <section className="bg-white"><div className="mx-auto max-w-7xl px-5 py-18 sm:px-8"><div className="grid gap-5 lg:grid-cols-4">{plans.map((plan,i)=><article key={plan.name} className={cx("rounded-3xl border p-6",i===1?"border-emerald-500 shadow-xl shadow-emerald-100":"border-slate-200")}><p className="text-sm font-bold text-emerald-700">{plan.name}</p><h2 className="mt-4 text-xl font-semibold">{plan.for}</h2><div className="mt-6 grid gap-3">{plan.focus.map(x=><p className="flex gap-2 text-sm text-slate-600" key={x}><Check size={16} className="mt-0.5 shrink-0 text-emerald-700"/>{x}</p>)}</div><a href="/contact" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-950">Discuss fit <ArrowRight size={15}/></a></article>)}</div><div className="mt-10 rounded-3xl bg-[#f4f1e9] p-7"><h2 className="text-xl font-semibold">What pricing should reflect</h2><div className="mt-5 grid gap-4 md:grid-cols-4">{["Fleet size and operating volume","Users, roles and branches","Modules and customer channels","Integration and support complexity"].map(x=><p className="text-sm leading-6 text-slate-600" key={x}>{x}</p>)}</div></div></div></section>
    <CallToAction/>
  </>;
}

function ResourcesPage() {
  return <>
    <section className="bg-[#fbfaf7]"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><SectionTitle eyebrow="Resources" title="Operate better before you automate more." copy="Use Sage Auto resources to improve the process around the software: how you price, qualify bookings, release vehicles, reconcile money and understand asset performance."/></div></section>
    <section className="bg-white"><div className="mx-auto grid max-w-7xl gap-5 px-5 py-18 sm:px-8 md:grid-cols-2 lg:grid-cols-3">{resourceCards.map(({title,copy,href,icon:Icon})=><a href={href} key={href} className="rounded-3xl border border-slate-200 p-7 hover:border-emerald-300 hover:shadow-lg"><Icon className="text-emerald-700"/><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{copy}</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">Explore <ArrowRight size={15}/></span></a>)}</div></section>
    <section className="bg-[#f4f1e9]"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><SectionTitle eyebrow="Compare the operating model" title="See what changes when the system becomes the workflow."/><div className="mt-8 flex flex-wrap gap-3"><LinkButton href="/compare/spreadsheets" secondary>Compare with spreadsheets</LinkButton><LinkButton href="/compare/point-tools" secondary>Compare with point tools</LinkButton></div></div></section>
  </>;
}

function AboutPage({ subpage }: { subpage?: string }) {
  if (subpage === "careers") return <DetailPage page={{eyebrow:"Careers",title:"Help build software around the real work of mobility businesses.",description:"Sage Auto is being built as an operating platform, not a collection of screens. Future roles will focus on product depth, reliable engineering and clear customer outcomes.",outcomes:["Work on complete operating workflows","Solve problems across product and engineering boundaries","Build for measurable business outcomes","Contribute to a platform with global ambition"],capabilities:["Engineering","Product design","Customer operations","Implementation","Data and analytics","Platform reliability"]}}/>;
  if (subpage === "partners") return <DetailPage page={{eyebrow:"Partners",title:"Extend the operating system without fragmenting the customer experience.",description:"Sage Auto partnership opportunities are aimed at payment providers, implementation teams, fleet service partners and technology platforms that improve a connected rental workflow.",outcomes:["Create cleaner integrations","Bring local expertise into rollout","Keep partner services visible in the operating flow","Expand customer value without forcing tool sprawl"],capabilities:["Payment partners","Implementation partners","Fleet service partners","Technology integrations","Advisory partners","Channel partnerships"]}}/>;
  if (subpage === "company") return <DetailPage page={{eyebrow:"Company",title:"Building the operating layer for modern rental businesses.",description:"Sage Auto exists because rental operations are still too often reconstructed from spreadsheets, messaging threads and disconnected systems. We are building one platform around the operational truth of the business.",outcomes:["Make rental operations easier to see","Connect customer experience to back-office truth","Bring financial discipline closer to operations","Build from African operating realities with global ambition"],capabilities:["Rental domain depth","Connected workflows","Financial controls","Customer channels","Automation","Extensible architecture"]}}/>;
  return <>
    <section className="bg-[#fbfaf7]"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><SectionTitle eyebrow="About Sage Auto" title="Rental businesses should not need five versions of the truth to serve one customer." copy="Sage Auto is building a connected operating platform for the commercial, fleet, customer and financial work behind vehicle rental."/></div></section>
    <section className="bg-white"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-18 sm:px-8 lg:grid-cols-2"><div><h2 className="text-3xl font-semibold">Why we exist</h2><p className="mt-5 leading-7 text-slate-600">The rental experience looks simple from the outside: choose a car, sign, drive, return. Behind it sits pricing, availability, customer eligibility, vehicle readiness, contracts, inspections, collections, deposits, expenses and owner obligations. When those live in separate systems, the business spends energy rebuilding context instead of serving the customer.</p></div><div className="rounded-3xl bg-[#f4f1e9] p-8"><p className="text-sm font-bold text-emerald-700">Our direction</p><h3 className="mt-3 text-2xl font-semibold">African operating reality. Global product standard.</h3><p className="mt-4 leading-7 text-slate-600">We design for payment methods, fleet ownership structures and operating constraints common in African markets, while keeping the core platform adaptable to rental businesses anywhere.</p></div></div></section>
    <CallToAction/>
  </>;
}

function ContactPage() {
  return <>
    <section className="bg-[#fbfaf7]"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Contact</p><h1 className="mt-5 text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">Start with the operating problem you want to remove.</h1><p className="mt-6 text-lg leading-8 text-slate-600">Whether the issue is booking control, fleet readiness, collections, owner settlements or disconnected customer channels, the best Sage Auto conversation starts with the outcome your team needs.</p><div className="mt-8 flex flex-wrap gap-3"><LinkButton href="/register">Create a workspace</LinkButton><LinkButton href="/product" secondary>Explore product</LinkButton></div></div><div className="grid gap-4">{[
      [CalendarCheck2,"Product walkthrough","Map your current rental flow against Sage Auto and identify the highest-value starting point."],
      [Building2,"Business fit","Discuss fleet size, team structure, owner model, branches and customer channels."],
      [Network,"Integration planning","Review payment, website, data and external-system boundaries before rollout."],
      [Headphones,"Existing customers","Sign in to your workspace for account-specific operational support."],
    ].map(([Icon,title,copy]:any)=><div key={title} className="rounded-3xl border border-slate-200 bg-white p-6"><Icon className="text-emerald-700"/><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p></div>)}</div></div></section>
  </>;
}

function SecurityPage() {
  return <DetailPage page={{eyebrow:"Security",title:"Protect access without slowing the operation.",description:"Sage Auto is designed around tenant boundaries, role-aware access, audited support workflows and controlled financial actions so operational speed does not depend on sharing broad credentials.",outcomes:["Keep tenant data boundaries explicit","Give team members access based on responsibility","Preserve audit context around sensitive actions","Keep support access time-limited and visible"],capabilities:["Tenant isolation model","Role and permission controls","Session management","Audit records","Support-access controls","Payment webhook verification","File security boundaries","Governed platform administration"]}}/>;
}

function IntegrationsPage() {
  return <DetailPage page={{eyebrow:"Integrations",title:"Connect the systems that move money, customers and operational data.",description:"Sage Auto integration boundaries are designed to extend a connected rental workflow—not create another disconnected source of truth.",outcomes:["Connect payment providers to verified payment state","Publish customer channels from operational records","Move events into automation reliably","Keep external identifiers traceable"],capabilities:["M-Pesa / Daraja boundary","Card payment provider boundary","Email, SMS and messaging provider architecture","Public booking APIs","Website and domain architecture","Event contracts","REST APIs","Object storage boundaries"]}}/>;
}

function DevelopersPage() {
  return <DetailPage page={{eyebrow:"Developers",title:"Integrate around explicit rental-domain boundaries.",description:"Sage Auto is structured around APIs, events and domain contracts for teams that need to connect payments, websites, reporting, operational tools or custom workflows.",outcomes:["Integrate against stable business concepts","Reduce hidden coupling between modules","Use events for asynchronous workflows","Keep tenancy and permissions part of the integration model"],capabilities:["REST API contracts","Event envelopes","Outbox pattern","Domain identifiers","Tenant context","Permission-aware endpoints","Public booking boundary","Provider adapters"]}}/>;
}

function StatusPage() {
  return <>
    <section className="bg-[#fbfaf7]"><div className="mx-auto max-w-4xl px-5 py-20 sm:px-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Service status</p><h1 className="mt-5 text-5xl font-semibold tracking-tight">Operational transparency should be factual.</h1><p className="mt-6 text-lg leading-8 text-slate-600">Sage Auto includes health, observability and operational-readiness architecture. A customer-facing live telemetry feed is not yet wired to this page, so we do not display a fabricated “all systems operational” badge.</p><div className="mt-10 rounded-3xl border border-amber-200 bg-amber-50 p-7"><div className="flex gap-3"><Clock3 className="text-amber-700"/><div><h2 className="font-semibold text-amber-950">Public live status feed pending</h2><p className="mt-2 text-sm leading-6 text-amber-900/75">This page is ready to consume the production monitoring/status source when that endpoint is published.</p></div></div></div></div></section>
  </>;
}

const legalCopy: Record<string, {title:string; intro:string; sections:Array<[string,string]>}> = {
  privacy: { title:"Privacy Policy", intro:"A public privacy policy must describe the data Sage Auto actually collects, why it is used, where it is processed and how rights requests are handled.", sections:[["Current status","The product has privacy and access-control architecture, but the final public legal text should be reviewed against the deployed data flows, hosting providers and jurisdictions before launch."],["Principles","Data minimization, tenant separation, role-aware access, auditability, retention controls and secure handling should remain the basis of the final policy."],["Before publication","Confirm controller/processor roles, subprocessors, retention periods, cross-border transfers, rights-request contact and applicable jurisdictions."]] },
  terms: { title:"Terms of Service", intro:"The final terms should define the commercial relationship around use of Sage Auto, subscriptions, acceptable use, service boundaries and account responsibilities.", sections:[["Current status","This page intentionally avoids inventing contractual commitments, SLAs or warranties that have not been approved."],["Coverage","Final terms should cover accounts, tenant responsibilities, subscription and payment terms, permitted use, intellectual property, suspension, termination, limitations and dispute process."],["Launch requirement","Have the final terms reviewed for the jurisdictions in which Sage Auto will contract customers."]] },
  cookies: { title:"Cookie Policy", intro:"Sage Auto should publish only the cookies and similar storage technologies that the deployed product actually uses.", sections:[["Current application","The application uses browser storage for authentication/session and workspace context. The production website should document any analytics or marketing cookies only after those tools are selected."],["Consent","Non-essential tracking should not be described as active until a compliant consent mechanism and actual tracker inventory exist."],["Review","Maintain an inventory of cookies, purpose, provider and retention."]] },
  dpa: { title:"Data Processing Addendum", intro:"A DPA should translate Sage Auto's technical privacy model into contractual processor obligations.", sections:[["Scope","Define processing instructions, categories of data and data subjects, confidentiality, security, subprocessors, assistance, deletion/return and audit rights."],["International use","Include the transfer mechanism required for the customer and hosting jurisdictions actually used."],["Status","This page is a launch placeholder, not an executed DPA. Final legal wording requires counsel and confirmed production infrastructure."]] },
};

function LegalPage({kind}:{kind:string}) {
  const page=legalCopy[kind]||legalCopy.terms;
  return <section className="bg-[#fbfaf7]"><div className="mx-auto max-w-4xl px-5 py-20 sm:px-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Legal</p><h1 className="mt-5 text-5xl font-semibold tracking-tight">{page.title}</h1><p className="mt-6 text-lg leading-8 text-slate-600">{page.intro}</p><div className="mt-12 grid gap-5">{page.sections.map(([title,copy])=><section key={title} className="rounded-3xl border border-slate-200 bg-white p-7"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-slate-600">{copy}</p></section>)}</div></div></section>;
}

function NotFoundPage() {
  return <section className="bg-[#fbfaf7]"><div className="mx-auto max-w-3xl px-5 py-28 text-center sm:px-8"><p className="text-sm font-bold text-emerald-700">404</p><h1 className="mt-4 text-5xl font-semibold">This page is not part of the route.</h1><p className="mt-5 text-slate-600">Return to Sage Auto and continue from the product or solutions overview.</p><div className="mt-8"><LinkButton href="/">Go home</LinkButton></div></div></section>;
}

function routeContent(path:string) {
  if (path === "/") return <HomePage/>;
  if (path === "/product") return <HubPage type="product"/>;
  if (path.startsWith("/product/")) return <DetailPage page={productPages[path.split("/")[2]] || productPages.fleet}/>;
  if (path === "/solutions") return <HubPage type="solutions"/>;
  if (path.startsWith("/solutions/")) return <DetailPage page={solutionPages[path.split("/")[2]] || solutionPages["rental-companies"]}/>;
  if (path === "/pricing") return <PricingPage/>;
  if (path === "/resources") return <ResourcesPage/>;
  if (path.startsWith("/resources/")) return <DetailPage page={guidePages[path.split("/")[2]] || guidePages.guides}/>;
  if (path.startsWith("/compare/")) return <DetailPage page={comparePages[path.split("/")[2]] || comparePages.spreadsheets}/>;
  if (seoPages[path]) return <DetailPage page={seoPages[path]}/>;
  if (path === "/about") return <AboutPage/>;
  if (path.startsWith("/about/")) return <AboutPage subpage={path.split("/")[2]}/>;
  if (path === "/contact") return <ContactPage/>;
  if (path === "/security") return <SecurityPage/>;
  if (path === "/integrations") return <IntegrationsPage/>;
  if (path === "/developers") return <DevelopersPage/>;
  if (path === "/status") return <StatusPage/>;
  if (path.startsWith("/legal/")) return <LegalPage kind={path.split("/")[2]}/>;
  return <NotFoundPage/>;
}

export const marketingPaths = [
  "/",
  "/product",
  ...Object.keys(productPages).map(slug => `/product/${slug}`),
  "/solutions",
  ...Object.keys(solutionPages).map(slug => `/solutions/${slug}`),
  "/pricing",
  "/resources",
  ...Object.keys(guidePages).map(slug => `/resources/${slug}`),
  ...Object.keys(comparePages).map(slug => `/compare/${slug}`),
  ...Object.keys(seoPages),
  "/about",
  "/about/company",
  "/about/careers",
  "/about/partners",
  "/contact",
  "/security",
  "/integrations",
  "/developers",
  "/status",
  "/legal/privacy",
  "/legal/terms",
  "/legal/cookies",
  "/legal/dpa",
];

export function isMarketingPath(pathname:string) {
  const path=pathname.replace(/\/+$/, "") || "/";
  return marketingPaths.includes(path);
}

export default function MarketingSite() {
  const path=useMemo(()=>location.pathname.replace(/\/+$/, "") || "/",[]);
  useEffect(()=>{
    window.scrollTo(0,0);
    const titles:Record<string,string>={
      "/":"Sage Auto — Rental operations, connected",
      "/pricing":"Pricing — Sage Auto",
      "/about":"About — Sage Auto",
      "/contact":"Contact — Sage Auto",
      "/security":"Security — Sage Auto",
      "/integrations":"Integrations — Sage Auto",
      "/developers":"Developers — Sage Auto",
    };
    document.title=titles[path] || `${path.split("/").filter(Boolean).map(x=>x.replace(/-/g," ")).map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(" · ")} — Sage Auto`;
  },[path]);
  return <div className="min-h-screen bg-[#fbfaf7] font-sans text-slate-950 antialiased selection:bg-emerald-200 selection:text-emerald-950"><MarketingHeader/><main>{routeContent(path)}</main><MarketingFooter/></div>;
}
