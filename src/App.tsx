import AccessApp from "./components/AccessApp";
import TenantPublicSite from "./components/TenantPublicSite";
import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Gauge,
  Menu,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { AppProvider, useApp } from "./lib/store";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { SubscriptionRestrictedBanner } from "./components/SubscriptionRestrictedBanner";

// Views
import { DashboardView } from "./components/DashboardView";
import { FleetView } from "./components/FleetView";
import { VehicleOwnersView } from "./components/VehicleOwnersView";
import { BookingsView } from "./components/BookingsView";
import { RentalsView } from "./components/RentalsView";
import { ReturnFinalCalculationView } from "./components/ReturnFinalCalculationView";
import { InspectionsView } from "./components/InspectionsView";
import { MaintenanceView } from "./components/MaintenanceView";
import { ComplianceView } from "./components/ComplianceView";
import { CustomersView } from "./components/CustomersView";
import { PricingView } from "./components/PricingView";
import { AvailabilityView } from "./components/AvailabilityView";
import { FinanceView } from "./components/FinanceView";
import { SettlementsView } from "./components/SettlementsView";
import { PublicWebsiteView } from "./components/PublicWebsiteView";
import { SaaSControlPlaneView } from "./components/SaaSControlPlaneView";
import { WorkspaceSettingsView } from "./components/WorkspaceSettingsView";

// Modals
import { VehicleDetailsModal } from "./components/modals/VehicleDetailsModal";
import { BookingDetailsModal } from "./components/modals/BookingDetailsModal";
import { NewBookingModal } from "./components/modals/NewBookingModal";
import { NewVehicleModal } from "./components/modals/NewVehicleModal";
import { NewCustomerModal } from "./components/modals/NewCustomerModal";
import { NewOwnerModal } from "./components/modals/NewOwnerModal";
import { InspectionModal } from "./components/modals/InspectionModal";
import { MpesaModal } from "./components/modals/MpesaModal";
import { AuthModal } from "./components/AuthModal";
import { MaintenanceWorkOrderModal } from "./components/modals/MaintenanceWorkOrderModal";
import { NewWorkOrderModal } from "./components/modals/NewWorkOrderModal";
import { NewScheduleModal } from "./components/modals/NewScheduleModal";
import { NewProviderModal } from "./components/modals/NewProviderModal";

const stats = [
  { label: "Fleet utilization", value: "97%", detail: "Across 3 active hubs" },
  { label: "Booking conversion", value: "+42%", detail: "After launch optimization" },
  { label: "Average response time", value: "< 200ms", detail: "P95 across core flows" },
  { label: "Tenant satisfaction", value: "4.9/5", detail: "From customer operations" },
];

const features = [
  {
    icon: Building2,
    title: "Multi-tenant operations",
    text: "Run one fleet operating system across cities, brands, and workspace teams without cross-tenant leakage.",
  },
  {
    icon: Gauge,
    title: "Live pricing & availability",
    text: "Serve instant quotes, real-time inventory checks, and reservation holds with robust concurrency protection.",
  },
  {
    icon: CreditCard,
    title: "Payments & ledger control",
    text: "Automate M-Pesa and card flows while keeping every journal entry balanced and audit-ready.",
  },
  {
    icon: BarChart3,
    title: "Insights from every trip",
    text: "Track utilization, settlements, maintenance, and SaaS metrics from one operational command center.",
  },
];

const trustPoints = [
  "Enterprise-grade tenant isolation",
  "Financial ledger invariants and reconciliation",
  "Worker scheduling, event outbox, and retry automation",
  "Production-ready launch gate governance",
];

const testimonials = [
  {
    quote: "This replaced three disconnected systems. We now manage fleet, finance, and customer experience from one place.",
    name: "Mary Wanjiku",
    role: "Operations Director, Nairobi Fleet Group",
  },
  {
    quote: "The booking flow feels instant, and the platform makes compliance and settlements simple for every tenant.",
    name: "David Otieno",
    role: "Head of Commercial, East Rift Mobility",
  },
];

const faqs = [
  { q: "Who is this built for?", a: "Fleet operators, mobility brands, vehicle rental businesses, and SaaS operators managing multiple rental teams." },
  { q: "Can I manage multiple tenants?", a: "Yes. The platform is built for multi-tenant operations with strict data boundaries and workspace controls." },
  { q: "Does it support payments and settlements?", a: "Yes. It includes payment orchestration, ledger posting, and owner settlement workflows." },
  { q: "Is it production-ready?", a: "The system includes launch-gate governance, observability, resilience checks, and compliance-safe operating procedures." },
];

