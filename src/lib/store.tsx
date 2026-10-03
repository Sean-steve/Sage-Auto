import { AccessContext, AccessPortal, originalViews, permits } from "./access-context";
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "./api-client";
import {
  Tenant,
  User,
  TenantMembership,
  PlatformMembership,
  Plan,
  Subscription,
  SubscriptionState,
  BillingInvoice,
  Vehicle,
  VehicleOwner,
  VehicleOwnership,
  Customer,
  CustomerType,
  VerificationStatus,
  CorporateAccount,
  Driver,
  Booking,
  BookingStatusTransition,
  Rental,
  RentalExtension,
  VehicleInspection,
  MaintenanceRecord,
  ServiceProvider,
  ComplianceDocument,
  TenantInvoice,
  TenantPayment,
  PaymentAttempt,
  TenantExpense,
  PrototypeLedgerAccount,
  PrototypeLedgerTransaction,
  OwnerSettlement,
  OutboxEvent,
  AuditRecord,
  TenantWebsite,
  TenantDomain,
  RatePlan,
  RatePlanRate,
  SeasonalRateRule,
  DurationTierRule,
  PricingFeeRule,
  PricingFeeType,
  PromoCode,
  PromoCodeStatus,
  PricingRequest,
  PricingResult,
  DayRateItem,
  AppliedDiscountItem,
  PricingSnapshot,
  ActiveTab,
  BookingStatus,
  RentalState,
  EntitlementDecision,
  EntitlementOverride,
  EntitlementRestriction,
  CreateEntitlementOverrideDto,
  CreateEntitlementRestrictionDto,
  TenantAccessMode,
  OperationCategory,
  SubscriptionAccessDecision,
  MaintenanceWorkOrder,
  MaintenanceSchedule,
  MaintenanceTask,
  MaintenancePartItem,
  MaintenanceCostItem,
  MaintenanceEvidence,
  MaintenanceVerification,
  MaintenanceStatusHistory,
  CreateMaintenanceRequestDto,
  ScheduleMaintenanceDto,
  StartMaintenanceDto,
  AddMaintenanceTaskDto,
  UpdateMaintenanceTaskDto,
  AddPartItemDto,
  RecordCostItemDto,
  CompleteMaintenanceDto,
  VerifyMaintenanceDto,
  CancelMaintenanceDto,
  CreateMaintenanceScheduleDto,
  UpdateMaintenanceScheduleDto,
  CreateServiceProviderDto,
  UpdateServiceProviderDto,
  MaintenanceDueResult,
  MaintenanceStatus,
  MaintenanceType,
  MaintenancePriority,
} from "../types";
import { INITIAL_VEHICLES, INITIAL_PLANS } from "./mockData";
import confetti from "canvas-confetti";

interface AppContextType {
  restoration: boolean;
  hasPermission: (permission: string) => boolean;
  // Current Navigation & Context
  currentView: ActiveTab;
  setCurrentView: (view: ActiveTab) => void;
  navigateSection: (section: string) => void;
  activeTenantId: string;
  setActiveTenantId: (id: string) => void;
  activeTenant: Tenant;
  currentUser: User;
  authenticatedUser: User | null;
  isAuthenticated: boolean;
  activeMembership?: TenantMembership;
  platformMembership: PlatformMembership;
  isPlatformAdminMode: boolean;
  setIsPlatformAdminMode: (mode: boolean) => void;
  isSupportAccessActive: boolean;
  supportAccessReason: string | null;
  startSupportAccess: (reason: string) => void;
  endSupportAccess: () => void;

  // Search & Global Filter
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;

  // Tenancy Data (Multi-tenant scoped)
  tenants: Tenant[];
  users: User[];
  memberships: TenantMembership[];
  plans: Plan[];
  subscriptions: Subscription[];
  activeSubscription: Subscription;
  activePlan: Plan;
  billingInvoices: BillingInvoice[];

  // Tenant Entities
  vehicles: Vehicle[];
  vehicleOwners: VehicleOwner[];
  vehicleOwnerships: VehicleOwnership[];
  customers: Customer[];
  corporateAccounts: CorporateAccount[];
  drivers: Driver[];
  bookings: Booking[];
  rentals: Rental[];
  inspections: VehicleInspection[];
  maintenance: MaintenanceRecord[];
  maintenanceWorkOrders: MaintenanceWorkOrder[];
  maintenanceSchedules: MaintenanceSchedule[];
  serviceProviders: ServiceProvider[];
  complianceDocs: ComplianceDocument[];
  invoices: TenantInvoice[];
  payments: TenantPayment[];
  paymentAttempts: PaymentAttempt[];
  expenses: TenantExpense[];
  ledgerAccounts: PrototypeLedgerAccount[];
  ledgerTransactions: PrototypeLedgerTransaction[];
  settlements: OwnerSettlement[];
  outboxEvents: OutboxEvent[];
  auditRecords: AuditRecord[];
  websites: TenantWebsite[];
  domains: TenantDomain[];

  // Selected item modal controls
  selectedVehicleId: string | null;
  setSelectedVehicleId: (id: string | null) => void;
  selectedBookingId: string | null;
  setSelectedBookingId: (id: string | null) => void;
  selectedRentalId: string | null;
  setSelectedRentalId: (id: string | null) => void;
  selectedInspectionId: string | null;
  setSelectedInspectionId: (id: string | null) => void;
  selectedOwnerId: string | null;
  setSelectedOwnerId: (id: string | null) => void;
  selectedMaintenanceId: string | null;
  setSelectedMaintenanceId: (id: string | null) => void;
  selectedScheduleId: string | null;
  setSelectedScheduleId: (id: string | null) => void;

  // Modals & Action Drawers
  isNewBookingOpen: boolean;
  setIsNewBookingOpen: (open: boolean) => void;
  isNewVehicleOpen: boolean;
  setIsNewVehicleOpen: (open: boolean) => void;
  isNewCustomerOpen: boolean;
  setIsNewCustomerOpen: (open: boolean) => void;
  isNewOwnerOpen: boolean;
  setIsNewOwnerOpen: (open: boolean) => void;
  isInspectionModalOpen: boolean;
  setIsInspectionModalOpen: (open: boolean) => void;
  inspectionTarget: { bookingId?: string; rentalId?: string; vehicleId: string; type: "HANDOVER" | "RETURN" } | null;
  setInspectionTarget: (target: { bookingId?: string; rentalId?: string; vehicleId: string; type: "HANDOVER" | "RETURN" } | null) => void;
  isNewWorkOrderModalOpen: boolean;
  setIsNewWorkOrderModalOpen: (open: boolean) => void;
  isNewScheduleModalOpen: boolean;
  setIsNewScheduleModalOpen: (open: boolean) => void;
  isNewProviderModalOpen: boolean;
  setIsNewProviderModalOpen: (open: boolean) => void;
  isMpesaModalOpen: boolean;
  setIsMpesaModalOpen: (open: boolean) => void;
  mpesaTargetBooking: Booking | null;
  setMpesaTargetBooking: (booking: Booking | null) => void;

  // Notifications
  notification: { message: string; type: "success" | "error" | "info" } | null;
  showNotification: (message: string, type?: "success" | "error" | "info") => void;

  // Entitlement Engine (ENT-001)
  entitlementOverrides: EntitlementOverride[];
  entitlementRestrictions: EntitlementRestriction[];
  checkEntitlement: (feature: string) => EntitlementDecision;
  canUseCapability: (feature: string) => boolean;
  createEntitlementOverride: (dto: CreateEntitlementOverrideDto) => void;
  revokeEntitlementOverride: (id: string) => void;
  createEntitlementRestriction: (dto: CreateEntitlementRestrictionDto) => void;
  liftEntitlementRestriction: (id: string) => void;

  // Subscription Enforcement & Restricted Mode (Sprint 8: ENT-001, ARCH-004, DEV-007)
  accessMode: TenantAccessMode;
  isRestricted: boolean;
  statusBanner: {
    type: "WARNING" | "RESTRICTED" | "SUSPENDED" | "EXPIRED";
    title: string;
    message: string;
    actionUrl: string;
    actionLabel: string;
  } | null;
  evaluateSubscriptionAccess: (operationCategory: OperationCategory) => SubscriptionAccessDecision;

  // Authoritative Availability Engine (DOM-001 §13, BRS-001 §6, Amendment A07)
  checkVehicleAvailability: (
    vehicleId: string,
    startDate: string,
    endDate: string,
    excludeBookingId?: string
  ) => { available: boolean; conflictReason?: string };

  // Domain Actions - Fleet & Ownership
  addVehicle: (vehicle: Omit<Vehicle, "id" | "tenantId" | "createdAt" | "updatedAt">) => Promise<Vehicle | null>;
  updateVehicle: (id: string, updates: Partial<Vehicle>) => void;
  deleteVehicle: (id: string) => void;
  addVehicleOwner: (owner: Omit<VehicleOwner, "id" | "tenantId" | "createdAt">) => VehicleOwner;
  attachVehicleOwnership: (ownership: Omit<VehicleOwnership, "id" | "tenantId" | "createdAt">) => VehicleOwnership;

  // Domain Actions - Customers & Drivers
  addCustomer: (
    customer: Omit<Customer, "id" | "tenantId" | "createdAt" | "totalRentalsCount" | "customerNumber" | "version" | "customerType" | "verificationStatus"> & {
      customerNumber?: string;
      customerType?: CustomerType;
      verificationStatus?: VerificationStatus;
    }
  ) => Promise<Customer | null>;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  addDriver: (
    driver: Omit<Driver, "id" | "tenantId" | "createdAt" | "driverNumber" | "version"> & {
      driverNumber?: string;
      version?: number;
    }
  ) => Driver;

  // Domain Actions - Booking Canonical State Machine (BRS-001 §11-27)
  createBooking: (bookingData: Omit<Booking, "id" | "tenantId" | "bookingNumber" | "statusHistory" | "substitutions" | "createdAt" | "updatedAt">) => Promise<Booking | null>;
  confirmBooking: (bookingId: string, reason?: string) => boolean;
  cancelBooking: (bookingId: string, reason: string) => boolean;
  rejectBooking: (bookingId: string, reason: string) => boolean;
  rescheduleBooking: (bookingId: string, newStart: string, newEnd: string) => boolean;
  substituteVehicle: (bookingId: string, replacementVehicleId: string, reason: string) => boolean;

  // Domain Actions - Rental Operations (BRS-001 §28-39, Amendment A06)
  createRentalFromBooking: (bookingId: string) => Promise<Rental | null>;
  startRental: (rentalId: string) => void;
  extendRental: (rentalId: string, newEndDate: string, additionalDays: number, additionalCost: number) => boolean;
  completeRental: (rentalId: string, returnOdometer: number, returnFuelLevel: number) => void;
  recordRentalIncident: (rentalId: string, incident: Omit<Rental["incidents"][0], "id">) => void;

  // Domain Actions - Inspections & Damage
  saveInspection: (inspection: Omit<VehicleInspection, "id" | "tenantId" | "createdAt">) => VehicleInspection;

  // Domain Actions - Maintenance Management (Sprint 17: DOM-003 §21-24, DEV-006, DEV-007, BRS-001)
  createMaintenanceRequest: (dto: CreateMaintenanceRequestDto) => MaintenanceWorkOrder | null;
  scheduleMaintenanceWorkOrder: (id: string, dto: ScheduleMaintenanceDto) => boolean;
  startMaintenanceWorkOrder: (id: string, dto?: StartMaintenanceDto) => boolean;
  addMaintenanceTask: (id: string, dto: AddMaintenanceTaskDto) => MaintenanceTask | null;
  updateMaintenanceTask: (id: string, taskId: string, dto: UpdateMaintenanceTaskDto) => boolean;
  addMaintenancePart: (id: string, dto: AddPartItemDto) => MaintenancePartItem | null;
  recordMaintenanceCost: (id: string, dto: RecordCostItemDto) => MaintenanceCostItem | null;
  completeMaintenanceWorkOrder: (id: string, dto: CompleteMaintenanceDto) => boolean;
  verifyMaintenanceWorkOrder: (id: string, dto: VerifyMaintenanceDto) => boolean;
  cancelMaintenanceWorkOrder: (id: string, dto: CancelMaintenanceDto) => boolean;
  createMaintenanceSchedule: (dto: CreateMaintenanceScheduleDto) => MaintenanceSchedule;
  updateMaintenanceSchedule: (id: string, dto: UpdateMaintenanceScheduleDto) => boolean;
  createServiceProvider: (dto: CreateServiceProviderDto) => ServiceProvider;
  updateServiceProvider: (id: string, dto: UpdateServiceProviderDto) => boolean;
  evaluateMaintenanceDue: (vehicleId?: string) => MaintenanceDueResult[];

  // Legacy Maintenance & Compliance (Compatibility)
  scheduleMaintenance: (maintData: Omit<MaintenanceRecord, "id" | "tenantId" | "createdAt">) => void;
  updateMaintenanceStatus: (id: string, status: MaintenanceRecord["status"]) => void;
  addComplianceDocument: (doc: Omit<ComplianceDocument, "id" | "tenantId">) => void;
  overrideComplianceHold: (docId: string, reason: string) => void;

  // Domain Actions - Finance & Settlements (DATA-004)
  recordPayment: (paymentData: Omit<TenantPayment, "id" | "tenantId" | "paymentNumber" | "recordedAt" | "postedToLedger">) => TenantPayment;
  addExpense: (expense: Omit<TenantExpense, "id" | "tenantId" | "createdAt">) => TenantExpense;
  calculateOwnerSettlement: (ownerId: string, periodStart: string, periodEnd: string) => OwnerSettlement;
  approveOwnerSettlement: (settlementId: string) => void;
  payOwnerSettlement: (settlementId: string, payoutRef: string) => void;
  postLedgerTransaction: (tx: Omit<PrototypeLedgerTransaction, "id" | "tenantId" | "postedAt">) => boolean;

  // Domain Actions - Payments & Integrations (PAY-001)
  processMpesaPayment: (bookingId: string, phoneNumber: string, amount: number) => Promise<PaymentAttempt>;

  // Compatibility adapter aliases
  registerVehicle: (vehicle: Omit<Vehicle, "id" | "tenantId" | "createdAt" | "updatedAt">) => Promise<Vehicle | null>;
  recordInspection: (inspection: any) => any;
  triggerMpesaStkPush: (bookingId: string, phoneNumber: string, amount: number) => Promise<PaymentAttempt>;
  updateSubscriptionState: (idOrTenantId: string, state: SubscriptionState, reason?: string) => void;
  switchSubscriptionPlan: (tenantId: string, planId: string) => void;
  updateTenantWebsiteConfig: (config: any) => void;
  activeRateRules: any[];

  // Pricing & Rate Engine (Sprint 11: DEV-006, DEV-007, BRS-001)
  ratePlans: RatePlan[];
  ratePlanRates: RatePlanRate[];
  seasonalRules: SeasonalRateRule[];
  durationTiers: DurationTierRule[];
  pricingFees: PricingFeeRule[];
  promoCodes: PromoCode[];
  createRatePlan: (plan: Partial<RatePlan>) => RatePlan;
  updateRatePlan: (id: string, updates: Partial<RatePlan>) => void;
  activateRatePlan: (id: string) => void;
  archiveRatePlan: (id: string) => void;
  saveRatePlanRates: (ratePlanId: string, rates: RatePlanRate[]) => void;
  createSeasonalRule: (rule: Partial<SeasonalRateRule>) => void;
  deleteSeasonalRule: (id: string) => void;
  createDurationTier: (tier: Partial<DurationTierRule>) => void;
  deleteDurationTier: (id: string) => void;
  createPricingFee: (fee: Partial<PricingFeeRule>) => void;
  createPromoCode: (promo: Partial<PromoCode>) => void;
  togglePromoStatus: (id: string) => void;
  calculateInstantQuote: (req: PricingRequest) => PricingResult;

  // SaaS Control Plane Actions
  changeTenantPlan: (planId: string) => void;
  toggleTenantSuspension: (tenantId: string) => void;
  updateTenantSettings: (settings: Partial<Tenant>) => void;
  updateWebsite: (website: Partial<TenantWebsite>) => void;
  verifyCustomDomain: (domainId: string) => void;
  resetToSeedData: () => void;

  // Identity & Auth Session Actions (Sprint 3: DEV-004, SEC-007)
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  authModalMode: "LOGIN" | "REGISTER" | "FORGOT_PASSWORD" | "RESET_PASSWORD" | "VERIFY_EMAIL" | "SESSIONS";
  setAuthModalMode: (mode: "LOGIN" | "REGISTER" | "FORGOT_PASSWORD" | "RESET_PASSWORD" | "VERIFY_EMAIL" | "SESSIONS") => void;
  activeSessions: any[];
  loginUser: (email: string, password: string) => Promise<boolean>;
  registerUser: (email: string, password: string, fullName: string, phone?: string) => Promise<boolean>;
  logoutUser: (allSessions?: boolean) => Promise<void>;
  forgotPasswordUser: (email: string) => Promise<boolean>;
  resetPasswordUser: (token: string, newPassword: string) => Promise<boolean>;
  verifyEmailUser: (token: string) => Promise<boolean>;
  resendVerificationUser: (email: string) => Promise<boolean>;
  revokeSessionUser: (sessionId: string) => Promise<void>;
  revokeAllSessionsUser: () => Promise<void>;

  // Multi-Tenancy & Trusted Context (Sprint 4: DEV-004, DOM-003 §4-6)
  userMemberships: TenantMembership[];
  switchTenant: (targetTenantId: string) => Promise<boolean>;
  provisionNewTenant: (dto: any) => Promise<boolean>;
  workspaceLoading: boolean;
  workspaceError: string;
}