const LandingPage: React.FC<{ onLogin: () => void }> = ({onLogin}) => <main className="flex min-h-screen items-center bg-slate-950 px-8 text-white"><div className="mx-auto w-full max-w-5xl space-y-8"><p className="text-emerald-400">Car Hire OS</p><h1 className="max-w-3xl text-5xl font-bold">Your fleet, bookings and rental business in one workspace.</h1><p className="max-w-2xl text-xl text-slate-300">Manage your cars, publish your website and receive booking requests online.</p><button onClick={onLogin} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold">Sign in or create an account</button></div></main>;

const AppContent: React.FC = () => {
  const { currentView, isDarkMode } = useApp();

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <DashboardView />;
      case "fleet":
        return <FleetView />;
      case "availability":
        return <AvailabilityView />;
      case "owners":
        return <VehicleOwnersView />;
      case "bookings":
        return <BookingsView />;
      case "rentals":
        return <RentalsView />;
      case "returns":
        return <ReturnFinalCalculationView />;
      case "inspections":
        return <InspectionsView />;
      case "maintenance":
        return <MaintenanceView />;
      case "compliance":
        return <ComplianceView />;
      case "customers":
        return <CustomersView />;
      case "pricing":
        return <PricingView />;
      case "finance":
        return <FinanceView />;
      case "settlements":
        return <SettlementsView />;
      case "website":
        return <PublicWebsiteView />;
      case "control-plane":
        return <SaaSControlPlaneView />;
      case "settings":
        return <WorkspaceSettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 font-sans text-slate-900 antialiased selection:bg-emerald-500 selection:text-white dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <SubscriptionRestrictedBanner />
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">{renderView()}</main>
      </div>
      <VehicleDetailsModal />
      <BookingDetailsModal />
      <NewBookingModal />
      <NewVehicleModal />
      <NewCustomerModal />
      <NewOwnerModal />
      <InspectionModal />
      <MpesaModal />
      <AuthModal />
      <MaintenanceWorkOrderModal />
      <NewWorkOrderModal />
      <NewScheduleModal />
      <NewProviderModal />
    </div>
  );
};

const AppShell: React.FC = () => {
  const { setIsAuthModalOpen, setAuthModalMode, authenticatedUser, tenants, workspaceLoading, workspaceError, provisionNewTenant } = useApp();
  const [workspaceName,setWorkspaceName]=useState("");
  const [setupError,setSetupError]=useState("");
  const [savingWorkspace,setSavingWorkspace]=useState(false);
  const [showLandingPage, setShowLandingPage] = useState(true);

  const handleLogin = () => {
    setAuthModalMode("LOGIN");
    setIsAuthModalOpen(true);
  };

  useEffect(() => {
    setShowLandingPage(!Boolean(authenticatedUser));
  }, [authenticatedUser]);

  if (showLandingPage) {
    return (
      <>
        <LandingPage onLogin={handleLogin} />
        <AuthModal />
      </>
    );
  }

  if (workspaceLoading) return <div className="p-12" role="status">Loading your workspace…</div>;
  if (workspaceError) return <div className="p-12" role="alert">{workspaceError}<button onClick={()=>location.reload()} className="ml-4 underline">Retry</button></div>;
  if (!tenants.length) return <main className="mx-auto max-w-xl space-y-6 p-10"><h1 className="text-3xl font-bold">Set up your rental workspace</h1><p>Your account is saved. Create a workspace for your fleet and bookings.</p><form onSubmit={async e=>{e.preventDefault();setSavingWorkspace(true);setSetupError("");try{await provisionNewTenant({name:workspaceName});}catch(e:any){setSetupError(e.message);}finally{setSavingWorkspace(false);}}} className="space-y-4"><label className="block">Business name<input required minLength={2} value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)} className="mt-2 block w-full rounded border p-3"/></label>{setupError&&<p role="alert">{setupError}</p>}<button disabled={savingWorkspace} className="rounded bg-emerald-700 px-5 py-3 text-white">{savingWorkspace?'Creating…':'Create workspace'}</button></form></main>;
  return <AppContent />;
};

export default function App() {
  const publicSite=location.pathname.match(/^\/site\/([a-z0-9-]+)(?:\/|$)/);
  if(publicSite && !location.pathname.endsWith('/account')) return <TenantPublicSite slug={publicSite[1]}/>;
  return <AccessApp site={publicSite?.[1]}/>;
}