const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode; access?:{context:AccessContext;portal:AccessPortal;section:string;onSection:(section:string)=>void} }> = ({ children, access }) => {
  // Active tenant & view state
  const [currentView, setCurrentView] = useState<ActiveTab>("dashboard");
  const [activeTenantId, setActiveTenantId] = useState<string>(access?.portal.tenantId || apiClient.getTenantId());
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [isPlatformAdminMode, setIsPlatformAdminMode] = useState<boolean>(false);
  const [isSupportAccessActive, setIsSupportAccessActive] = useState<boolean>(false);
  const [supportAccessReason, setSupportAccessReason] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Selected modals
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedRentalId, setSelectedRentalId] = useState<string | null>(null);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedMaintenanceId, setSelectedMaintenanceId] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [isNewVehicleOpen, setIsNewVehicleOpen] = useState(false);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [isNewOwnerOpen, setIsNewOwnerOpen] = useState(false);
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState(false);
  const [inspectionTarget, setInspectionTarget] = useState<{
    bookingId?: string;
    rentalId?: string;
    vehicleId: string;
    type: "HANDOVER" | "RETURN";
  } | null>(null);

  const [isNewWorkOrderModalOpen, setIsNewWorkOrderModalOpen] = useState(false);
  const [isNewScheduleModalOpen, setIsNewScheduleModalOpen] = useState(false);
  const [isNewProviderModalOpen, setIsNewProviderModalOpen] = useState(false);

  const [isMpesaModalOpen, setIsMpesaModalOpen] = useState(false);
  const [mpesaTargetBooking, setMpesaTargetBooking] = useState<Booking | null>(null);

  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showNotification = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  }, []);

  // Persistent States
  const [tenants, setTenants] = useState<Tenant[]>([]);

  const [users, setUsers] = useState<User[]>([]);
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(access?.context.user as User || null);
  const [activeSessionsList, setActiveSessionsList] = useState<any[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<
    "LOGIN" | "REGISTER" | "FORGOT_PASSWORD" | "RESET_PASSWORD" | "VERIFY_EMAIL" | "SESSIONS"
  >("LOGIN");

  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [platformMembership] = useState<PlatformMembership>({} as PlatformMembership);
  const [plans] = useState<Plan[]>(access?[]:INITIAL_PLANS);

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  const [billingInvoices, setBillingInvoices] = useState<BillingInvoice[]>([]);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [vehicleOwners, setVehicleOwners] = useState<VehicleOwner[]>([]);

  const [vehicleOwnerships, setVehicleOwnerships] = useState<VehicleOwnership[]>([]);

  const [customers, setCustomers] = useState<Customer[]>([]);

  const [corporateAccounts] = useState<CorporateAccount[]>([]);

  const [drivers, setDrivers] = useState<Driver[]>([]);

  const [bookings, setBookings] = useState<Booking[]>([]);

  const [rentals, setRentals] = useState<Rental[]>([]);

  const [inspections, setInspections] = useState<VehicleInspection[]>([]);

  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);

  const [maintenanceWorkOrders, setMaintenanceWorkOrders] = useState<MaintenanceWorkOrder[]>([]);

  const [maintenanceSchedules, setMaintenanceSchedules] = useState<MaintenanceSchedule[]>([]);

  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([]);

  const [complianceDocs, setComplianceDocs] = useState<ComplianceDocument[]>([]);

  const [invoices, setInvoices] = useState<TenantInvoice[]>([]);

  const [payments, setPayments] = useState<TenantPayment[]>([]);

  const [paymentAttempts, setPaymentAttempts] = useState<PaymentAttempt[]>([]);

  const [expenses, setExpenses] = useState<TenantExpense[]>([]);

  const [ledgerAccounts, setLedgerAccounts] = useState<PrototypeLedgerAccount[]>([]);

  const [ledgerTransactions, setLedgerTransactions] = useState<PrototypeLedgerTransaction[]>([]);

  const [settlements, setSettlements] = useState<OwnerSettlement[]>([]);

  const [outboxEvents, setOutboxEvents] = useState<OutboxEvent[]>([]);

  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);

  const [websites, setWebsites] = useState<TenantWebsite[]>([]);

  const [domains, setDomains] = useState<TenantDomain[]>([]);

  // Sprint 11 Pricing State
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);

  const [ratePlanRates, setRatePlanRates] = useState<RatePlanRate[]>([]);

  const [seasonalRules, setSeasonalRules] = useState<SeasonalRateRule[]>([]);

  const [durationTiers, setDurationTiers] = useState<DurationTierRule[]>([]);

  const [pricingFees, setPricingFees] = useState<PricingFeeRule[]>([]);

  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);

  useEffect(() => {
    if (access) return;
    if (!authenticatedUser) { setTenants([]); setMemberships([]); return; }
    let cancelled = false;
    setWorkspaceLoading(true); setWorkspaceError("");
    (async () => {
      const response = await apiClient.tenancy.listTenants();
      if (response.error) throw new Error(response.error.message);
      const memberships = response.data || [];
      const allowed = memberships.filter((m: any) => m.status === "ACTIVE");
      const chosen = allowed.find((m:any) => m.tenantId === apiClient.getTenantId()) || allowed[0];
      if (cancelled) return;
      setMemberships(allowed.map((m:any) => ({id:m.membershipId,tenantId:m.tenantId,userId:authenticatedUser.id,role:m.role,roleName:m.role.replace(/_/g," "),roleId:m.role === "COMPANY_OWNER" ? "role-owner" : m.role,status:m.status,joinedAt:m.joinedAt})));
      if (!chosen) {setTenants([]);setActiveTenantId("");return;}
      apiClient.setTenantId(chosen.tenantId);
      const details = await apiClient.get('/tenant/details');
      if (details.error) throw new Error(details.error.message);
      if (cancelled) return;
      setTenants(allowed.map((m:any)=>m.tenantId===chosen.tenantId?details.data.tenant:{id:m.tenantId,name:m.tenantName,slug:m.tenantSlug,status:m.tenantStatus,planId:"plan-growth",currency:"KES",createdAt:"",updatedAt:""}));
      setActiveTenantId(chosen.tenantId);
    })().catch(e=>!cancelled&&setWorkspaceError(e.message)).finally(()=>!cancelled&&setWorkspaceLoading(false));
    return()=>{cancelled=true;};
  }, [authenticatedUser?.id]);

  useEffect(() => {
    if (access) return;
    if (!authenticatedUser || !activeTenantId || !tenants.some(t=>t.id===activeTenantId)) return;
    let cancelled=false;
    setVehicles([]);setBookings([]);setCustomers([]);
    async function refresh() {
      const tenantId=activeTenantId;
      const [fleet,bookingResult,customerResult,subscriptionResult] = await Promise.all([
        apiClient.fleet.listVehicles({limit:1000}),apiClient.bookings.listBookings({limit:1000}),apiClient.customers.listCustomers(), apiClient.get("/subscription")
      ]);
      if(cancelled) return;
      for(const result of [fleet,bookingResult,customerResult,subscriptionResult]) if(result.error) throw new Error(result.error.message);
      setSubscriptions(prev => [...prev.filter(s => s.tenantId !== tenantId), ...(subscriptionResult.data?.subscription ? [subscriptionResult.data.subscription] : [])]);
      setVehicles(fleet.data || []);
      setBookings((bookingResult.data || []).map((b:any)=>({...b,startDate:b.startDate||b.pickupAt,endDate:b.endDate||b.returnAt,statusHistory:b.statusHistory||[],substitutions:b.substitutions||[]})));
      setCustomers(Array.isArray(customerResult.data)?customerResult.data:(customerResult.data as any)?.customers||[]);
    }
    refresh().catch(e=>!cancelled&&showNotification(e.message,"error"));
    const timer=setInterval(()=>refresh().catch(()=>{}),15000);
    const onFocus=()=>refresh().catch(e=>!cancelled&&showNotification(e.message,"error"));
    window.addEventListener('focus',onFocus);
    return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',onFocus);};
  },[authenticatedUser?.id,activeTenantId,tenants.length,memberships]);

  useEffect(() => {
    if(!access) return;
    let cancelled=false;
    const {portal}=access;
    setWorkspaceLoading(true);setWorkspaceError("");
    setTenants([{id:portal.tenantId||portal.id,name:portal.name,slug:'',currency:'KES'} as Tenant]);
    setMemberships([{id:portal.id,tenantId:portal.tenantId,userId:access.context.user.id,role:portal.roles[0],roleName:portal.roles.join(', '),status:'ACTIVE'} as TenantMembership]);
    const reads:[string,()=>Promise<any>,(data:any)=>void][]=[
      ['subscription.read',()=>apiClient.get('/subscription'),data=>setSubscriptions(data?.subscription ? [data.subscription] : [])],
      ['',()=>apiClient.tenancy.getTenant(portal.tenantId||portal.id),data=>{
        if (!data?.tenant || data.tenant.id !== (portal.tenantId||portal.id)) throw new Error('Workspace details could not be verified.');
        setTenants([data.tenant]);
      }],
      ['vehicle.read',()=>apiClient.fleet.listVehicles({limit:1000}),data=>setVehicles(data||[])],
      ['booking.read',()=>apiClient.bookings.listBookings({limit:1000}),data=>setBookings((data||[]).map((b:any)=>({...b,startDate:b.startDate||b.pickupAt,endDate:b.endDate||b.returnAt,statusHistory:b.statusHistory||[],substitutions:b.substitutions||[]})))],
      ['customer.read',()=>apiClient.customers.listCustomers(),data=>setCustomers(Array.isArray(data)?data:data?.customers||[])],
    ];
    Promise.all(reads.filter(([permission])=>!permission||permits(portal,permission)).map(async([,read,save])=>{
      try {const result=await read();if(cancelled)return;if(result.error)throw new Error(result.error.message);save(result.data);}
      catch(error:any){if(!cancelled)setWorkspaceError(previous=>[previous,error.message].filter(Boolean).join(' · '));}
    })).finally(()=>{if(!cancelled)setWorkspaceLoading(false);});
    return()=>{cancelled=true;};
  },[access?.portal.id]);

  // Derived Active Tenant and User Objects
  const activeTenant = useMemo(() => {
    return tenants.find((t) => t.id === activeTenantId) || tenants[0] || {id:"",name:"",slug:"",status:"ACTIVE",planId:"plan-growth",currency:"KES",createdAt:"",updatedAt:""} as Tenant;
  }, [tenants, activeTenantId]);

  const currentUser = useMemo(() => {
    return authenticatedUser ?? ({} as User);
  }, [authenticatedUser]);

  const isAuthenticated = Boolean(authenticatedUser);


  const activeMembership = useMemo(() => {
    return memberships.find((m) => m.tenantId === activeTenantId && m.userId === currentUser.id);
  }, [memberships, activeTenantId, currentUser]);

  const activeSubscription = useMemo((): Subscription => {
    return (
      subscriptions.find((s) => s.tenantId === activeTenantId) || {
        id: "",
        tenantId: activeTenantId,
        planId: activeTenant.planId,
        state: "SUSPENDED" as SubscriptionState,
        currentPeriodStart: "",
        currentPeriodEnd: "",
        billingCycle: "MONTHLY",
        amount: 0,
        currency: activeTenant.currency,
        autoRenew: false,
      }
    );
  }, [subscriptions, activeTenantId, activeTenant]);

  const activePlan = useMemo(() => {
    return plans.find((p) => p.id === activeSubscription.planId) || plans[1];
  }, [plans, activeSubscription]);

  // Helper: Append Outbox Event & Audit Record atomically
  const emitDomainFact = useCallback(
    (
      eventType: string,
      aggregateType: string,
      aggregateId: string,
      data: Record<string, any>,
      actionCode: string
    ) => {
      const corrId = `corr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const newEvent: OutboxEvent = {
        eventId: `evt-${Date.now().toString(36)}`,
        eventType,
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        tenantId: activeTenantId,
        source: aggregateType.toLowerCase(),
        correlationId: corrId,
        aggregate: { type: aggregateType, id: aggregateId },
        data,
        status: "PROCESSED",
        attempts: 1,
        lastAttemptAt: new Date().toISOString(),
      };
      const newAudit: AuditRecord = {
        id: `aud-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
        actorId: currentUser.id,
        actorEmail: currentUser.email,
        actorType: isSupportAccessActive ? "PLATFORM_STAFF" : "USER",
        action: actionCode,
        resourceType: aggregateType,
        resourceId: aggregateId,
        correlationId: corrId,
        details: data,
        timestamp: new Date().toISOString(),
      };

      setOutboxEvents((prev) => [newEvent, ...prev]);
      setAuditRecords((prev) => [newAudit, ...prev]);
    },
    [activeTenantId, currentUser, isSupportAccessActive]
  );

  // --------------------------------------------------------------------------
  // ENTITLEMENT ENGINE (ENT-001 §3-6)
  // Authoritative Precedence Matrix & Capacity Evaluation
  // --------------------------------------------------------------------------
  const [entitlementOverrides, setEntitlementOverrides] = useState<EntitlementOverride[]>(() => {
    if(access) return [];
    const s = localStorage.getItem("carhire_entitlement_overrides");
    return s ? JSON.parse(s) : [];
  });

  const [entitlementRestrictions, setEntitlementRestrictions] = useState<EntitlementRestriction[]>(() => {
    if(access) return [];
    const s = localStorage.getItem("carhire_entitlement_restrictions");
    return s ? JSON.parse(s) : [];
  });

  useEffect(() => {
    if(!access) localStorage.setItem("carhire_entitlement_overrides", JSON.stringify(entitlementOverrides));
  }, [entitlementOverrides]);

  useEffect(() => {
    if(!access) localStorage.setItem("carhire_entitlement_restrictions", JSON.stringify(entitlementRestrictions));
  }, [entitlementRestrictions]);

  const checkEntitlement = useCallback(
    (feature: string): EntitlementDecision => {
      if (access) return {allowed:false,feature,source:'DEFAULT'};
      // 1. Check Subscription State
      const subState = (activeSubscription?.state || activeSubscription?.status || "").toUpperCase();
      if (subState === "SUSPENDED") {
        return {
          allowed: false,
          feature,
          code: "SUBSCRIPTION_SUSPENDED",
          reason: "SUBSCRIPTION_SUSPENDED",
          limit: 0,
          isUnlimited: false,
          usage: 0,
          currentUsage: 0,
          remaining: 0,
          message: "Workspace subscription is suspended.",
          upgradeRecommended: false,
        };
      }
      if (subState === "EXPIRED" || subState === "CANCELLED" || subState === "INACTIVE") {
        return {
          allowed: false,
          feature,
          code: "SUBSCRIPTION_INACTIVE",
          reason: "SUBSCRIPTION_INACTIVE",
          limit: 0,
          isUnlimited: false,
          usage: 0,
          currentUsage: 0,
          remaining: 0,
          message: "Subscription is expired or inactive.",
          upgradeRecommended: true,
        };
      }

      // 2. Check Platform Restrictions (Highest precedence)
      const activePlatformRest = entitlementRestrictions.find(
        (r) => r.scope === "PLATFORM" && r.featureKey === feature && r.status === "ACTIVE"
      );
      if (activePlatformRest) {
        if (activePlatformRest.restrictionType === "BLOCK") {
          return {
            allowed: false,
            feature,
            code: "PLATFORM_RESTRICTED",
            reason: "PLATFORM_RESTRICTED",
            source: "PLATFORM_RESTRICTION",
            limit: 0,
            isUnlimited: false,
            remaining: 0,
            message: `Platform restriction enforced: ${activePlatformRest.reason}`,
          };
        }
      }

      // 3. Check Tenant Restrictions
      const activeTenantRest = entitlementRestrictions.find(
        (r) => r.scope === "TENANT" && r.tenantId === activeTenantId && r.featureKey === feature && r.status === "ACTIVE"
      );
      if (activeTenantRest) {
        if (activeTenantRest.restrictionType === "BLOCK") {
          return {
            allowed: false,
            feature,
            code: "TENANT_RESTRICTED",
            reason: "TENANT_RESTRICTED",
            source: "TENANT_RESTRICTION",
            limit: 0,
            isUnlimited: false,
            remaining: 0,
            message: `Tenant capability restricted: ${activeTenantRest.reason}`,
          };
        }
      }

      // 4. Check Admin Overrides
      const activeOverride = entitlementOverrides.find(
        (o) => o.tenantId === activeTenantId && o.featureKey === feature && o.status === "ACTIVE"
      );
      if (activeOverride) {
        if (!activeOverride.enabled) {
          return {
            allowed: false,
            feature,
            code: "ENTITLEMENT_DISABLED",
            reason: "ENTITLEMENT_DISABLED",
            source: "OVERRIDE",
            limit: 0,
            isUnlimited: false,
            remaining: 0,
            message: `Feature disabled by administrative override: ${activeOverride.reason}`,
          };
        }
        if (activeOverride.isUnlimited) {
          return {
            allowed: true,
            feature,
            source: "OVERRIDE",
            limit: null,
            isUnlimited: true,
            remaining: null,
          };
        }
        if (activeOverride.limitValue !== null && activeOverride.limitValue !== undefined) {
          const limit = Number(activeOverride.limitValue);
          const tenantVehiclesCount = vehicles.filter(
            (v) => v.tenantId === activeTenantId && v.lifecycleStatus !== "RETIRED" && v.lifecycleStatus !== "SOLD"
          ).length;
          const usage = feature.startsWith("fleet.") ? tenantVehiclesCount : 0;
          const allowed = usage < limit;
          return {
            allowed,
            feature,
            code: allowed ? undefined : "LIMIT_REACHED",
            reason: allowed ? undefined : "LIMIT_REACHED",
            source: "OVERRIDE",
            limit,
            isUnlimited: false,
            usage,
            currentUsage: usage,
            remaining: Math.max(0, limit - usage),
          };
        }
        return {
          allowed: true,
          feature,
          source: "OVERRIDE",
          limit: null,
          isUnlimited: false,
        };
      }

      // 5. Plan-to-Feature Mappings
      if (feature === "fleet.vehicle.create" || feature === "fleet.max_vehicles") {
        const tenantVehiclesCount = vehicles.filter(
          (v) => v.tenantId === activeTenantId && v.lifecycleStatus !== "RETIRED" && v.lifecycleStatus !== "SOLD"
        ).length;
        const limit = activePlan.maxVehicles;
        const isUnlimited = activePlan.code === "ENTERPRISE_PLUS";
        const allowed = isUnlimited || tenantVehiclesCount < limit;
        return {
          allowed,
          feature,
          code: allowed ? undefined : "LIMIT_REACHED",
          reason: allowed ? undefined : "LIMIT_REACHED",
          source: "PLAN",
          limit: isUnlimited ? null : limit,
          isUnlimited,
          usage: tenantVehiclesCount,
          currentUsage: tenantVehiclesCount,
          remaining: isUnlimited ? null : Math.max(0, limit - tenantVehiclesCount),
          upgradeRecommended: !allowed,
        };
      }

      if (feature === "website.custom_domain") {
        const allowed = Boolean(activePlan.allowCustomDomain);
        return {
          allowed,
          feature,
          code: allowed ? undefined : "FEATURE_NOT_INCLUDED",
          reason: allowed ? undefined : "FEATURE_NOT_INCLUDED",
          source: "PLAN",
          upgradeRecommended: !allowed,
        };
      }

      if (feature === "finance.ledger") {
        const allowed = Boolean(activePlan.allowDoubleEntryLedger);
        return {
          allowed,
          feature,
          code: allowed ? undefined : "FEATURE_NOT_INCLUDED",
          reason: allowed ? undefined : "FEATURE_NOT_INCLUDED",
          source: "PLAN",
          upgradeRecommended: !allowed,
        };
      }

      if (feature === "settlements.manage") {
        const allowed = Boolean(activePlan.allowOwnerSettlements);
        return {
          allowed,
          feature,
          code: allowed ? undefined : "FEATURE_NOT_INCLUDED",
          reason: allowed ? undefined : "FEATURE_NOT_INCLUDED",
          source: "PLAN",
          upgradeRecommended: !allowed,
        };
      }

      if (feature === "analytics.advanced") {
        const allowed = activePlan.code !== "STARTER";
        return {
          allowed,
          feature,
          code: allowed ? undefined : "FEATURE_NOT_INCLUDED",
          reason: allowed ? undefined : "FEATURE_NOT_INCLUDED",
          source: "PLAN",
          upgradeRecommended: !allowed,
        };
      }

      if (feature === "users.max_members") {
        const tenantMembersCount = memberships.filter((m) => m.tenantId === activeTenantId && m.status === "ACTIVE").length;
        const limit = activePlan.maxMembers;
        const isUnlimited = activePlan.code === "ENTERPRISE_PLUS";
        const allowed = isUnlimited || tenantMembersCount < limit;
        return {
          allowed,
          feature,
          code: allowed ? undefined : "LIMIT_REACHED",
          reason: allowed ? undefined : "LIMIT_REACHED",
          source: "PLAN",
          limit: isUnlimited ? null : limit,
          isUnlimited,
          usage: tenantMembersCount,
          currentUsage: tenantMembersCount,
          remaining: isUnlimited ? null : Math.max(0, limit - tenantMembersCount),
          upgradeRecommended: !allowed,
        };
      }

      return {
        allowed: true,
        feature,
        source: "DEFAULT",
      };
    },
    [activeSubscription, activePlan, vehicles, memberships, activeTenantId, entitlementOverrides, entitlementRestrictions]
  );

  const canUseCapability = useCallback(
    (feature: string): boolean => {
      return checkEntitlement(feature).allowed;
    },
    [checkEntitlement]
  );

  const createEntitlementOverride = useCallback(
    (dto: CreateEntitlementOverrideDto) => {
      const now = new Date().toISOString();
      const newOverride: EntitlementOverride = {
        id: `ovr-${activeTenantId}-${Date.now()}`,
        tenantId: activeTenantId,
        featureKey: dto.featureKey,
        enabled: dto.enabled ?? true,
        limitValue: dto.limitValue ?? null,
        isUnlimited: dto.isUnlimited ?? false,
        reason: dto.reason,
        createdBy: currentUser.id,
        status: "ACTIVE",
        effectiveFrom: dto.effectiveFrom || now,
        effectiveTo: dto.effectiveTo || null,
        createdAt: now,
        updatedAt: now,
      };

      setEntitlementOverrides((prev) => [
        newOverride,
        ...prev.filter((o) => !(o.tenantId === activeTenantId && o.featureKey === dto.featureKey)),
      ]);
      emitDomainFact("EntitlementOverrideCreated", "TenantEntitlement", activeTenantId, newOverride, "platform.entitlement.override");
    },
    [activeTenantId, currentUser, emitDomainFact]
  );

  const revokeEntitlementOverride = useCallback(
    (overrideId: string) => {
      setEntitlementOverrides((prev) =>
        prev.map((o) => (o.id === overrideId ? { ...o, status: "REVOKED", updatedAt: new Date().toISOString() } : o))
      );
      emitDomainFact("EntitlementOverrideRevoked", "TenantEntitlement", activeTenantId, { overrideId }, "platform.entitlement.override");
    },
    [activeTenantId, emitDomainFact]
  );

  const createEntitlementRestriction = useCallback(
    (dto: CreateEntitlementRestrictionDto) => {
      const now = new Date().toISOString();
      const newRest: EntitlementRestriction = {
        id: `rst-${Date.now()}`,
        tenantId: dto.tenantId || activeTenantId,
        scope: dto.scope,
        featureKey: dto.featureKey,
        restrictionType: dto.restrictionType || "BLOCK",
        enforcedLimit: dto.enforcedLimit ?? null,
        reason: dto.reason,
        imposedBy: currentUser.id,
        status: "ACTIVE",
        effectiveFrom: dto.effectiveFrom || now,
        effectiveTo: dto.effectiveTo || null,
        createdAt: now,
        updatedAt: now,
      };

      setEntitlementRestrictions((prev) => [newRest, ...prev]);
      emitDomainFact("EntitlementRestrictionApplied", "EntitlementRestriction", newRest.id, newRest, "platform.entitlement.restrict");
    },
    [activeTenantId, currentUser, emitDomainFact]
  );

  const liftEntitlementRestriction = useCallback(
    (restrictionId: string) => {
      setEntitlementRestrictions((prev) =>
        prev.map((r) => (r.id === restrictionId ? { ...r, status: "LIFTED", updatedAt: new Date().toISOString() } : r))
      );
      emitDomainFact("EntitlementRestrictionLifted", "EntitlementRestriction", restrictionId, { restrictionId }, "platform.entitlement.restrict");
    },
    [emitDomainFact]
  );

  // --------------------------------------------------------------------------
  // SUBSCRIPTION ACCESS POLICY & RESTRICTED MODE (Sprint 8: ENT-001, ARCH-004)
  // --------------------------------------------------------------------------
  const accessMode = useMemo<TenantAccessMode>(() => {
    if (!activeSubscription) return "SUSPENDED";
    const status = (activeSubscription.status || activeSubscription.state || "INACTIVE").toUpperCase();
    const now = new Date();

    switch (status) {
      case "TRIAL":
      case "ACTIVE":
        return "FULL";
      case "RENEWAL_DUE":
      case "PAST_DUE":
        return "WARNING";
      case "GRACE_PERIOD":
        return "RESTRICTED";
      case "SUSPENDED":
      case "EXPIRED":
        return "SUSPENDED";
      case "CANCELLED": {
        if (activeSubscription.cancelAtPeriodEnd && activeSubscription.currentPeriodEnd) {
          const periodEnd = new Date(activeSubscription.currentPeriodEnd);
          if (now <= periodEnd) return "WARNING";
        }
        return "SUSPENDED";
      }
      default:
        return "SUSPENDED";
    }
  }, [activeSubscription]);

  const isRestricted = useMemo<boolean>(() => {
    return accessMode === "RESTRICTED" || accessMode === "SUSPENDED";
  }, [accessMode]);

  const statusBanner = useMemo(() => {
    if (!activeSubscription) {
      return {
        type: "SUSPENDED" as const,
        title: "Subscription Required",
        message: "Your workspace has no active subscription. Choose a plan to unlock all features.",
        actionUrl: "/billing",
        actionLabel: "Choose Plan",
      };
    }

    const status = (activeSubscription.status || activeSubscription.state || "").toUpperCase();
    const now = new Date();

    switch (status) {
      case "RENEWAL_DUE":
        return {
          type: "WARNING" as const,
          title: "Subscription Renewal Due",
          message: `Your subscription renewal is due on ${activeSubscription.renewalDueAt ? new Date(activeSubscription.renewalDueAt).toLocaleDateString() : "soon"}. Please confirm payment to prevent service interruption.`,
          actionUrl: "/billing",
          actionLabel: "Review Invoice",
        };

      case "PAST_DUE":
        return {
          type: "WARNING" as const,
          title: "Payment Past Due",
          message: "Your latest subscription payment attempt was unsuccessful. Please update your payment method to avoid restricted mode.",
          actionUrl: "/billing",
          actionLabel: "Pay Now",
        };

      case "GRACE_PERIOD":
        return {
          type: "RESTRICTED" as const,
          title: "Grace Period Active — Restricted Mode",
          message: `Your workspace is currently in restricted mode. New vehicle and booking creations are paused until overdue invoices are cleared (Grace ends ${activeSubscription.graceEndsAt || activeSubscription.gracePeriodEndsAt ? new Date(activeSubscription.graceEndsAt || activeSubscription.gracePeriodEndsAt!).toLocaleDateString() : "soon"}).`,
          actionUrl: "/billing",
          actionLabel: "Settle Invoices",
        };

      case "SUSPENDED":
        return {
          type: "SUSPENDED" as const,
          title: "Workspace Suspended",
          message: "Workspace operations are currently suspended. Your data is safely preserved. To resume operations, reactivate your subscription.",
          actionUrl: "/billing",
          actionLabel: "Reactivate Subscription",
        };

      case "CANCELLED": {
        if (activeSubscription.cancelAtPeriodEnd && activeSubscription.currentPeriodEnd) {
          const periodEnd = new Date(activeSubscription.currentPeriodEnd);
          if (now <= periodEnd) {
            return {
              type: "WARNING" as const,
              title: "Cancellation Scheduled",
              message: `Your subscription is scheduled to end on ${periodEnd.toLocaleDateString()}. You retain full access until then.`,
              actionUrl: "/billing",
              actionLabel: "Resume Subscription",
            };
          }
        }
        return {
          type: "SUSPENDED" as const,
          title: "Subscription Cancelled",
          message: "Your subscription has ended. Your data is safely preserved. Reactivate anytime to resume operations.",
          actionUrl: "/billing",
          actionLabel: "Reactivate",
        };
      }

      case "EXPIRED":
        return {
          type: "EXPIRED" as const,
          title: "Subscription Expired",
          message: "Your trial or subscription period has ended. All business records remain preserved. Choose a plan to restore write access.",
          actionUrl: "/billing",
          actionLabel: "Renew Plan",
        };

      default:
        return null;
    }
  }, [activeSubscription]);

  const evaluateSubscriptionAccess = useCallback(
    (operationCategory: OperationCategory): SubscriptionAccessDecision => {
      const now = new Date();
      const status = activeSubscription
        ? ((activeSubscription.status || activeSubscription.state || "INACTIVE").toUpperCase() as any)
        : "EXPIRED";

      const allowedOpsByMode: Record<TenantAccessMode, OperationCategory[]> = {
        FULL: [
          "READ_EXISTING_DATA",
          "CREATE_NEW_RESOURCE",
          "UPDATE_EXISTING_RESOURCE",
          "DELETE_RESOURCE",
          "COMPLETE_EXISTING_RENTAL",
          "MANAGE_EXISTING_BOOKING",
          "BILLING_ACCESS",
          "SUBSCRIPTION_MANAGEMENT",
          "DATA_EXPORT",
          "PUBLIC_BOOKING",
          "PLATFORM_SUPPORT_ACTION",
        ],
        WARNING: [
          "READ_EXISTING_DATA",
          "CREATE_NEW_RESOURCE",
          "UPDATE_EXISTING_RESOURCE",
          "DELETE_RESOURCE",
          "COMPLETE_EXISTING_RENTAL",
          "MANAGE_EXISTING_BOOKING",
          "BILLING_ACCESS",
          "SUBSCRIPTION_MANAGEMENT",
          "DATA_EXPORT",
          "PUBLIC_BOOKING",
          "PLATFORM_SUPPORT_ACTION",
        ],
        RESTRICTED: [
          "READ_EXISTING_DATA",
          "UPDATE_EXISTING_RESOURCE",
          "COMPLETE_EXISTING_RENTAL",
          "MANAGE_EXISTING_BOOKING",
          "BILLING_ACCESS",
          "SUBSCRIPTION_MANAGEMENT",
          "DATA_EXPORT",
          "PLATFORM_SUPPORT_ACTION",
        ],
        SUSPENDED: [
          "READ_EXISTING_DATA",
          "COMPLETE_EXISTING_RENTAL",
          "BILLING_ACCESS",
          "SUBSCRIPTION_MANAGEMENT",
          "DATA_EXPORT",
          "PLATFORM_SUPPORT_ACTION",
        ],
      };

      const allowedOperations = allowedOpsByMode[accessMode] || ["BILLING_ACCESS", "SUBSCRIPTION_MANAGEMENT"];
      const allOperations: OperationCategory[] = [
        "READ_EXISTING_DATA",
        "CREATE_NEW_RESOURCE",
        "UPDATE_EXISTING_RESOURCE",
        "DELETE_RESOURCE",
        "COMPLETE_EXISTING_RENTAL",
        "MANAGE_EXISTING_BOOKING",
        "BILLING_ACCESS",
        "SUBSCRIPTION_MANAGEMENT",
        "DATA_EXPORT",
        "PUBLIC_BOOKING",
        "PLATFORM_SUPPORT_ACTION",
      ];
      const restrictedOperations = allOperations.filter((op) => !allowedOperations.includes(op));

      // Always allowed recovery routes
      if (
        operationCategory === "BILLING_ACCESS" ||
        operationCategory === "SUBSCRIPTION_MANAGEMENT" ||
        operationCategory === "DATA_EXPORT" ||
        (isSupportAccessActive && operationCategory === "PLATFORM_SUPPORT_ACTION")
      ) {
        return {
          allowed: true,
          subscriptionStatus: status,
          accessMode,
          operationCategory,
          allowedOperations,
          restrictedOperations,
          requiresPayment: status === "PAST_DUE" || status === "GRACE_PERIOD" || status === "SUSPENDED",
          requiresUpgrade: status === "EXPIRED" || status === "CANCELLED",
        };
      }

      if (!activeSubscription) {
        return {
          allowed: false,
          subscriptionStatus: "EXPIRED",
          accessMode: "SUSPENDED",
          operationCategory,
          code: "SUBSCRIPTION_INACTIVE",
          message: "No active workspace subscription found.",
          allowedOperations,
          restrictedOperations,
          requiresPayment: true,
          requiresUpgrade: true,
        };
      }

      const isAllowed = allowedOperations.includes(operationCategory);
      if (isAllowed) {
        return {
          allowed: true,
          subscriptionStatus: status,
          accessMode,
          operationCategory,
          allowedOperations,
          restrictedOperations,
        };
      }

      let denialCode = "SUBSCRIPTION_INACTIVE";
      let message = "This operation is restricted under the current subscription state.";
      if (status === "SUSPENDED") {
        denialCode = "SUBSCRIPTION_SUSPENDED";
        message = "Workspace is suspended. New operations are disabled. Please reactivate your subscription in Billing.";
      } else if (status === "GRACE_PERIOD") {
        denialCode = "SUBSCRIPTION_GRACE_RESTRICTION";
        message = "Workspace is in restricted grace period. New resource creation is paused until billing is settled.";
      } else if (status === "EXPIRED") {
        denialCode = "SUBSCRIPTION_EXPIRED";
        message = "Workspace subscription has expired. Please renew your plan to restore full operations.";
      }

      return {
        allowed: false,
        subscriptionStatus: status,
        accessMode,
        operationCategory,
        code: denialCode,
        message,
        allowedOperations,
        restrictedOperations,
        requiresPayment: status === "PAST_DUE" || status === "GRACE_PERIOD" || status === "SUSPENDED",
        requiresUpgrade: status === "EXPIRED" || status === "CANCELLED",
      };
    },
    [activeSubscription, accessMode, isSupportAccessActive]
  );

  // --------------------------------------------------------------------------
  // AUTHORITATIVE AVAILABILITY ENGINE (DOM-001 §13, BRS-001 §6, Amendment A07)
  // --------------------------------------------------------------------------
  const checkVehicleAvailability = useCallback(
    (
      vehicleId?: string,
      startDate?: string,
      endDate?: string,
      excludeBookingId?: string
    ): { available: boolean; conflictReason?: string } => {
      if (!vehicleId || !startDate || !endDate) {
        return { available: true };
      }
      const v = vehicles.find((item) => item.id === vehicleId && item.tenantId === activeTenantId);
      if (!v) return { available: false, conflictReason: "Vehicle not found" };

      // Check lifecycle status
      if (v.lifecycleStatus !== "ACTIVE") {
        return { available: false, conflictReason: `Vehicle lifecycle is ${v.lifecycleStatus}` };
      }

      const reqStart = new Date(startDate).getTime();
      const reqEnd = new Date(endDate).getTime();

      if (isNaN(reqStart) || isNaN(reqEnd) || reqStart >= reqEnd) {
        return { available: false, conflictReason: "Return date must be after pickup date" };
      }

      // Check active maintenance blocks
      const maintBlock = maintenance.find(
        (m) =>
          m.vehicleId === vehicleId &&
          m.tenantId === activeTenantId &&
          m.status === "IN_PROGRESS" &&
          m.blocksAvailability
      );
      if (maintBlock) {
        return { available: false, conflictReason: `Vehicle is in maintenance at ${maintBlock.workshop}` };
      }

      // Check compliance blocks
      const complianceBlock = complianceDocs.find(
        (cd) =>
          cd.subjectId === vehicleId &&
          cd.tenantId === activeTenantId &&
          cd.isMandatory &&
          (cd.expiryState === "EXPIRED" || cd.isBlocked)
      );
      if (complianceBlock) {
        return {
          available: false,
          conflictReason: `Mandatory ${complianceBlock.documentType.replace(/_/g, " ")} is expired and blocked`,
        };
      }

      // Check date-range collision with CONFIRMED or ACTIVE bookings
      const conflictBooking = bookings.find((b) => {
        const bVehicleId = b.vehicleId || b.assignedVehicleId;
        if (bVehicleId !== vehicleId || b.tenantId !== activeTenantId) return false;
        if (excludeBookingId && b.id === excludeBookingId) return false;
        if (b.status !== "CONFIRMED" && b.status !== "ACTIVE") return false;

        const bStartStr = b.startDate || b.pickupAt;
        const bEndStr = b.endDate || b.returnAt;
        if (!bStartStr || !bEndStr) return false;

        const bStart = new Date(bStartStr).getTime();
        const bEnd = new Date(bEndStr).getTime();

        // Overlap condition: max(start1, start2) < min(end1, end2)
        return reqStart < bEnd && reqEnd > bStart;
      });

      if (conflictBooking) {
        const bStartStr = conflictBooking.startDate || conflictBooking.pickupAt || "";
        const bEndStr = conflictBooking.endDate || conflictBooking.returnAt || "";
        return {
          available: false,
          conflictReason: `Overlaps with confirmed booking ${conflictBooking.bookingNumber} (${new Date(
            bStartStr
          ).toLocaleDateString()} - ${new Date(bEndStr).toLocaleDateString()})`,
        };
      }

      return { available: true };
    },
    [vehicles, bookings, maintenance, complianceDocs, activeTenantId]
  );

  // --------------------------------------------------------------------------
  // DOMAIN ACTIONS: FLEET & VEHICLE OWNERSHIP (DOM-003 §7-10)
  // --------------------------------------------------------------------------
  const addVehicle = useCallback(async (vehicleData: Omit<Vehicle, "id" | "tenantId" | "createdAt" | "updatedAt">): Promise<Vehicle | null> => {
    const response = await apiClient.fleet.createVehicle(vehicleData);
    if(response.error){showNotification(response.error.message,"error");return null;}
    setVehicles(prev=>[response.data,...prev]);
    showNotification("Vehicle saved.");
    return response.data;
  },[showNotification]);

  const updateVehicle = useCallback(async (id: string, updates: Partial<Vehicle>) => {
    const response = updates.availabilityStatus
      ? await apiClient.post(`/fleet/vehicles/${id}/availability-status`, { status: updates.availabilityStatus })
      : await apiClient.fleet.updateVehicle(id, updates);
    if (response.error) { showNotification(response.error.message, "error"); return; }
    setVehicles(prev => prev.map(v => v.id === id ? response.data : v));
    showNotification("Vehicle record saved.");
  }, [showNotification]);

  const deleteVehicle = useCallback(async (id: string) => {
    const response = await apiClient.fleet.deleteVehicle(id);
    if (response.error) { showNotification(response.error.message, "error"); return; }
    setVehicles(prev => prev.filter(v => v.id !== id));
    showNotification("Vehicle record archived.");
  }, [showNotification]);

  const addVehicleOwner = useCallback(
    (ownerData: Omit<VehicleOwner, "id" | "tenantId" | "createdAt">): VehicleOwner => {
      const newOwner: VehicleOwner = {
        ...ownerData,
        id: `owner-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
        createdAt: new Date().toISOString(),
      };
      setVehicleOwners((prev) => [newOwner, ...prev]);
      // Live backend API synchronization
      apiClient.vehicleOwners.createOwner(ownerData).catch(() => null);
      emitDomainFact("VehicleOwnerCreated", "VehicleOwner", newOwner.id, { name: newOwner.name }, "vehicle_owners.create");
      showNotification(`Vehicle Owner ${newOwner.name} registered.`);
      return newOwner;
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  const attachVehicleOwnership = useCallback(
    (ownershipData: Omit<VehicleOwnership, "id" | "tenantId" | "createdAt">): VehicleOwnership => {
      const newOwnership: VehicleOwnership = {
        ...ownershipData,
        id: `own-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
        createdAt: new Date().toISOString(),
      };
      setVehicleOwnerships((prev) => [newOwnership, ...prev]);
      // Update vehicle's active owner ID
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === ownershipData.vehicleId && v.tenantId === activeTenantId
            ? { ...v, ownerId: ownershipData.ownerId, activeOwnershipId: newOwnership.id }
            : v
        )
      );
      // Live backend API synchronization
      apiClient.vehicleOwners.assignOwnership(ownershipData).catch(() => null);
      emitDomainFact("VehicleOwnershipStarted", "VehicleOwnership", newOwnership.id, ownershipData, "vehicle_ownership.attach");
      showNotification("New vehicle ownership agreement attached.");
      return newOwnership;
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  // --------------------------------------------------------------------------
  // DOMAIN ACTIONS: CUSTOMERS & DRIVERS (DOM-003 §11-13)
  // --------------------------------------------------------------------------
  const addCustomer = useCallback(async (customerData: Parameters<AppContextType["addCustomer"]>[0]): Promise<Customer | null> => {
    const response = await apiClient.customers.createCustomer(customerData);
    if (response.error) { showNotification(response.error.message, "error"); return null; }
    setCustomers(prev => [response.data, ...prev]);
    showNotification("Customer saved. Verification is a separate step.");
    return response.data;
  }, [showNotification]);

  const updateCustomer = useCallback(async (id: string, updates: Partial<Customer>) => {
    const response = updates.status
      ? await apiClient.customers.changeStatus(id, { status: updates.status, reason: updates.notes })
      : await apiClient.customers.updateCustomer(id, updates);
    if (response.error) { showNotification(response.error.message, "error"); return; }
    setCustomers(prev => prev.map(c => c.id === id ? response.data : c));
    showNotification("Customer profile saved.");
  }, [showNotification]);

  const addDriver = useCallback(
    (
      driverData: Omit<Driver, "id" | "tenantId" | "createdAt" | "driverNumber" | "version"> & {
        driverNumber?: string;
        version?: number;
      }
    ): Driver => {
      const newDriver: Driver = {
        ...driverData,
        id: `drv-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
        driverNumber: driverData.driverNumber || `DRV-${Date.now().toString(36).toUpperCase()}`,
        version: driverData.version || 1,
        rating: driverData.rating ?? 5.0,
        createdAt: new Date().toISOString(),
      };
      setDrivers((prev) => [newDriver, ...prev]);
      emitDomainFact("DriverCreated", "Driver", newDriver.id, { fullName: newDriver.fullName }, "drivers.create");
      showNotification(`Driver ${newDriver.fullName} added.`);
      return newDriver;
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  // --------------------------------------------------------------------------
  // DOMAIN ACTIONS: BOOKING STATE MACHINE (BRS-001 §11-27, Amendment A05)
  // --------------------------------------------------------------------------
  const createBooking = useCallback(async (bookingData: Omit<Booking, "id" | "tenantId" | "bookingNumber" | "statusHistory" | "substitutions" | "createdAt" | "updatedAt">): Promise<Booking | null> => {
    const response=await apiClient.bookings.createBooking({...bookingData,initialStatus:"PENDING_CONFIRMATION",bookingSource:bookingData.source||"WALK_IN",pickupAt:bookingData.pickupAt||bookingData.startDate,returnAt:bookingData.returnAt||bookingData.endDate});
    if(response.error){showNotification(response.error.message,"error");return null;}
    const saved={...response.data,startDate:response.data.pickupAt,endDate:response.data.returnAt,statusHistory:response.data.statusHistory||[],substitutions:response.data.substitutions||[]};
    setBookings(prev=>[saved,...prev]);showNotification(`Booking ${saved.bookingNumber} saved.`);return saved;
  },[showNotification]);

  const confirmBooking = useCallback(
    (bookingId: string, reason?: string): boolean => {
      const b = bookings.find((item) => item.id === bookingId && item.tenantId === activeTenantId);
      if (!b) return false;

      // Validate availability at moment of confirmation
      const avail = checkVehicleAvailability(b.vehicleId, b.startDate, b.endDate, b.id);
      if (!avail.available) {
        showNotification(`Confirmation blocked: ${avail.conflictReason}`, "error");
        return false;
      }

      const transition: BookingStatusTransition = {
        fromStatus: b.status,
        toStatus: "CONFIRMED",
        timestamp: new Date().toISOString(),
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        reason: reason || "Booking confirmed by operator.",
      };

      setBookings((prev) =>
        prev.map((item) =>
          item.id === bookingId && item.tenantId === activeTenantId
            ? {
                ...item,
                status: "CONFIRMED",
                statusHistory: [transition, ...item.statusHistory],
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      );

      // Reserve vehicle
      setVehicles((prev) =>
        prev.map((v) => (v.id === b.vehicleId && v.tenantId === activeTenantId ? { ...v, availabilityStatus: "RESERVED" } : v))
      );

      // Live backend API synchronization
      apiClient.bookings.confirmBooking(bookingId, reason).catch(() => null);

      emitDomainFact("BookingConfirmed", "Booking", bookingId, { bookingNumber: b.bookingNumber }, "bookings.confirm");
      showNotification(`Booking ${b.bookingNumber} is now CONFIRMED.`);
      return true;
    },
    [bookings, activeTenantId, checkVehicleAvailability, currentUser, emitDomainFact, showNotification]
  );

  const cancelBooking = useCallback(
    (bookingId: string, reason: string): boolean => {
      const b = bookings.find((item) => item.id === bookingId && item.tenantId === activeTenantId);
      if (!b) return false;

      const transition: BookingStatusTransition = {
        fromStatus: b.status,
        toStatus: "CANCELLED",
        timestamp: new Date().toISOString(),
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        reason,
      };

      setBookings((prev) =>
        prev.map((item) =>
          item.id === bookingId && item.tenantId === activeTenantId
            ? {
                ...item,
                status: "CANCELLED",
                statusHistory: [transition, ...item.statusHistory],
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      );

      // Release vehicle availability if it was reserved
      setVehicles((prev) =>
        prev.map((v) => (v.id === b.vehicleId && v.tenantId === activeTenantId && v.availabilityStatus === "RESERVED" ? { ...v, availabilityStatus: "AVAILABLE" } : v))
      );

      // Live backend API synchronization
      apiClient.bookings.cancelBooking(bookingId, reason).catch(() => null);

      emitDomainFact("BookingCancelled", "Booking", bookingId, { bookingNumber: b.bookingNumber, reason }, "bookings.cancel");
      showNotification(`Booking ${b.bookingNumber} CANCELLED.`);
      return true;
    },
    [bookings, activeTenantId, currentUser, emitDomainFact, showNotification]
  );

  const rejectBooking = useCallback(
    (bookingId: string, reason: string): boolean => {
      const b = bookings.find((item) => item.id === bookingId && item.tenantId === activeTenantId);
      if (!b) return false;

      const transition: BookingStatusTransition = {
        fromStatus: b.status,
        toStatus: "REJECTED",
        timestamp: new Date().toISOString(),
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        reason,
      };

      setBookings((prev) =>
        prev.map((item) =>
          item.id === bookingId && item.tenantId === activeTenantId
            ? {
                ...item,
                status: "REJECTED",
                statusHistory: [transition, ...item.statusHistory],
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      );

      emitDomainFact("BookingRejected", "Booking", bookingId, { bookingNumber: b.bookingNumber, reason }, "bookings.reject");
      showNotification(`Booking ${b.bookingNumber} REJECTED.`);
      return true;
    },
    [bookings, activeTenantId, currentUser, emitDomainFact, showNotification]
  );

  const rescheduleBooking = useCallback(
    (bookingId: string, newStart: string, newEnd: string): boolean => {
      const b = bookings.find((item) => item.id === bookingId && item.tenantId === activeTenantId);
      if (!b) return false;

      const avail = checkVehicleAvailability(b.vehicleId, newStart, newEnd, b.id);
      if (!avail.available) {
        showNotification(`Cannot reschedule: ${avail.conflictReason}`, "error");
        return false;
      }

      setBookings((prev) =>
        prev.map((item) =>
          item.id === bookingId && item.tenantId === activeTenantId
            ? {
                ...item,
                startDate: newStart,
                endDate: newEnd,
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      );

      // Live backend API synchronization
      apiClient.bookings.amendDates(bookingId, { pickupAt: newStart, returnAt: newEnd, recalculatePricing: true, reason: 'Legacy store synchronization' }).catch(() => null);

      emitDomainFact("BookingRescheduled", "Booking", bookingId, { newStart, newEnd }, "bookings.reschedule");
      showNotification(`Booking ${b.bookingNumber} rescheduled successfully.`);
      return true;
    },
    [bookings, activeTenantId, checkVehicleAvailability, emitDomainFact, showNotification]
  );

  const substituteVehicle = useCallback(
    (bookingId: string, replacementVehicleId: string, reason: string): boolean => {
      const b = bookings.find((item) => item.id === bookingId && item.tenantId === activeTenantId);
      if (!b) return false;

      const avail = checkVehicleAvailability(replacementVehicleId, b.startDate, b.endDate, b.id);
      if (!avail.available) {
        showNotification(`Substitution blocked: Replacement vehicle is not available (${avail.conflictReason})`, "error");
        return false;
      }

      const subRecord = {
        id: `sub-${Date.now().toString(36)}`,
        bookingId: b.id,
        originalVehicleId: b.vehicleId,
        replacementVehicleId,
        reason,
        actorId: currentUser.id,
        timestamp: new Date().toISOString(),
      };

      setBookings((prev) =>
        prev.map((item) =>
          item.id === bookingId && item.tenantId === activeTenantId
            ? {
                ...item,
                vehicleId: replacementVehicleId,
                assignedVehicleId: replacementVehicleId,
                substitutions: [subRecord, ...(item.substitutions || [])],
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      );

      // Live backend API synchronization
      apiClient.bookings.substituteVehicle(bookingId, { replacementVehicleId, reason }).catch(() => null);

      // Free previous vehicle & reserve replacement
      setVehicles((prev) =>
        prev.map((v) => {
          if (v.id === b.vehicleId && v.tenantId === activeTenantId) return { ...v, availabilityStatus: "AVAILABLE" };
          if (v.id === replacementVehicleId && v.tenantId === activeTenantId) return { ...v, availabilityStatus: "RESERVED" };
          return v;
        })
      );

      emitDomainFact("VehicleSubstituted", "Booking", bookingId, subRecord, "bookings.substitute_vehicle");
      showNotification(`Assigned vehicle substituted successfully.`);
      return true;
    },
    [bookings, activeTenantId, checkVehicleAvailability, currentUser, emitDomainFact, showNotification]
  );

  // --------------------------------------------------------------------------
  // DOMAIN ACTIONS: RENTAL OPERATIONS SEPARATE FROM BOOKING (DOM-003 §18-20, Amendment A06)
  // --------------------------------------------------------------------------
  const createRentalFromBooking = useCallback(
    async (bookingId: string): Promise<Rental | null> => {
      const b = bookings.find((item) => item.id === bookingId && item.tenantId === activeTenantId);
      if (!b) return null;

      const readiness = await apiClient.rentals.getReadiness(bookingId);
      if (readiness.error) {
        showNotification(readiness.error.message || "Unable to verify rental dispatch readiness.", "error");
        return null;
      }
      if (!(readiness.data as any)?.isReady) {
        const blockers = ((readiness.data as any)?.blockers || []) as string[];
        showNotification(blockers[0] || "Rental dispatch is blocked by incomplete prerequisites.", "error");
        return null;
      }

      const response = await apiClient.rentals.startRental({
        bookingId,
        idempotencyKey: `dispatch:${activeTenantId}:${bookingId}`,
      });
      if (response.error || !response.data) {
        showNotification(response.error?.message || "Rental dispatch failed.", "error");
        return null;
      }

      const rental = response.data as Rental;
      setRentals((prev) => [rental, ...prev.filter((item) => item.id !== rental.id && item.bookingId !== bookingId)]);
      setBookings((prev) =>
        prev.map((item) =>
          item.id === bookingId && item.tenantId === activeTenantId
            ? { ...item, status: "ACTIVE", activeRentalId: rental.id, updatedAt: new Date().toISOString() }
            : item
        )
      );
      setVehicles((prev) =>
        prev.map((vehicle) =>
          vehicle.id === rental.vehicleId && vehicle.tenantId === activeTenantId
            ? {
                ...vehicle,
                availabilityStatus: "ON_RENT",
                odometer: rental.checkoutOdometer,
                fuelLevel: rental.checkoutFuelLevel,
              }
            : vehicle
        )
      );

      emitDomainFact("RentalStarted", "Rental", rental.id, { rentalNumber: rental.rentalNumber, bookingId }, "rentals.start");
      showNotification(`Rental ${rental.rentalNumber} dispatched and ACTIVE ON ROAD.`);
      return rental;
    },
    [bookings, activeTenantId, emitDomainFact, showNotification]
  );

  const startRental = useCallback(
    (rentalId: string) => {
      const r = rentals.find((item) => item.id === rentalId && item.tenantId === activeTenantId);
      if (!r) return;

      const now = new Date().toISOString();
      setRentals((prev) =>
        prev.map((item) =>
          item.id === rentalId && item.tenantId === activeTenantId
            ? { ...item, state: "ACTIVE_ON_ROAD", actualStart: now, updatedAt: now }
            : item
        )
      );

      // Transition booking to ACTIVE
      setBookings((prev) =>
        prev.map((b) => (b.id === r.bookingId && b.tenantId === activeTenantId ? { ...b, status: "ACTIVE", updatedAt: now } : b))
      );

      // Set vehicle availability to ON_RENT
      setVehicles((prev) =>
        prev.map((v) => (v.id === r.vehicleId && v.tenantId === activeTenantId ? { ...v, availabilityStatus: "ON_RENT" } : v))
      );

      // Live backend API synchronization
      apiClient.rentals.startRental(rentalId).catch(() => null);

      emitDomainFact("RentalStarted", "Rental", rentalId, { actualStart: now }, "rentals.start");
      showNotification(`Rental ${r.rentalNumber} is now ACTIVE ON ROAD.`);
    },
    [rentals, activeTenantId, emitDomainFact, showNotification]
  );

  const extendRental = useCallback(
    (rentalId: string, newEndDate: string, additionalDays: number, additionalCost: number): boolean => {
      const r = rentals.find((item) => item.id === rentalId && item.tenantId === activeTenantId);
      if (!r) return false;

      // Re-validate availability for extension window
      const avail = checkVehicleAvailability(r.vehicleId, r.scheduledEnd, newEndDate, r.bookingId);
      if (!avail.available) {
        showNotification(`Extension blocked: ${avail.conflictReason}`, "error");
        return false;
      }

      const extensionRecord: RentalExtension = {
        id: `ext-${Date.now().toString(36)}`,
        rentalId,
        previousEndDate: r.scheduledEnd,
        newEndDate,
        additionalDays,
        additionalCost,
        approvedBy: currentUser.fullName,
        timestamp: new Date().toISOString(),
      };

      setRentals((prev) =>
        prev.map((item) =>
          item.id === rentalId && item.tenantId === activeTenantId
            ? {
                ...item,
                scheduledEnd: newEndDate,
                extensions: [extensionRecord, ...item.extensions],
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      );

      // Update booking end date & gross total
      setBookings((prev) =>
        prev.map((b) => {
          if (b.id === r.bookingId && b.tenantId === activeTenantId) {
            const pricingObj = (b.pricing || b.pricingSnapshot) as any;
            const currentDays = pricingObj?.totalDays ?? pricingObj?.billableDays ?? 1;
            const currentGross = pricingObj?.grossRentalTotal ?? pricingObj?.grossTotal ?? b.grossTotal ?? 0;
            const currentNet = pricingObj?.netPayable ?? b.netRentalSubtotal ?? currentGross;
            return {
              ...b,
              endDate: newEndDate,
              returnAt: newEndDate,
              grossTotal: currentGross + additionalCost,
              netRentalSubtotal: (pricingObj?.netRentalSubtotal ?? currentNet) + additionalCost,
              updatedAt: new Date().toISOString(),
            };
          }
          return b;
        })
      );

      // Live backend API synchronization
      apiClient.rentals.extendRental(rentalId, { newEndDate, additionalDays, additionalCost }).catch(() => null);

      emitDomainFact("RentalExtended", "Rental", rentalId, extensionRecord, "rentals.extend");
      showNotification(`Rental extended by ${additionalDays} days.`);
      return true;
    },
    [rentals, activeTenantId, checkVehicleAvailability, currentUser, emitDomainFact, showNotification]
  );

  const completeRental = useCallback(
    (rentalId: string, returnOdometer: number, returnFuelLevel: number) => {
      const r = rentals.find((item) => item.id === rentalId && item.tenantId === activeTenantId);
      if (!r) return;

      const now = new Date().toISOString();
      setRentals((prev) =>
        prev.map((item) =>
          item.id === rentalId && item.tenantId === activeTenantId
            ? {
                ...item,
                state: "COMPLETED",
                actualEnd: now,
                returnOdometer,
                returnFuelLevel,
                completedAt: now,
                updatedAt: now,
              }
            : item
        )
      );

      // Update vehicle odometer, fuel level, and release availability to AVAILABLE
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === r.vehicleId && v.tenantId === activeTenantId
            ? {
                ...v,
                odometer: returnOdometer,
                fuelLevel: returnFuelLevel,
                availabilityStatus: "AVAILABLE",
              }
            : v
        )
      );

      // Complete booking
      setBookings((prev) =>
        prev.map((b) => (b.id === r.bookingId && b.tenantId === activeTenantId ? { ...b, status: "COMPLETED", updatedAt: now } : b))
      );

      // Live backend API synchronization
      apiClient.rentals.completeRental(rentalId, { returnOdometer, returnFuelLevel }).catch(() => null);

      emitDomainFact("RentalCompleted", "Rental", rentalId, { returnOdometer, returnFuelLevel }, "rentals.complete");
      showNotification(`Rental ${r.rentalNumber} completed and vehicle returned to available fleet.`);
    },
    [rentals, activeTenantId, emitDomainFact, showNotification]
  );

  const recordRentalIncident = useCallback(
    (rentalId: string, incidentData: Omit<Rental["incidents"][0], "id">) => {
      const newInc = {
        ...incidentData,
        id: `inc-${Date.now().toString(36)}`,
      };
      setRentals((prev) =>
        prev.map((r) => (r.id === rentalId && r.tenantId === activeTenantId ? { ...r, incidents: [newInc, ...r.incidents] } : r))
      );
      // Live backend API synchronization
      apiClient.rentals.recordIncident(rentalId, newInc).catch(() => null);
      emitDomainFact("RentalIncidentRecorded", "Rental", rentalId, newInc, "rentals.record_incident");
      showNotification(`Incident logged on rental.`);
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  // --------------------------------------------------------------------------
  // DOMAIN ACTIONS: INSPECTIONS & DAMAGE (DOM-003 §21-22)
  // --------------------------------------------------------------------------
  const saveInspection = useCallback(
    (inspData: Omit<VehicleInspection, "id" | "tenantId" | "createdAt">): VehicleInspection => {
      const newInspectionId = `insp-${Date.now().toString(36)}`;
      const newInsp: VehicleInspection = {
        ...inspData,
        id: newInspectionId,
        tenantId: activeTenantId,
        createdAt: new Date().toISOString(),
      };

      setInspections((prev) => [newInsp, ...prev]);

      // Live backend API synchronization
      apiClient.inspections.createInspection(newInsp).catch(() => null);

      // If handover inspection, link to rental
      if (newInsp.rentalId && newInsp.type === "HANDOVER") {
        setRentals((prev) =>
          prev.map((r) =>
            r.id === newInsp.rentalId && r.tenantId === activeTenantId
              ? { ...r, handoverInspectionId: newInspectionId, checkoutOdometer: newInsp.odometer, checkoutFuelLevel: newInsp.fuelLevel }
              : r
          )
        );
      } else if (newInsp.rentalId && newInsp.type === "RETURN") {
        setRentals((prev) =>
          prev.map((r) =>
            r.id === newInsp.rentalId && r.tenantId === activeTenantId
              ? {
                  ...r,
                  returnInspectionId: newInspectionId,
                  returnOdometer: newInsp.odometer,
                  returnFuelLevel: newInsp.fuelLevel,
                  finalExcessKmCharge: newInsp.excessMileageDeduction,
                  finalFuelDeficitCharge: newInsp.fuelChargeDeduction,
                  finalDamageCharge: newInsp.damageChargeDeduction,
                  depositRefundedAmount: newInsp.finalRefundAmount,
                }
              : r
          )
        );
      }

      emitDomainFact(
        newInsp.type === "HANDOVER" ? "HandoverInspectionCompleted" : "ReturnInspectionCompleted",
        "VehicleInspection",
        newInspectionId,
        { type: newInsp.type, vehicleId: newInsp.vehicleId, damagesCount: newInsp.damages.length },
        "inspections.complete"
      );
      showNotification(`${newInsp.type} inspection report certified and saved.`);
      return newInsp;
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  // --------------------------------------------------------------------------
  // DOMAIN ACTIONS: SPRINT 17 MAINTENANCE MANAGEMENT (DOM-003 §21-24)
  // --------------------------------------------------------------------------
  const createMaintenanceRequest = useCallback(
    (dto: CreateMaintenanceRequestDto): MaintenanceWorkOrder | null => {
      const targetVehicle = vehicles.find((v) => v.id === dto.vehicleId && v.tenantId === activeTenantId);
      if (!targetVehicle) {
        showNotification("Target vehicle not found in workspace registry.", "error");
        return null;
      }

      const nextNum = 1000 + maintenanceWorkOrders.length + 1;
      const orderId = `maint-${Date.now().toString(36)}`;
      const now = new Date().toISOString();

      const newOrder: MaintenanceWorkOrder = {
        id: orderId,
        tenantId: activeTenantId,
        maintenanceNumber: `MNT-2026-${nextNum}`,
        vehicleId: dto.vehicleId,
        status: "REQUESTED",
        maintenanceType: dto.maintenanceType,
        priority: dto.priority || "NORMAL",
        sourceType: dto.sourceType || "MANUAL",
        sourceId: dto.sourceId,
        requestedAt: now,
        requestedBy: currentUser.id,
        reason: dto.reason,
        description: dto.description,
        garageId: dto.garageId,
        garageName: dto.garageName || (dto.garageId ? serviceProviders.find((p) => p.id === dto.garageId)?.name : undefined),
        odometerAtRequest: targetVehicle.odometer,
        estimatedCost: dto.estimatedCost || 0,
        actualCost: 0,
        currency: activeTenant.currency,
        isSafetyCritical: dto.isSafetyCritical || false,
        tasks: [],
        parts: [],
        costItems: [],
        evidence: [],
        statusHistory: [
          {
            id: `sh-${Date.now()}`,
            maintenanceId: orderId,
            tenantId: activeTenantId,
            toStatus: "REQUESTED",
            reason: dto.reason || "Maintenance work order request submitted",
            changedBy: currentUser.id,
            changedAt: now,
          },
        ],
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      setMaintenanceWorkOrders((prev) => [newOrder, ...prev]);

      // Backward compatibility record
      setMaintenance((prev) => [
        {
          id: newOrder.id,
          tenantId: activeTenantId,
          vehicleId: newOrder.vehicleId,
          vendorId: newOrder.garageId,
          workshop: newOrder.garageName || "Workshop",
          serviceType: newOrder.maintenanceType as any,
          description: newOrder.description || newOrder.reason,
          scheduledDate: newOrder.requestedAt,
          cost: newOrder.estimatedCost || 0,
          currency: newOrder.currency,
          status: "IN_PROGRESS",
          odometerAtService: newOrder.odometerAtRequest || 0,
          blocksAvailability: true,
          createdAt: now,
        },
        ...prev,
      ]);

      emitDomainFact("MaintenanceRequested", "MaintenanceWorkOrder", newOrder.id, {
        maintenanceNumber: newOrder.maintenanceNumber,
        vehicleId: newOrder.vehicleId,
        type: newOrder.maintenanceType,
      }, "maintenance.request");

      // Live backend API synchronization
      apiClient.maintenance.createWorkOrder(newOrder).catch(() => null);

      showNotification(`Maintenance request ${newOrder.maintenanceNumber} created.`);
      return newOrder;
    },
    [vehicles, activeTenantId, maintenanceWorkOrders.length, currentUser.id, activeTenant.currency, serviceProviders, emitDomainFact, showNotification]
  );

  const scheduleMaintenanceWorkOrder = useCallback(
    (id: string, dto: ScheduleMaintenanceDto): boolean => {
      const order = maintenanceWorkOrders.find((m) => m.id === id && m.tenantId === activeTenantId);
      if (!order) {
        showNotification("Work order not found.", "error");
        return false;
      }

      if (order.status !== "REQUESTED" && order.status !== "SCHEDULED") {
        showNotification(`Cannot schedule work order in status ${order.status}.`, "error");
        return false;
      }

      const now = new Date().toISOString();
      const garage = dto.garageId ? serviceProviders.find((p) => p.id === dto.garageId) : undefined;
      const garageName = dto.garageName || garage?.name || order.garageName;

      setMaintenanceWorkOrders((prev) =>
        prev.map((m) =>
          m.id === id && m.tenantId === activeTenantId
            ? {
                ...m,
                status: "SCHEDULED",
                garageId: dto.garageId || m.garageId,
                garageName,
                assignedTechnician: dto.assignedTechnician || m.assignedTechnician,
                scheduledStartAt: dto.scheduledStartAt,
                scheduledEndAt: dto.scheduledEndAt,
                estimatedCost: dto.estimatedCost !== undefined ? dto.estimatedCost : m.estimatedCost,
                statusHistory: [
                  {
                    id: `sh-${Date.now()}`,
                    maintenanceId: m.id,
                    tenantId: activeTenantId,
                    fromStatus: m.status,
                    toStatus: "SCHEDULED",
                    reason: `Scheduled at ${garageName || "workshop"} for ${new Date(dto.scheduledStartAt).toLocaleDateString()}`,
                    changedBy: currentUser.id,
                    changedAt: now,
                  },
                  ...m.statusHistory,
                ],
                version: m.version + 1,
                updatedAt: now,
              }
            : m
        )
      );

      // Live backend API synchronization
      apiClient.maintenance.updateWorkOrder(id, { status: "SCHEDULED", ...dto }).catch(() => null);

      emitDomainFact("MaintenanceScheduled", "MaintenanceWorkOrder", id, { scheduledStartAt: dto.scheduledStartAt, garageName }, "maintenance.schedule");
      showNotification(`Work order ${order.maintenanceNumber} scheduled.`);
      return true;
    },
    [maintenanceWorkOrders, activeTenantId, serviceProviders, currentUser.id, emitDomainFact, showNotification]
  );

  const startMaintenanceWorkOrder = useCallback(
    (id: string, dto?: StartMaintenanceDto): boolean => {
      const order = maintenanceWorkOrders.find((m) => m.id === id && m.tenantId === activeTenantId);
      if (!order) {
        showNotification("Work order not found.", "error");
        return false;
      }

      if (order.status !== "SCHEDULED" && order.status !== "REQUESTED") {
        showNotification(`Cannot start work order in status ${order.status}.`, "error");
        return false;
      }

      const now = new Date().toISOString();
      const targetVehicle = vehicles.find((v) => v.id === order.vehicleId && v.tenantId === activeTenantId);
      const startOdo = dto?.startOdometer || targetVehicle?.odometer || order.odometerAtRequest || 0;

      setMaintenanceWorkOrders((prev) =>
        prev.map((m) =>
          m.id === id && m.tenantId === activeTenantId
            ? {
                ...m,
                status: "IN_PROGRESS",
                actualStartAt: dto?.actualStartAt || now,
                startOdometer: startOdo,
                assignedTechnician: dto?.assignedTechnician || m.assignedTechnician,
                statusHistory: [
                  {
                    id: `sh-${Date.now()}`,
                    maintenanceId: m.id,
                    tenantId: activeTenantId,
                    fromStatus: m.status,
                    toStatus: "IN_PROGRESS",
                    reason: dto?.notes || "Work commenced by workshop technician",
                    changedBy: currentUser.id,
                    changedAt: now,
                  },
                  ...m.statusHistory,
                ],
                version: m.version + 1,
                updatedAt: now,
              }
            : m
        )
      );

      // Live backend API synchronization
      apiClient.maintenance.updateWorkOrder(id, { status: "IN_PROGRESS", ...dto }).catch(() => null);

      // Block vehicle availability state to MAINTENANCE
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === order.vehicleId && v.tenantId === activeTenantId
            ? { ...v, availabilityStatus: "MAINTENANCE" }
            : v
        )
      );

      emitDomainFact("MaintenanceStarted", "MaintenanceWorkOrder", id, { startOdometer: startOdo }, "maintenance.start");
      showNotification(`Work order ${order.maintenanceNumber} started. Vehicle placed in MAINTENANCE hold.`);
      return true;
    },
    [maintenanceWorkOrders, activeTenantId, vehicles, currentUser.id, emitDomainFact, showNotification]
  );

  const addMaintenanceTask = useCallback(
    (id: string, dto: AddMaintenanceTaskDto): MaintenanceTask | null => {
      const order = maintenanceWorkOrders.find((m) => m.id === id && m.tenantId === activeTenantId);
      if (!order) return null;

      const taskId = `tsk-${Date.now().toString(36)}`;
      const newTask: MaintenanceTask = {
        id: taskId,
        maintenanceId: id,
        tenantId: activeTenantId,
        taskType: dto.taskType,
        description: dto.description,
        isRequired: dto.isRequired !== undefined ? dto.isRequired : true,
        status: "PENDING",
        estimatedCost: dto.estimatedCost,
      };

      setMaintenanceWorkOrders((prev) =>
        prev.map((m) =>
          m.id === id && m.tenantId === activeTenantId
            ? {
                ...m,
                tasks: [...m.tasks, newTask],
                version: m.version + 1,
                updatedAt: new Date().toISOString(),
              }
            : m
        )
      );

      showNotification(`Task "${dto.description}" added to work order.`);
      return newTask;
    },
    [maintenanceWorkOrders, activeTenantId, showNotification]
  );

  const updateMaintenanceTask = useCallback(
    (id: string, taskId: string, dto: UpdateMaintenanceTaskDto): boolean => {
      const order = maintenanceWorkOrders.find((m) => m.id === id && m.tenantId === activeTenantId);
      if (!order) return false;

      const now = new Date().toISOString();
      setMaintenanceWorkOrders((prev) =>
        prev.map((m) => {
          if (m.id !== id || m.tenantId !== activeTenantId) return m;
          return {
            ...m,
            tasks: m.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: dto.status || t.status,
                    technicianNotes: dto.technicianNotes !== undefined ? dto.technicianNotes : t.technicianNotes,
                    actualCost: dto.actualCost !== undefined ? dto.actualCost : t.actualCost,
                    completedAt: dto.status === "COMPLETED" ? (t.completedAt || now) : t.completedAt,
                  }
                : t
            ),
            version: m.version + 1,
            updatedAt: now,
          };
        })
      );

      showNotification("Work order task updated.");
      return true;
    },
    [maintenanceWorkOrders, activeTenantId, showNotification]
  );

  const addMaintenancePart = useCallback(
    (id: string, dto: AddPartItemDto): MaintenancePartItem | null => {
      const order = maintenanceWorkOrders.find((m) => m.id === id && m.tenantId === activeTenantId);
      if (!order) return null;

      const partId = `prt-${Date.now().toString(36)}`;
      const total = dto.quantity * dto.unitCost;
      const newPart: MaintenancePartItem = {
        id: partId,
        maintenanceId: id,
        tenantId: activeTenantId,
        partNumber: dto.partNumber,
        description: dto.description,
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        totalCost: total,
        currency: activeTenant.currency,
        supplierName: dto.supplierName,
        invoiceReference: dto.invoiceReference,
      };

      setMaintenanceWorkOrders((prev) =>
        prev.map((m) =>
          m.id === id && m.tenantId === activeTenantId
            ? {
                ...m,
                parts: [...m.parts, newPart],
                actualCost: (m.actualCost || 0) + total,
                version: m.version + 1,
                updatedAt: new Date().toISOString(),
              }
            : m
        )
      );

      showNotification(`Part item ${dto.description} added.`);
      return newPart;
    },
    [maintenanceWorkOrders, activeTenantId, activeTenant.currency, showNotification]
  );

  const recordMaintenanceCost = useCallback(
    (id: string, dto: RecordCostItemDto): MaintenanceCostItem | null => {
      const order = maintenanceWorkOrders.find((m) => m.id === id && m.tenantId === activeTenantId);
      if (!order) return null;

      const costId = `cst-${Date.now().toString(36)}`;
      const newCost: MaintenanceCostItem = {
        id: costId,
        maintenanceId: id,
        tenantId: activeTenantId,
        category: dto.category,
        description: dto.description,
        estimatedCost: dto.estimatedCost || 0,
        actualCost: dto.actualCost,
        currency: activeTenant.currency,
        invoiceNumber: dto.invoiceNumber,
      };

      setMaintenanceWorkOrders((prev) =>
        prev.map((m) =>
          m.id === id && m.tenantId === activeTenantId
            ? {
                ...m,
                costItems: [...m.costItems, newCost],
                actualCost: (m.actualCost || 0) + (dto.actualCost || 0),
                version: m.version + 1,
                updatedAt: new Date().toISOString(),
              }
            : m
        )
      );

      showNotification(`Cost item recorded: ${dto.description}.`);
      return newCost;
    },
    [maintenanceWorkOrders, activeTenantId, activeTenant.currency, showNotification]
  );

  const completeMaintenanceWorkOrder = useCallback(
    (id: string, dto: CompleteMaintenanceDto): boolean => {
      const order = maintenanceWorkOrders.find((m) => m.id === id && m.tenantId === activeTenantId);
      if (!order) {
        showNotification("Work order not found.", "error");
        return false;
      }

      if (order.status !== "IN_PROGRESS") {
        showNotification(`Cannot complete work order in status ${order.status}. Must be IN_PROGRESS.`, "error");
        return false;
      }

      const now = new Date().toISOString();
      const targetVehicle = vehicles.find((v) => v.id === order.vehicleId && v.tenantId === activeTenantId);
      const completionOdo = dto.completionOdometer || targetVehicle?.odometer || order.startOdometer || 0;

      setMaintenanceWorkOrders((prev) =>
        prev.map((m) =>
          m.id === id && m.tenantId === activeTenantId
            ? {
                ...m,
                status: "COMPLETED",
                actualCompletedAt: dto.actualCompletedAt || now,
                completionOdometer: completionOdo,
                actualCost: dto.actualCost !== undefined ? dto.actualCost : m.actualCost,
                statusHistory: [
                  {
                    id: `sh-${Date.now()}`,
                    maintenanceId: m.id,
                    tenantId: activeTenantId,
                    fromStatus: m.status,
                    toStatus: "COMPLETED",
                    reason: dto.notes || "Workshop repairs and servicing completed, awaiting quality sign-off",
                    changedBy: currentUser.id,
                    changedAt: now,
                  },
                  ...m.statusHistory,
                ],
                version: m.version + 1,
                updatedAt: now,
              }
            : m
        )
      );

      // Update vehicle odometer and last service mileage
      if (targetVehicle) {
        setVehicles((prev) =>
          prev.map((v) =>
            v.id === order.vehicleId && v.tenantId === activeTenantId
              ? {
                  ...v,
                  odometer: Math.max(v.odometer, completionOdo),
                  lastServiceMileage: completionOdo,
                  nextServiceMileage: completionOdo + 10000,
                }
              : v
          )
        );
      }

      // If tied to schedule, update schedule last completed
      if (order.sourceId) {
        setMaintenanceSchedules((prev) =>
          prev.map((s) =>
            s.id === order.sourceId && s.tenantId === activeTenantId
              ? {
                  ...s,
                  lastCompletedAt: now,
                  lastCompletedOdometer: completionOdo,
                  nextDueOdometer: s.intervalDistanceKm ? completionOdo + s.intervalDistanceKm : undefined,
                  nextDueAt: s.intervalDays
                    ? new Date(Date.now() + s.intervalDays * 86400000).toISOString()
                    : undefined,
                  updatedAt: now,
                }
              : s
          )
        );
      }

      // Live backend API synchronization
      apiClient.maintenance.updateWorkOrder(id, { status: "COMPLETED", ...dto }).catch(() => null);

      emitDomainFact("MaintenanceCompleted", "MaintenanceWorkOrder", id, { completionOdometer: completionOdo, actualCost: dto.actualCost }, "maintenance.complete");
      showNotification(`Work order ${order.maintenanceNumber} marked COMPLETED. Pending quality verification.`);
      return true;
    },
    [maintenanceWorkOrders, activeTenantId, vehicles, currentUser.id, emitDomainFact, showNotification]
  );

  const verifyMaintenanceWorkOrder = useCallback(
    (id: string, dto: VerifyMaintenanceDto): boolean => {
      const order = maintenanceWorkOrders.find((m) => m.id === id && m.tenantId === activeTenantId);
      if (!order) {
        showNotification("Work order not found.", "error");
        return false;
      }

      if (order.status !== "COMPLETED") {
        showNotification(`Cannot verify work order in status ${order.status}. Must be COMPLETED.`, "error");
        return false;
      }

      const now = new Date().toISOString();
      const verification: MaintenanceVerification = {
        id: `ver-${Date.now().toString(36)}`,
        maintenanceId: id,
        tenantId: activeTenantId,
        verifiedBy: currentUser.id,
        verifiedAt: now,
        passedInspection: dto.passedInspection,
        roadTested: dto.roadTested,
        qualityScore: dto.qualityScore || 100,
        releaseVehicleStatus: dto.releaseVehicleStatus || "AVAILABLE",
        verificationNotes: dto.verificationNotes,
      };

      setMaintenanceWorkOrders((prev) =>
        prev.map((m) =>
          m.id === id && m.tenantId === activeTenantId
            ? {
                ...m,
                status: "VERIFIED",
                verifiedAt: now,
                verification,
                statusHistory: [
                  {
                    id: `sh-${Date.now()}`,
                    maintenanceId: m.id,
                    tenantId: activeTenantId,
                    fromStatus: m.status,
                    toStatus: "VERIFIED",
                    reason: `Quality sign-off: ${dto.passedInspection ? "PASSED" : "FAILED"}. Score: ${dto.qualityScore || 100}%`,
                    changedBy: currentUser.id,
                    changedAt: now,
                  },
                  ...m.statusHistory,
                ],
                version: m.version + 1,
                updatedAt: now,
              }
            : m
        )
      );

      // Release vehicle availability back to AVAILABLE (or specified status)
      const releaseStatus = dto.releaseVehicleStatus || "AVAILABLE";
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === order.vehicleId && v.tenantId === activeTenantId
            ? { ...v, availabilityStatus: releaseStatus as any }
            : v
        )
      );

      confetti({ particleCount: 35, spread: 50, origin: { y: 0.7 } });
      emitDomainFact("MaintenanceVerified", "MaintenanceWorkOrder", id, { passed: dto.passedInspection, score: dto.qualityScore }, "maintenance.verify");
      showNotification(`Work order ${order.maintenanceNumber} verified. Vehicle released to ${releaseStatus}.`);
      return true;
    },
    [maintenanceWorkOrders, activeTenantId, currentUser.id, emitDomainFact, showNotification]
  );

  const cancelMaintenanceWorkOrder = useCallback(
    (id: string, dto: CancelMaintenanceDto): boolean => {
      const order = maintenanceWorkOrders.find((m) => m.id === id && m.tenantId === activeTenantId);
      if (!order) {
        showNotification("Work order not found.", "error");
        return false;
      }

      if (order.status === "VERIFIED" || order.status === "CANCELLED") {
        showNotification(`Cannot cancel work order in terminal status ${order.status}.`, "error");
        return false;
      }

      const now = new Date().toISOString();
      setMaintenanceWorkOrders((prev) =>
        prev.map((m) =>
          m.id === id && m.tenantId === activeTenantId
            ? {
                ...m,
                status: "CANCELLED",
                cancellationReason: dto.reason,
                statusHistory: [
                  {
                    id: `sh-${Date.now()}`,
                    maintenanceId: m.id,
                    tenantId: activeTenantId,
                    fromStatus: m.status,
                    toStatus: "CANCELLED",
                    reason: dto.reason,
                    changedBy: currentUser.id,
                    changedAt: now,
                  },
                  ...m.statusHistory,
                ],
                version: m.version + 1,
                updatedAt: now,
              }
            : m
        )
      );

      // If vehicle was in MAINTENANCE hold, restore to AVAILABLE
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === order.vehicleId && v.tenantId === activeTenantId && v.availabilityStatus === "MAINTENANCE"
            ? { ...v, availabilityStatus: "AVAILABLE" }
            : v
        )
      );

      emitDomainFact("MaintenanceCancelled", "MaintenanceWorkOrder", id, { reason: dto.reason }, "maintenance.cancel");
      showNotification(`Work order ${order.maintenanceNumber} cancelled.`);
      return true;
    },
    [maintenanceWorkOrders, activeTenantId, currentUser.id, emitDomainFact, showNotification]
  );

  const createMaintenanceSchedule = useCallback(
    (dto: CreateMaintenanceScheduleDto): MaintenanceSchedule => {
      const scheduleId = `sch-${Date.now().toString(36)}`;
      const now = new Date().toISOString();

      let nextDueAt: string | undefined = dto.nextDueAt;
      if (!nextDueAt && dto.intervalDays) {
        nextDueAt = new Date(Date.now() + dto.intervalDays * 86400000).toISOString();
      }

      let nextDueOdo: number | undefined = dto.nextDueOdometer;
      if (!nextDueOdo && dto.vehicleId && dto.intervalDistanceKm) {
        const v = vehicles.find((veh) => veh.id === dto.vehicleId && veh.tenantId === activeTenantId);
        if (v) {
          nextDueOdo = v.odometer + dto.intervalDistanceKm;
        }
      }

      const newSchedule: MaintenanceSchedule = {
        id: scheduleId,
        tenantId: activeTenantId,
        vehicleId: dto.vehicleId,
        vehicleCategoryId: dto.vehicleCategoryId,
        name: dto.name,
        maintenanceType: dto.maintenanceType,
        intervalDistanceKm: dto.intervalDistanceKm,
        intervalDays: dto.intervalDays,
        nextDueAt,
        nextDueOdometer: nextDueOdo,
        dueSoonDistanceThresholdKm: dto.dueSoonDistanceThresholdKm || 500,
        dueSoonDaysThreshold: dto.dueSoonDaysThreshold || 14,
        status: "ACTIVE",
        isSafetyCritical: dto.isSafetyCritical || false,
        notes: dto.notes,
        createdAt: now,
        updatedAt: now,
      };

      setMaintenanceSchedules((prev) => [newSchedule, ...prev]);
      emitDomainFact("MaintenanceScheduleCreated", "MaintenanceSchedule", newSchedule.id, { name: newSchedule.name }, "maintenance.schedule.create");
      showNotification(`Preventive maintenance schedule "${newSchedule.name}" created.`);
      return newSchedule;
    },
    [activeTenantId, vehicles, emitDomainFact, showNotification]
  );

  const updateMaintenanceSchedule = useCallback(
    (id: string, dto: UpdateMaintenanceScheduleDto): boolean => {
      const schedule = maintenanceSchedules.find((s) => s.id === id && s.tenantId === activeTenantId);
      if (!schedule) return false;

      const now = new Date().toISOString();
      setMaintenanceSchedules((prev) =>
        prev.map((s) =>
          s.id === id && s.tenantId === activeTenantId
            ? {
                ...s,
                ...dto,
                updatedAt: now,
              }
            : s
        )
      );

      showNotification(`Maintenance schedule updated.`);
      return true;
    },
    [maintenanceSchedules, activeTenantId, showNotification]
  );

  const createServiceProvider = useCallback(
    (dto: CreateServiceProviderDto): ServiceProvider => {
      const providerId = `sp-${Date.now().toString(36)}`;
      const now = new Date().toISOString();

      const newProvider: ServiceProvider = {
        id: providerId,
        tenantId: activeTenantId,
        name: dto.name,
        code: dto.code,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        email: dto.email,
        location: dto.location,
        address: dto.address,
        status: "ACTIVE",
        rating: 5.0,
        servicesProvided: dto.servicesProvided || ["ROUTINE_SERVICE"],
        notes: dto.notes,
        createdAt: now,
        updatedAt: now,
      };

      setServiceProviders((prev) => [newProvider, ...prev]);
      emitDomainFact("ServiceProviderRegistered", "ServiceProvider", newProvider.id, { name: newProvider.name }, "maintenance.provider.create");
      showNotification(`Service provider "${newProvider.name}" registered.`);
      return newProvider;
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  const updateServiceProvider = useCallback(
    (id: string, dto: UpdateServiceProviderDto): boolean => {
      const provider = serviceProviders.find((p) => p.id === id && p.tenantId === activeTenantId);
      if (!provider) return false;

      const now = new Date().toISOString();
      setServiceProviders((prev) =>
        prev.map((p) =>
          p.id === id && p.tenantId === activeTenantId
            ? {
                ...p,
                ...dto,
                updatedAt: now,
              }
            : p
        )
      );

      showNotification(`Service provider updated.`);
      return true;
    },
    [serviceProviders, activeTenantId, showNotification]
  );

  const evaluateMaintenanceDue = useCallback(
    (vehicleId?: string): MaintenanceDueResult[] => {
      const results: MaintenanceDueResult[] = [];
      const tenantVehicles = vehicles.filter((v) => v.tenantId === activeTenantId && (!vehicleId || v.id === vehicleId));
      const tenantSchedules = maintenanceSchedules.filter((s) => s.tenantId === activeTenantId && s.status === "ACTIVE");

      const now = new Date();

      for (const vehicle of tenantVehicles) {
        const applicableSchedules = tenantSchedules.filter(
          (s) => s.vehicleId === vehicle.id || (s.vehicleCategoryId && s.vehicleCategoryId === vehicle.category)
        );

        for (const schedule of applicableSchedules) {
          let isDistanceDue = false;
          let isDistanceDueSoon = false;
          let distanceRemainingKm: number | undefined;

          if (schedule.nextDueOdometer !== undefined) {
            distanceRemainingKm = schedule.nextDueOdometer - vehicle.odometer;
            if (distanceRemainingKm <= 0) {
              isDistanceDue = true;
            } else if (schedule.dueSoonDistanceThresholdKm && distanceRemainingKm <= schedule.dueSoonDistanceThresholdKm) {
              isDistanceDueSoon = true;
            }
          }

          let isTimeDue = false;
          let isTimeDueSoon = false;
          let daysRemaining: number | undefined;

          if (schedule.nextDueAt) {
            const dueDate = new Date(schedule.nextDueAt);
            const diffMs = dueDate.getTime() - now.getTime();
            daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            if (daysRemaining <= 0) {
              isTimeDue = true;
            } else if (schedule.dueSoonDaysThreshold && daysRemaining <= schedule.dueSoonDaysThreshold) {
              isTimeDueSoon = true;
            }
          }

          let status: "OK" | "DUE_SOON" | "OVERDUE" = "OK";
          const reasons: string[] = [];

          if (isDistanceDue) {
            status = "OVERDUE";
            reasons.push(`Odometer threshold exceeded by ${Math.abs(distanceRemainingKm!)} km`);
          } else if (isTimeDue) {
            status = "OVERDUE";
            reasons.push(`Service date elapsed by ${Math.abs(daysRemaining!)} days`);
          } else if (isDistanceDueSoon) {
            status = "DUE_SOON";
            reasons.push(`Within ${distanceRemainingKm} km of next interval`);
          } else if (isTimeDueSoon) {
            status = "DUE_SOON";
            reasons.push(`Due in ${daysRemaining} days`);
          }

          results.push({
            scheduleId: schedule.id,
            vehicleId: vehicle.id,
            scheduleName: schedule.name,
            maintenanceType: schedule.maintenanceType,
            status,
            distanceRemainingKm,
            daysRemaining,
            isSafetyCritical: schedule.isSafetyCritical,
            reasons,
          });
        }
      }

      return results;
    },
    [vehicles, maintenanceSchedules, activeTenantId]
  );

  // --------------------------------------------------------------------------
  // LEGACY MAINTENANCE (COMPATIBILITY)
  // --------------------------------------------------------------------------
  const scheduleMaintenance = useCallback(
    (maintData: Omit<MaintenanceRecord, "id" | "tenantId" | "createdAt">) => {
      const newMaint: MaintenanceRecord = {
        ...maintData,
        id: `maint-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
        createdAt: new Date().toISOString(),
      };

      setMaintenance((prev) => [newMaint, ...prev]);

      if (newMaint.status === "IN_PROGRESS" && newMaint.blocksAvailability) {
        setVehicles((prev) =>
          prev.map((v) => (v.id === newMaint.vehicleId && v.tenantId === activeTenantId ? { ...v, availabilityStatus: "MAINTENANCE" } : v))
        );
      }

      emitDomainFact("MaintenanceScheduled", "MaintenanceRecord", newMaint.id, { workshop: newMaint.workshop, cost: newMaint.cost }, "maintenance.schedule");
      showNotification(`Maintenance scheduled at ${newMaint.workshop}.`);
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  const updateMaintenanceStatus = useCallback(
    (id: string, status: MaintenanceRecord["status"]) => {
      const m = maintenance.find((item) => item.id === id && item.tenantId === activeTenantId);
      if (!m) return;

      const now = new Date().toISOString();
      setMaintenance((prev) =>
        prev.map((item) =>
          item.id === id && item.tenantId === activeTenantId
            ? { ...item, status, completedDate: status === "COMPLETED" ? now : item.completedDate }
            : item
        )
      );

      // If completed, free vehicle availability
      if (status === "COMPLETED" || status === "VERIFIED") {
        setVehicles((prev) =>
          prev.map((v) => (v.id === m.vehicleId && v.tenantId === activeTenantId && v.availabilityStatus === "MAINTENANCE" ? { ...v, availabilityStatus: "AVAILABLE" } : v))
        );
      } else if (status === "IN_PROGRESS") {
        setVehicles((prev) =>
          prev.map((v) => (v.id === m.vehicleId && v.tenantId === activeTenantId ? { ...v, availabilityStatus: "MAINTENANCE" } : v))
        );
      }

      emitDomainFact("MaintenanceStatusUpdated", "MaintenanceRecord", id, { status }, "maintenance.update_status");
      showNotification(`Maintenance status updated to ${status}.`);
    },
    [maintenance, activeTenantId, emitDomainFact, showNotification]
  );

  const addComplianceDocument = useCallback(
    (docData: Omit<ComplianceDocument, "id" | "tenantId">) => {
      const newDoc: ComplianceDocument = {
        ...docData,
        id: `comp-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
      };
      setComplianceDocs((prev) => [newDoc, ...prev]);
      // Live backend API synchronization
      apiClient.compliance.addDocument(newDoc).catch(() => null);
      emitDomainFact("ComplianceDocumentAdded", "ComplianceDocument", newDoc.id, { documentType: newDoc.documentType, expiryDate: newDoc.expiryDate }, "compliance.add_document");
      showNotification(`Compliance document ${newDoc.documentNumber} registered.`);
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  const overrideComplianceHold = useCallback(
    (docId: string, reason: string) => {
      setComplianceDocs((prev) =>
        prev.map((doc) =>
          doc.id === docId && doc.tenantId === activeTenantId
            ? {
                ...doc,
                isBlocked: false,
                overrideReason: reason,
                overriddenBy: currentUser.fullName,
                overriddenAt: new Date().toISOString(),
              }
            : doc
        )
      );
      // Live backend API synchronization
      apiClient.compliance.overrideHold(docId, reason).catch(() => null);
      emitDomainFact("ComplianceOverrideApproved", "ComplianceDocument", docId, { reason, actor: currentUser.fullName }, "compliance.override");
      showNotification("Compliance hold overridden with recorded audit note.");
    },
    [activeTenantId, currentUser, emitDomainFact, showNotification]
  );

  // --------------------------------------------------------------------------
  // DOMAIN ACTIONS: TENANT FINANCE & SETTLEMENTS (DATA-004)
  // --------------------------------------------------------------------------
  const recordPayment = useCallback(
    (paymentData: Omit<TenantPayment, "id" | "tenantId" | "paymentNumber" | "recordedAt" | "postedToLedger">): TenantPayment => {
      const nextSeq = 100 + payments.length + 1;
      const newPayment: TenantPayment = {
        ...paymentData,
        id: `pay-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
        paymentNumber: `PAY-2026-${nextSeq}`,
        recordedAt: new Date().toISOString(),
        postedToLedger: true,
      };

      setPayments((prev) => [newPayment, ...prev]);

      // If tied to booking, increment amountPaid
      if (newPayment.bookingId) {
        setBookings((prev) =>
          prev.map((b) =>
            b.id === newPayment.bookingId && b.tenantId === activeTenantId
              ? {
                  ...b,
                  amountPaid: (b.amountPaid || 0) + newPayment.amount,
                  updatedAt: new Date().toISOString(),
                }
              : b
          )
        );
      }

      // Live backend API synchronization
      apiClient.payments.recordManual(newPayment as any).catch(() => null);

      emitDomainFact("PaymentSucceeded", "Payment", newPayment.id, { amount: newPayment.amount, method: newPayment.paymentMethod, receipt: newPayment.providerTransactionId }, "payments.record");
      showNotification(`Payment of ${newPayment.currency} ${newPayment.amount.toLocaleString()} received.`);
      return newPayment;
    },
    [payments.length, activeTenantId, emitDomainFact, showNotification]
  );

  const addExpense = useCallback(
    (expenseData: Omit<TenantExpense, "id" | "tenantId" | "createdAt">): TenantExpense => {
      const newExp: TenantExpense = {
        ...expenseData,
        id: `exp-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
        createdAt: new Date().toISOString(),
      };
      setExpenses((prev) => [newExp, ...prev]);
      // Live backend API synchronization
      apiClient.finance.createExpense(newExp).catch(() => null);
      emitDomainFact("ExpenseCreated", "Expense", newExp.id, { amount: newExp.amount, category: newExp.category }, "expenses.create");
      showNotification(`Expense logged: ${newExp.currency} ${newExp.amount.toLocaleString()}.`);
      return newExp;
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  const calculateOwnerSettlement = useCallback(
    (ownerId: string, periodStart: string, periodEnd: string): OwnerSettlement => {
      const owner = vehicleOwners.find((o) => o.id === ownerId && o.tenantId === activeTenantId);
      const ownerName = owner?.name || "Unknown Owner";

      // Find all vehicles owned by this owner
      const ownedVehicles = vehicles.filter((v) => v.ownerId === ownerId && v.tenantId === activeTenantId);
      const ownedVehicleIds = ownedVehicles.map((v) => v.id);

      // Find rentals in period for these vehicles
      const eligibleRentals = rentals.filter(
        (r) => ownedVehicleIds.includes(r.vehicleId) && r.tenantId === activeTenantId && r.state === "COMPLETED"
      );

      // Map into settlement items with historical ownership revenue split
      const items = eligibleRentals.map((r) => {
        const b = bookings.find((book) => book.id === r.bookingId);
        const pricingObj = (b?.pricing || b?.pricingSnapshot) as any;
        const grossRevenue = pricingObj?.baseRental ?? pricingObj?.baseRentalAmount ?? b?.grossTotal ?? 50000;
        const ownership = vehicleOwnerships.find((own) => own.vehicleId === r.vehicleId && own.isActive);
        const splitPercent = ownership ? ownership.revenueSharePercent : 75;
        const ownerGross = (grossRevenue * splitPercent) / 100;
        const deductedExpenses = 0; // maintenance deductions if any
        return {
          id: `si-${Date.now().toString(36)}-${r.id}`,
          rentalId: r.id,
          vehicleId: r.vehicleId,
          rentalNumber: r.rentalNumber,
          grossRentalRevenue: grossRevenue,
          ownerRevenueSharePercent: splitPercent,
          ownerRevenueGross: ownerGross,
          deductedExpenses,
          netPayableToOwner: ownerGross - deductedExpenses,
        };
      });

      const totalGross = items.reduce((acc, curr) => acc + curr.grossRentalRevenue, 0);
      const totalOwner = items.reduce((acc, curr) => acc + curr.ownerRevenueGross, 0);
      const totalDeduct = items.reduce((acc, curr) => acc + curr.deductedExpenses, 0);

      const nextSeq = 10 + settlements.length + 1;
      const newSettlement: OwnerSettlement = {
        id: `set-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
        settlementNumber: `SET-2026-${nextSeq}`,
        ownerId,
        ownerName,
        periodStart,
        periodEnd,
        items,
        totalGrossRevenue: totalGross,
        totalOwnerShare: totalOwner,
        totalDeductions: totalDeduct,
        netPayoutAmount: totalOwner - totalDeduct,
        currency: activeTenant.currency,
        status: "CALCULATED",
        calculatedAt: new Date().toISOString(),
      };

      setSettlements((prev) => [newSettlement, ...prev]);
      // Live backend API synchronization
      apiClient.ownerSettlements.calculateSettlement(newSettlement).catch(() => null);
      emitDomainFact("SettlementCalculated", "OwnerSettlement", newSettlement.id, { netPayout: newSettlement.netPayoutAmount, ownerName }, "settlements.calculate");
      showNotification(`Settlement statement ${newSettlement.settlementNumber} generated.`);
      return newSettlement;
    },
    [vehicleOwners, activeTenantId, vehicles, rentals, bookings, vehicleOwnerships, settlements.length, activeTenant.currency, emitDomainFact, showNotification]
  );

  const approveOwnerSettlement = useCallback(
    (settlementId: string) => {
      setSettlements((prev) =>
        prev.map((s) =>
          s.id === settlementId && s.tenantId === activeTenantId
            ? { ...s, status: "APPROVED", approvedAt: new Date().toISOString() }
            : s
        )
      );
      // Live backend API synchronization
      apiClient.ownerSettlements.approveSettlement(settlementId).catch(() => null);
      emitDomainFact("SettlementApproved", "OwnerSettlement", settlementId, {}, "settlements.approve");
      showNotification("Owner settlement approved for payment.");
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  const payOwnerSettlement = useCallback(
    (_settlementId: string, _payoutRef: string) => {
      showNotification("Use Settlements → Payout queue for provider-backed owner payouts. Direct browser-paid transitions are disabled.", "error");
    },
    [showNotification]
  );

  const postLedgerTransaction = useCallback(
    (txData: Omit<PrototypeLedgerTransaction, "id" | "tenantId" | "postedAt">): boolean => {
      if (!txData.isBalanced || txData.totalDebit !== txData.totalCredit) {
        showNotification("Posting failed: Ledger transaction is unbalanced (Debits != Credits).", "error");
        return false;
      }

      const newTx: PrototypeLedgerTransaction = {
        ...txData,
        id: `tx-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
        postedAt: new Date().toISOString(),
      };

      setLedgerTransactions((prev) => [newTx, ...prev]);

      // Update account balances
      setLedgerAccounts((prev) =>
        prev.map((acc) => {
          const entry = newTx.entries.find((e) => e.accountId === acc.id);
          if (!entry) return acc;
          const delta = acc.type === "ASSET" || acc.type === "EXPENSE"
            ? entry.type === "DEBIT" ? entry.amount : -entry.amount
            : entry.type === "CREDIT" ? entry.amount : -entry.amount;
          return { ...acc, balance: acc.balance + delta };
        })
      );

      emitDomainFact("LedgerTransactionPosted", "LedgerTransaction", newTx.id, { reference: newTx.reference, amount: newTx.totalDebit }, "ledger.post");
      showNotification("General ledger entries posted successfully.");
      return true;
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  // --------------------------------------------------------------------------
  // DOMAIN ACTIONS: PAYMENT PROVIDER INTEGRATION (PAY-001)
  // --------------------------------------------------------------------------
  const processMpesaPayment = useCallback(async (_bookingId: string, _phoneNumber: string, _amount: number): Promise<PaymentAttempt> => {
    throw new Error("Online payment collection is not configured. No payment has been recorded.");
  }, []);

  const startSupportAccess = useCallback(
    (reason: string) => {
      setIsSupportAccessActive(true);
      setSupportAccessReason(reason);
      emitDomainFact("SupportAccessSessionStarted", "SupportSession", `supp-${Date.now().toString(36)}`, { reason, targetTenantId: activeTenantId }, "platform.support.access");
      showNotification(`Support impersonation session activated: "${reason}"`);
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  const endSupportAccess = useCallback(() => {
    setIsSupportAccessActive(false);
    setSupportAccessReason(null);
    emitDomainFact("SupportAccessSessionEnded", "SupportSession", `supp-ended`, { targetTenantId: activeTenantId }, "platform.support.end");
    showNotification("Support session terminated.");
  }, [activeTenantId, emitDomainFact, showNotification]);

  const changeTenantPlan = useCallback(
    (planId: string) => {
      setTenants((prev) =>
        prev.map((t) => (t.id === activeTenantId ? { ...t, planId, updatedAt: new Date().toISOString() } : t))
      );
      setSubscriptions((prev) =>
        prev.map((s) => (s.tenantId === activeTenantId ? { ...s, planId } : s))
      );
      // Live backend API synchronization
      apiClient.platform.changeTenantPlan(activeTenantId, planId).catch(() => null);
      emitDomainFact("SubscriptionPlanChanged", "Subscription", activeSubscription.id, { newPlanId: planId }, "subscriptions.change_plan");
      showNotification(`Subscription plan updated to ${plans.find((p) => p.id === planId)?.name}.`);
    },
    [activeTenantId, activeSubscription.id, emitDomainFact, plans, showNotification]
  );

  const toggleTenantSuspension = useCallback(
    (tenantId: string) => {
      const shouldSuspend = tenants.find((tenant) => tenant.id === tenantId)?.status === "ACTIVE";
      setTenants((prev) =>
        prev.map((t) => {
          if (t.id === tenantId) {
            const nextStatus = t.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
            return { ...t, status: nextStatus, updatedAt: new Date().toISOString() };
          }
          return t;
        })
      );
      setSubscriptions((prev) =>
        prev.map((s) => {
          if (s.tenantId === tenantId) {
            const nextState = s.state === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
            return { ...s, state: nextState };
          }
          return s;
        })
      );
      // Live backend API synchronization
      apiClient.platform.toggleTenantSuspension(tenantId, shouldSuspend).catch(() => null);
      showNotification(`Tenant account status toggled.`);
    },
    [showNotification, tenants]
  );

  const updateTenantSettings = useCallback(
    (settingsUpdates: Partial<Tenant>) => {
      setTenants((prev) =>
        prev.map((t) => (t.id === activeTenantId ? { ...t, ...settingsUpdates, updatedAt: new Date().toISOString() } : t))
      );
      emitDomainFact("TenantSettingsUpdated", "Tenant", activeTenantId, settingsUpdates, "tenant.update_settings");
      showNotification("Company settings saved.");
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  const updateWebsite = useCallback(
    (websiteUpdates: Partial<TenantWebsite>) => {
      setWebsites((prev) =>
        prev.map((w) => (w.tenantId === activeTenantId ? { ...w, ...websiteUpdates } : w))
      );
      emitDomainFact("WebsiteUpdated", "TenantWebsite", activeTenantId, websiteUpdates, "website.update");
      showNotification("Tenant public website updated.");
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  const verifyCustomDomain = useCallback(
    (domainId: string) => {
      setDomains((prev) =>
        prev.map((d) =>
          d.id === domainId && d.tenantId === activeTenantId
            ? { ...d, isVerified: true, tlsStatus: "ACTIVE", isActive: true }
            : d
        )
      );
      emitDomainFact("DomainVerified", "TenantDomain", domainId, { tlsStatus: "ACTIVE" }, "domains.verify");
      showNotification("Custom domain ownership verified & TLS certificate provisioned.");
      try {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      } catch (e) {}
    },
    [activeTenantId, emitDomainFact, showNotification]
  );

  const updateSubscriptionState = useCallback(
    (idOrTenantId: string, state: SubscriptionState, reason?: string) => {
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === idOrTenantId || s.tenantId === idOrTenantId
            ? { ...s, state, status: state, updatedAt: new Date().toISOString() }
            : s
        )
      );
      emitDomainFact("SubscriptionStateChanged", "Subscription", idOrTenantId, { state, reason }, "subscriptions.state_change");
      showNotification(`Subscription state updated to ${state}.`);
    },
    [emitDomainFact, showNotification]
  );

  const switchSubscriptionPlan = useCallback(
    (tenantId: string, planId: string) => {
      setSubscriptions((prev) =>
        prev.map((s) => (s.tenantId === tenantId ? { ...s, planId } : s))
      );
      showNotification(`Plan switched successfully.`);
    },
    [showNotification]
  );

  const updateTenantWebsiteConfig = useCallback(
    (config: any) => {
      setTenants((prev) =>
        prev.map((t) =>
          t.id === activeTenantId
            ? { ...t, websiteConfig: { ...(t.websiteConfig || {}), ...config } }
            : t
        )
      );
      showNotification("Tenant website configuration saved.");
    },
    [activeTenantId, showNotification]
  );

  const resetToSeedData = useCallback(() => {
    showNotification("Demo reset is disabled. Saved cars and database records are preserved.", "info");
  }, [showNotification]);

  // --------------------------------------------------------------------------
  // SPRINT 3: IDENTITY & AUTHENTICATION HANDLERS (DEV-004, SEC-007)
  // --------------------------------------------------------------------------
  const loginUser = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await apiClient.auth.login({ email: normalizedEmail, password });
      if (res.error) {
        throw new Error(res.error.message || "Invalid email or password");
      }

      if (res.data?.tokens?.accessToken) {
        apiClient.setToken(res.data.tokens.accessToken);
        apiClient.setRefreshToken(res.data.tokens.refreshToken);
      }

      if (!res.data?.user?.email) {
        throw new Error("The authentication service did not return an authenticated user.");
      }

      setAuthenticatedUser(res.data.user as User);
      setActiveSessionsList(res.data.session ? [res.data.session] : []);
      return true;
    } catch (err: any) {
      throw new Error(err.message || "Invalid credentials");
    }
  }, []);

  const registerUser = useCallback(async (email: string, password: string, fullName: string, phone?: string): Promise<boolean> => {
    const normalizedEmail = email.trim().toLowerCase();
    const res = await apiClient.auth.register({ email: normalizedEmail, password, fullName, phone });
    if (res.error) {
      throw new Error(res.error.message || "Registration failed. Please try again.");
    }

    if (!res.data?.user?.email) {
      throw new Error("The authentication service did not return the new account.");
    }

    const newUser = res.data.user as User;

    setUsers((prev) => prev.some((user) => user.email.toLowerCase() === normalizedEmail)
      ? prev
      : [...prev, newUser]);
    return true;
  }, []);

  const logoutUser = useCallback(async (allSessions?: boolean): Promise<void> => {
    try {
      await apiClient.auth.logout(Boolean(allSessions), apiClient.getRefreshToken());
    } finally {
      apiClient.setToken(null);
      apiClient.setRefreshToken(null);
      setAuthenticatedUser(null);
      setActiveSessionsList([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      if(access) return;
      const accessToken = apiClient.getToken();
      const refreshToken = apiClient.getRefreshToken();
      if (!accessToken && !refreshToken) {
        return;
      }

      let me = await apiClient.auth.getMe();


      if (cancelled) {
        return;
      }

      if (me.data?.user) {
        setAuthenticatedUser(me.data.user as User);
        const sessions = await apiClient.auth.getSessions();
        setActiveSessionsList(sessions.data?.sessions || []);
      } else {
        apiClient.setToken(null);
        apiClient.setRefreshToken(null);
      }
    };

    restoreSession().catch(() => {
      if (!cancelled) {
        apiClient.setToken(null);
        apiClient.setRefreshToken(null);
        setAuthenticatedUser(null);
        setActiveSessionsList([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if(access) return;
    apiClient.setSessionExpiredHandler(() => {
      setAuthenticatedUser(null);
      setActiveSessionsList([]);
    });

    return () => apiClient.setSessionExpiredHandler(null);
  }, []);

  const forgotPasswordUser = useCallback(async (email: string): Promise<boolean> => {
    const normalized = email.trim().toLowerCase();
    await apiClient.auth.forgotPassword(normalized);
    const exists = users.some((u) => u.normalizedEmail === normalized);
    return exists;
  }, [users]);

  const resetPasswordUser = useCallback(async (token: string, newPassword: string): Promise<boolean> => {
    if (!token || token.length < 8) {
      throw new Error("Invalid or expired password reset token.");
    }
    await apiClient.auth.resetPassword(token, newPassword);
    return true;
  }, []);

  const verifyEmailUser = useCallback(async (token: string): Promise<boolean> => {
    if (!token || token.length < 8) {
      throw new Error("Invalid or expired verification token.");
    }
    await apiClient.auth.verifyEmail(token);
    if (authenticatedUser) {
      setAuthenticatedUser((curr) => curr ? { ...curr, emailVerified: true, emailVerifiedAt: new Date().toISOString() } : curr);
    }
    return true;
  }, [authenticatedUser]);

  const resendVerificationUser = useCallback(async (email: string): Promise<boolean> => {
    return Boolean(email);
  }, []);

  const revokeSessionUser = useCallback(async (sessionId: string): Promise<void> => {
    await apiClient.auth.revokeSession(sessionId);
    setActiveSessionsList((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  const revokeAllSessionsUser = useCallback(async (): Promise<void> => {
    await apiClient.auth.revokeAllSessions();
    apiClient.setToken(null);
    apiClient.setRefreshToken(null);
    setAuthenticatedUser(null);
    setActiveSessionsList((prev) => prev.filter((s) => s.isCurrent));
  }, []);

  // --------------------------------------------------------------------------
  // SPRINT 4: MULTI-TENANCY & TRUSTED TENANT CONTEXT (DEV-004, DOM-003 §4-6)
  // --------------------------------------------------------------------------
  const userMemberships = useMemo(() => {
    return memberships.filter(
      (m) => m.userId === currentUser.id && m.status === "ACTIVE"
    );
  }, [memberships, currentUser.id]);

  const switchTenant = useCallback(
    async (targetTenantId: string): Promise<boolean> => {
      const targetTenant = tenants.find((t) => t.id === targetTenantId);
      if (!targetTenant) {
        showNotification("Target tenant organization not found.");
        return false;
      }

      if (targetTenant.status === "SUSPENDED" && !isPlatformAdminMode) {
        showNotification(`Workspace '${targetTenant.name}' is currently suspended.`);
        return false;
      }

      const hasMembership = memberships.some(
        (m) => m.tenantId === targetTenantId && m.userId === currentUser.id && m.status === "ACTIVE"
      );

      if (!hasMembership && !isPlatformAdminMode) {
        showNotification(`You do not have an active authorized membership in '${targetTenant.name}'.`);
        return false;
      }

      apiClient.setTenantId(targetTenantId);
      const res = await apiClient.tenancy.switchTenant(targetTenantId);
      if (res.error) { apiClient.setTenantId(activeTenantId); throw new Error(res.error.message); }

      setActiveTenantId(targetTenantId);
      showNotification(`Switched active workspace to ${targetTenant.name}`);
      return true;
    },
    [tenants, memberships, currentUser.id, isPlatformAdminMode, showNotification]
  );

  const provisionNewTenant = useCallback(async (dto: any): Promise<boolean> => {
    const response = await apiClient.tenancy.provisionTenant(dto);
    if (response.error) throw new Error(response.error.message);
    const tenant = response.data?.tenant;
    if (!tenant?.id) throw new Error("Workspace creation did not return a saved workspace.");
    apiClient.setTenantId(tenant.id);
    setActiveTenantId(tenant.id);
    setTenants(prev => [...prev,tenant]);
    setMemberships(prev => [...prev,(response.data as any).membership]);
    return true;
  }, []);

  // ============================================================================
  // SPRINT 11: PRICING & RATE ENGINE ACTIONS
  // ============================================================================
  const createRatePlan = useCallback(
    (plan: Partial<RatePlan>): RatePlan => {
      const newPlan: RatePlan = {
        id: `rp-${Date.now().toString(36)}`,
        tenantId: activeTenantId,
        code: plan.code || `PLAN_${Date.now().toString(36).toUpperCase()}`,
        name: plan.name || "Custom Rate Plan",
        description: plan.description || "",
        status: plan.status || "ACTIVE",
        currency: plan.currency || activeTenant.currency || "KES",
        priority: plan.priority ?? 10,
        isDefault: plan.isDefault ?? false,
        effectiveFrom: plan.effectiveFrom || new Date().toISOString(),
        effectiveTo: plan.effectiveTo || null,
        taxInclusive: plan.taxInclusive ?? false,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setRatePlans((prev) => [newPlan, ...prev]);
      // Live backend API synchronization
      apiClient.pricing.createRatePlan(newPlan).catch(() => null);
      emitDomainFact("RatePlanCreated", "RatePlan", newPlan.id, { code: newPlan.code, name: newPlan.name }, "pricing.rate_plan.create");
      return newPlan;
    },
    [activeTenantId, activeTenant.currency, emitDomainFact]
  );

  const updateRatePlan = useCallback((id: string, updates: Partial<RatePlan>) => {
    setRatePlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p))
    );
  }, []);

  const activateRatePlan = useCallback((id: string) => {
    setRatePlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "ACTIVE", updatedAt: new Date().toISOString() } : p))
    );
  }, []);

  const archiveRatePlan = useCallback((id: string) => {
    setRatePlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "ARCHIVED", updatedAt: new Date().toISOString() } : p))
    );
  }, []);

  const saveRatePlanRates = useCallback((ratePlanId: string, rates: RatePlanRate[]) => {
    setRatePlanRates((prev) => {
      const filtered = prev.filter((r) => r.ratePlanId !== ratePlanId);
      return [...filtered, ...rates];
    });
  }, []);

  const createSeasonalRule = useCallback((rule: Partial<SeasonalRateRule>) => {
    const newRule: SeasonalRateRule = {
      id: `season-${Date.now().toString(36)}`,
      tenantId: activeTenantId,
      ratePlanId: rule.ratePlanId || null,
      name: rule.name || "Holiday Surcharge",
      startDate: rule.startDate || "2026-12-15",
      endDate: rule.endDate || "2027-01-05",
      multiplier: rule.multiplier ?? 1.25,
      vehicleCategoryId: rule.vehicleCategoryId || null,
      priority: rule.priority ?? 50,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSeasonalRules((prev) => [...prev, newRule]);
  }, [activeTenantId]);

  const deleteSeasonalRule = useCallback((id: string) => {
    setSeasonalRules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const createDurationTier = useCallback((tier: Partial<DurationTierRule>) => {
    const newTier: DurationTierRule = {
      id: `tier-${Date.now().toString(36)}`,
      tenantId: activeTenantId,
      ratePlanId: tier.ratePlanId || null,
      minDays: tier.minDays ?? 7,
      maxDays: tier.maxDays ?? 30,
      discountPercent: tier.discountPercent,
      customDailyRate: tier.customDailyRate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setDurationTiers((prev) => [...prev, newTier]);
  }, [activeTenantId]);

  const deleteDurationTier = useCallback((id: string) => {
    setDurationTiers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const createPricingFee = useCallback((fee: Partial<PricingFeeRule>) => {
    const newFee: PricingFeeRule = {
      id: `fee-${Date.now().toString(36)}`,
      tenantId: activeTenantId,
      ratePlanId: fee.ratePlanId || null,
      code: fee.code || "SERVICE_FEE",
      name: fee.name || "Standard Add-On",
      feeType: (fee.feeType || "EQUIPMENT") as PricingFeeType,
      calculationType: fee.calculationType || "DAILY",
      amount: fee.amount ?? 500,
      isTaxable: fee.isTaxable ?? true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setPricingFees((prev) => [...prev, newFee]);
  }, [activeTenantId]);

  const createPromoCode = useCallback((promo: Partial<PromoCode>) => {
    const newPromo: PromoCode = {
      id: `promo-${Date.now().toString(36)}`,
      tenantId: activeTenantId,
      code: promo.code ? promo.code.toUpperCase() : "PROMO10",
      description: promo.description || "Promotional Discount",
      discountType: promo.discountType || "PERCENTAGE",
      discountValue: promo.discountValue ?? 10,
      applicableTo: promo.applicableTo || "BASE_RENTAL",
      minRentalDays: promo.minRentalDays,
      minSubtotalAmount: promo.minSubtotalAmount,
      maxDiscountAmount: promo.maxDiscountAmount,
      validFrom: promo.validFrom || new Date().toISOString(),
      validTo: promo.validTo || null,
      usageLimit: promo.usageLimit,
      usageCount: 0,
      applicableCategories: promo.applicableCategories,
      isStackable: promo.isStackable ?? false,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setPromoCodes((prev) => [...prev, newPromo]);
  }, [activeTenantId]);

  const togglePromoStatus = useCallback((id: string) => {
    setPromoCodes((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: (p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE") as PromoCodeStatus, updatedAt: new Date().toISOString() } : p
      )
    );
  }, []);

  const calculateInstantQuote = useCallback(
    (req: PricingRequest): PricingResult => {
      const pickup = new Date(req.pickupDateTime);
      const ret = new Date(req.returnDateTime);
      const totalHours = Math.max(1, Math.ceil((ret.getTime() - pickup.getTime()) / (1000 * 60 * 60)));
      const baseDays = Math.floor(totalHours / 24);
      const remainingHours = totalHours % 24;
      const billableDays = Math.max(1, remainingHours > 2 ? baseDays + 1 : baseDays);

      // Match rate plan
      const plan =
        ratePlans.find((p) => p.status === "ACTIVE" && (req.corporateAccountId ? p.code.includes("CORP") : p.isDefault)) ||
        ratePlans[0] || {
          id: "rp-default",
          code: "DEFAULT",
          currency: "KES",
          taxInclusive: false,
          version: 1,
        };

      // Match rate
      const catRate = ratePlanRates.find(
        (r) =>
          r.ratePlanId === plan.id &&
          (req.vehicleId ? r.vehicleId === req.vehicleId : r.vehicleCategoryId === req.vehicleCategoryId)
      ) ||
        ratePlanRates.find((r) => r.ratePlanId === plan.id) || {
          dailyRate: 6000,
          weeklyDailyRate: 5400,
          monthlyDailyRate: 4800,
          weekendDailyRate: 6500,
          mileageAllowanceModel: "DAILY_CAPPED" as const,
          includedKmPerDay: 200,
          excessKmRate: 35,
          depositAmount: 20000,
          depositModel: "FIXED" as const,
        };

      // Calculate day breakdown
      const dayBreakdown: DayRateItem[] = [];
      let baseRentalAmount = 0;

      for (let d = 0; d < billableDays; d++) {
        const dayDate = new Date(pickup.getTime() + d * 24 * 60 * 60 * 1000);
        const dayOfWeek = dayDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || dayOfWeek === 5;
        const dateStr = dayDate.toISOString().split("T")[0];

        let baseForDay = catRate.dailyRate;
        if (billableDays >= 28 && catRate.monthlyDailyRate) {
          baseForDay = catRate.monthlyDailyRate;
        } else if (billableDays >= 7 && catRate.weeklyDailyRate) {
          baseForDay = catRate.weeklyDailyRate;
        } else if (isWeekend && catRate.weekendDailyRate) {
          baseForDay = catRate.weekendDailyRate;
        }

        // Check season
        const season = seasonalRules.find(
          (s) => s.isActive && dateStr >= s.startDate && dateStr <= s.endDate
        );
        const seasonalMultiplier = season ? season.multiplier : 1.0;
        const effectiveRate = Math.round(baseForDay * seasonalMultiplier);

        dayBreakdown.push({
          date: dateStr,
          dayType: isWeekend ? "WEEKEND" : "WEEKDAY",
          baseRate: baseForDay,
          seasonalMultiplier,
          effectiveRate,
          seasonName: season?.name,
        });

        baseRentalAmount += effectiveRate;
      }

      // Duration Tier Discounts
      const matchingTier = durationTiers.find(
        (t) => billableDays >= t.minDays && billableDays <= t.maxDays
      );
      const appliedDiscounts: AppliedDiscountItem[] = [];
      let totalDiscount = 0;

      if (matchingTier && matchingTier.discountPercent) {
        const tierDisc = Math.round((baseRentalAmount * matchingTier.discountPercent) / 100);
        totalDiscount += tierDisc;
        appliedDiscounts.push({
          type: "DURATION_TIER",
          description: `${matchingTier.discountPercent}% Duration Tier Discount (${billableDays} days)`,
          amount: tierDisc,
        });
      }

      // Promo Code
      if (req.promoCode) {
        const promo = promoCodes.find(
          (p) => p.code.toUpperCase() === req.promoCode?.toUpperCase() && p.status === "ACTIVE"
        );
        if (promo) {
          let promoDisc = 0;
          if (promo.discountType === "PERCENTAGE") {
            promoDisc = Math.round((baseRentalAmount * promo.discountValue) / 100);
            if (promo.maxDiscountAmount) {
              promoDisc = Math.min(promoDisc, promo.maxDiscountAmount);
            }
          } else {
            promoDisc = promo.discountValue;
          }
          totalDiscount += promoDisc;
          appliedDiscounts.push({
            type: "PROMO_CODE",
            code: promo.code,
            description: `Promo ${promo.code} Discount`,
            amount: promoDisc,
          });
        }
      }

      // Manual discount %
      if (req.manualDiscountPercent && req.manualDiscountPercent > 0) {
        const manDisc = Math.round((baseRentalAmount * req.manualDiscountPercent) / 100);
        totalDiscount += manDisc;
        appliedDiscounts.push({
          type: "MANUAL",
          description: `Manual Staff Discount (${req.manualDiscountPercent}%)`,
          amount: manDisc,
        });
      }

      // Driver Charges
      let driverServiceCost = 0;
      let additionalDriverCost = 0;
      if (req.driverServiceRequested) {
        driverServiceCost = 3500 * billableDays;
      }
      if (req.additionalDriversCount && req.additionalDriversCount > 0) {
        additionalDriverCost = req.additionalDriversCount * 500 * billableDays;
      }
      const totalDriverCharges = driverServiceCost + additionalDriverCost;

      // Location Charges
      let deliveryFee = 0;
      let collectionFee = 0;
      if (req.deliveryRequested) {
        deliveryFee = 1500 + (req.deliveryDistanceKm || 0) * 50;
      }
      if (req.collectionRequested) {
        collectionFee = 1500 + (req.collectionDistanceKm || 0) * 50;
      }
      const totalLocationCharges = deliveryFee + collectionFee;

      // Net Taxable Subtotal
      const netRental = Math.max(0, baseRentalAmount - totalDiscount);
      const taxableSubtotal = netRental + totalDriverCharges + totalLocationCharges;

      // Tax (16% VAT)
      const vatRate = 16;
      let taxAmount = 0;
      let grossTotal = 0;

      if (plan.taxInclusive) {
        grossTotal = taxableSubtotal;
        taxAmount = Math.round(grossTotal - grossTotal / (1 + vatRate / 100));
      } else {
        taxAmount = Math.round((taxableSubtotal * vatRate) / 100);
        grossTotal = taxableSubtotal + taxAmount;
      }

      const snapshot: PricingSnapshot = {
        snapshotId: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        calculatedAt: new Date().toISOString(),
        ratePlanId: plan.id,
        ratePlanCode: plan.code,
        ratePlanName: (plan as RatePlan).name || "Standard Rate Plan",
        ratePlanVersion: plan.version || 1,
        currency: plan.currency || "KES",
        pickupDateTime: req.pickupDateTime,
        returnDateTime: req.returnDateTime,
        totalHours,
        billableDays,
        baseDailyRate: catRate.dailyRate,
        appliedAverageDailyRate: Math.round(baseRentalAmount / billableDays),
        baseRentalAmount,
        dayBreakdown,
        driverCharges: {
          primaryDriverCharge: 0,
          additionalDriversCharge: additionalDriverCost,
          chauffeurCharge: driverServiceCost,
          youngDriverSurcharge: 0,
          totalDriverCharges,
        },
        locationCharges: {
          deliveryCharge: deliveryFee,
          collectionCharge: collectionFee,
          oneWayFee: 0,
          totalLocationCharges,
        },
        fees: [],
        totalFees: 0,
        discounts: appliedDiscounts,
        totalDiscount,
        netRentalSubtotal: netRental,
        tax: {
          taxRatePercent: vatRate,
          isTaxInclusive: plan.taxInclusive,
          taxableAmount: taxableSubtotal,
          taxAmount,
        },
        grossRentalTotal: grossTotal,
        securityDeposit: {
          required: catRate.depositAmount > 0,
          model: catRate.depositModel,
          amount: catRate.depositAmount,
          isRefundable: true,
        },
        mileageAllowance: {
          model: catRate.mileageAllowanceModel,
          includedKm: (catRate.includedKmPerDay ?? 200) * billableDays,
          excessKmRate: catRate.excessKmRate ?? 35,
        },
        appliedRules: [`Plan: ${plan.code}`, `Days: ${billableDays}`],
      };

      return {
        currency: plan.currency || "KES",
        rentalDuration: {
          totalHours,
          billableDays,
          partialDayGraceApplied: remainingHours > 0 && remainingHours <= 2,
        },
        ratePlanSummary: {
          id: plan.id,
          code: plan.code,
          name: (plan as RatePlan).name || "Standard Rate Plan",
          version: plan.version || 1,
          isCorporateNegotiated: !!req.corporateAccountId,
        },
        baseRate: {
          standardDailyRate: catRate.dailyRate,
          appliedAverageDailyRate: Math.round(baseRentalAmount / billableDays),
          rateUnit: billableDays >= 28 ? "MONTHLY" : billableDays >= 7 ? "WEEKLY" : "DAILY",
        },
        baseRentalAmount,
        dayBreakdown,
        driverCharges: {
          primaryDriverCharge: 0,
          additionalDriversCharge: additionalDriverCost,
          chauffeurCharge: driverServiceCost,
          youngDriverSurcharge: 0,
          totalDriverCharges,
        },
        locationCharges: {
          deliveryCharge: deliveryFee,
          collectionCharge: collectionFee,
          oneWayFee: 0,
          totalLocationCharges,
        },
        itemizedFees: [],
        totalFees: 0,
        appliedDiscounts,
        totalDiscount,
        netRentalSubtotal: netRental,
        taxCalculation: {
          taxRatePercent: vatRate,
          isTaxInclusive: plan.taxInclusive,
          taxableAmount: taxableSubtotal,
          taxAmount,
        },
        grossRentalTotal: grossTotal,
        securityDeposit: {
          required: catRate.depositAmount > 0,
          model: catRate.depositModel,
          amount: catRate.depositAmount,
          isRefundable: true,
        },
        mileageAllowance: {
          model: catRate.mileageAllowanceModel,
          includedKm: (catRate.includedKmPerDay ?? 200) * billableDays,
          excessKmRate: catRate.excessKmRate ?? 35,
        },
        appliedRules: [`Plan: ${plan.code}`, `Days: ${billableDays}`],
        pricingSnapshot: snapshot,
      };
    },
    [ratePlans, ratePlanRates, seasonalRules, durationTiers, promoCodes]
  );

  return (
    <AppContext.Provider
      value={{
        currentView: access ? (originalViews[access.section] || access.section) as ActiveTab : currentView,
        setCurrentView: access ? (view)=>{const section=Object.keys(originalViews).find(id=>originalViews[id]===view);if(section&&access.portal.sections.some(s=>s.id===section))access.onSection(section);} : setCurrentView,
        navigateSection: (section:string)=>{if(access){if(access.portal.sections.some(s=>s.id===section))access.onSection(section);}else setCurrentView(section as ActiveTab);},
        activeTenantId,
        setActiveTenantId,
        activeTenant,
        currentUser,
        authenticatedUser,
        isAuthenticated,
        activeMembership,
        platformMembership,
        isPlatformAdminMode,
        setIsPlatformAdminMode,
        isSupportAccessActive,
        supportAccessReason,
        startSupportAccess,
        endSupportAccess,
        searchQuery,
        setSearchQuery,
        isDarkMode,
        setIsDarkMode,
        tenants,
        users,
        memberships,
        plans,
        subscriptions,
        activeSubscription,
        activePlan,
        billingInvoices,
        vehicles,
        vehicleOwners,
        vehicleOwnerships,
        customers,
        corporateAccounts,
        drivers,
        bookings,
        rentals,
        inspections,
        maintenance,
        maintenanceWorkOrders,
        maintenanceSchedules,
        serviceProviders,
        complianceDocs,
        invoices,
        payments,
        paymentAttempts,
        expenses,
        ledgerAccounts,
        ledgerTransactions,
        settlements,
        outboxEvents,
        auditRecords,
        websites,
        domains,
        selectedVehicleId,
        setSelectedVehicleId,
        selectedBookingId,
        setSelectedBookingId,
        selectedRentalId,
        setSelectedRentalId,
        selectedInspectionId,
        setSelectedInspectionId,
        selectedOwnerId,
        setSelectedOwnerId,
        selectedMaintenanceId,
        setSelectedMaintenanceId,
        selectedScheduleId,
        setSelectedScheduleId,
        isNewBookingOpen,
        setIsNewBookingOpen,
        isNewVehicleOpen,
        setIsNewVehicleOpen,
        isNewCustomerOpen,
        setIsNewCustomerOpen,
        isNewOwnerOpen,
        setIsNewOwnerOpen,
        isInspectionModalOpen,
        setIsInspectionModalOpen,
        inspectionTarget,
        setInspectionTarget,
        isNewWorkOrderModalOpen,
        setIsNewWorkOrderModalOpen,
        isNewScheduleModalOpen,
        setIsNewScheduleModalOpen,
        isNewProviderModalOpen,
        setIsNewProviderModalOpen,
        isMpesaModalOpen,
        setIsMpesaModalOpen,
        mpesaTargetBooking,
        setMpesaTargetBooking,
        notification,
        showNotification,
        entitlementOverrides,
        entitlementRestrictions,
        checkEntitlement,
        canUseCapability,
        createEntitlementOverride,
        revokeEntitlementOverride,
        createEntitlementRestriction,
        liftEntitlementRestriction,
        // Sprint 8 Subscription Enforcement & Restricted Mode
        accessMode,
        isRestricted,
        statusBanner,
        evaluateSubscriptionAccess,
        checkVehicleAvailability,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        addVehicleOwner,
        attachVehicleOwnership,
        addCustomer,
        updateCustomer,
        addDriver,
        createBooking,
        confirmBooking,
        cancelBooking,
        rejectBooking,
        rescheduleBooking,
        substituteVehicle,
        createRentalFromBooking,
        startRental,
        extendRental,
        completeRental,
        recordRentalIncident,
        saveInspection,
        // Sprint 17 Maintenance Management Actions
        createMaintenanceRequest,
        scheduleMaintenanceWorkOrder,
        startMaintenanceWorkOrder,
        addMaintenanceTask,
        updateMaintenanceTask,
        addMaintenancePart,
        recordMaintenanceCost,
        completeMaintenanceWorkOrder,
        verifyMaintenanceWorkOrder,
        cancelMaintenanceWorkOrder,
        createMaintenanceSchedule,
        updateMaintenanceSchedule,
        createServiceProvider,
        updateServiceProvider,
        evaluateMaintenanceDue,
        // Legacy Maintenance
        scheduleMaintenance,
        updateMaintenanceStatus,
        addComplianceDocument,
        overrideComplianceHold,
        recordPayment,
        addExpense,
        calculateOwnerSettlement,
        approveOwnerSettlement,
        payOwnerSettlement,
        postLedgerTransaction,
        processMpesaPayment,
        // Compatibility Aliases
        registerVehicle: addVehicle,
        recordInspection: saveInspection,
        triggerMpesaStkPush: processMpesaPayment,
        updateSubscriptionState,
        switchSubscriptionPlan,
        updateTenantWebsiteConfig,
        activeRateRules: [],
        changeTenantPlan,
        toggleTenantSuspension,
        updateTenantSettings,
        updateWebsite,
        verifyCustomDomain,
        resetToSeedData,
        // Sprint 3 Identity & Auth Actions
        isAuthModalOpen,
        setIsAuthModalOpen,
        authModalMode,
        setAuthModalMode,
        activeSessions: activeSessionsList,
        loginUser,
        registerUser,
        logoutUser,
        forgotPasswordUser,
        resetPasswordUser,
        verifyEmailUser,
        resendVerificationUser,
        revokeSessionUser,
        revokeAllSessionsUser,
        // Sprint 4 Multi-Tenancy Actions
        userMemberships,
        switchTenant,
        provisionNewTenant,
        workspaceLoading,
        restoration: Boolean(access),
        hasPermission: (permission: string) => Boolean(access && permits(access.portal, permission)),
        workspaceError,
        // Sprint 11 Pricing & Rate Engine
        ratePlans,
        ratePlanRates,
        seasonalRules,
        durationTiers,
        pricingFees,
        promoCodes,
        createRatePlan,
        updateRatePlan,
        activateRatePlan,
        archiveRatePlan,
        saveRatePlanRates,
        createSeasonalRule,
        deleteSeasonalRule,
        createDurationTier,
        deleteDurationTier,
        createPricingFee,
        createPromoCode,
        togglePromoStatus,
        calculateInstantQuote,
      }}
    >
      {children}
    </AppContext.Provider>
  );

};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};

export const useAppStore = useApp;
