// ============================================================================
// CAR HIRE OS — SEED DATA & BOOTSTRAP CONFIGURATION
// ============================================================================

import type { Tenant, Vehicle } from "../types";

export const INITIAL_TENANTS = [
  {
    id: "tenant-nairobi",
    name: "Nairobi Car Hire Ltd",
    slug: "nairobi",
    planId: "plan-growth",
    currency: "KES",
    status: "ACTIVE",
    tenantType: "OPERATOR",
    description: "Premium car hire services in Nairobi metropolitan area",
    address: {
      street: "123 Moi Avenue",
      city: "Nairobi",
      county: "Nairobi",
      postalCode: "00100",
      country: "KE"
    },
    contact: {
      phone: "+254 712 345 678",
      email: "nairobi@carhireos.com",
      website: "https://nairobi.carhireos.com"
    },
    branding: {
      primaryColor: "#059669",
      secondaryColor: "#10b981",
      logoUrl: "https://assets.carhireos.com/tenants/nairobi/logo.png",
      fontFamily: "Inter, sans-serif"
    },
    navigation: {
      items: [
        { id: "home", label: "Home", path: "/", type: "LINK", visible: true },
        { id: "about", label: "About Us", path: "/about", type: "LINK", visible: true },
        { id: "fleet", label: "Fleet", path: "/fleet", type: "LINK", visible: true },
        { id: "pricing", label: "Pricing", path: "/pricing", type: "LINK", visible: true },
        { id: "contact", label: "Contact", path: "/contact", type: "LINK", visible: true }
      ]
    },
    features: [
      "fleet.vehicle.create",
      "booking.create", 
      "website.enabled",
      "website.custom_domain",
      "finance.ledger",
      "settlements.manage",
      "reports.advanced"
    ],
    limits: {
      maxVehicles: 25,
      maxMembers: 10,
      maxBookingsPerMonth: 500,
      storageGB: 10,
      apiRequestsPerMinute: 100
    },
    configuration: {
      timeZone: "Africa/Nairobi",
      dateFormat: "dd/MM/yyyy",
      dateSeparator: "-",
      vehicleStatusOptions: ["AVAILABLE", "ON_RENT", "MAINTENANCE", "UNAVAILABLE"],
      paymentTerms: "NET30",
      lateFeePercentage: 5,
      insuranceRequired: true,
      kycRequired: true,
      twoFactorAuthRequired: true
    },
    platformSettings: {
      allowSelfRegistration: true,
      autoApproveBookings: false,
      requireDriverLicense: true,
      requireInsurance: true,
      taxRate: 0.16,
      exciseDutyRate: 0.05
    },
    complianceSettings: {
      kycLevel: "ENHANCED",
      riskScoringRequired: true,
      sanctionScreeningEnabled: true,
      monitoringAlertsEnabled: true
    },
    supportSettings: {
      emailSupport: "support@carhireos.com",
      phoneSupport: "+254 800 123 456",
      businessHours: {
        monday: { start: "08:00", end: "18:00", enabled: true },
        tuesday: { start: "08:00", end: "18:00", enabled: true },
        wednesday: { start: "08:00", end: "18:00", enabled: true },
        thursday: { start: "08:00", end: "18:00", enabled: true },
        friday: { start: "08:00", end: "18:00", enabled: true },
        saturday: { start: "08:00", end: "14:00", enabled: true },
        sunday: { start: "08:00", end: "12:00", enabled: true }
      },
      escalationPath: ["manager", "team_lead", "director"]
    },
    webhookEndpoints: {
      payments: "https://api.carhireos.com/hooks/payments",
      bookings: "https://api.carhireos.com/hooks/bookings",
      analytics: "https://api.carhireos.com/hooks/analytics"
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false,
    deletedAt: null,
    version: 1
  },
  {
    id: "tenant-mombasa",
    name: "Mombasa Coastal Car Hire",
    slug: "mombasa",
    planId: "plan-starter",
    currency: "KES",
    status: "ACTIVE",
    tenantType: "OPERATOR",
    description: "Car hire services for Mombasa and surrounding coastal areas",
    address: {
      street: "45 Nyali Road",
      city: "Mombasa",
      county: "Mombasa",
      postalCode: "80100",
      country: "KE"
    },
    contact: {
      phone: "+254 721 456 789",
      email: "mombasa@carhireos.com",
      website: "https://mombasa.carhireos.com"
    },
    branding: {
      primaryColor: "#059669",
      secondaryColor: "#10b981",
      logoUrl: "https://assets.carhireos.com/tenants/mombasa/logo.png",
      fontFamily: "Inter, sans-serif"
    },
    navigation: {
      items: [
        { id: "home", label: "Home", path: "/", type: "LINK", visible: true },
        { id: "fleet", label: "Fleet", path: "/fleet", type: "LINK", visible: true },
        { id: "pricing", label: "Pricing", path: "/pricing", type: "LINK", visible: true },
        { id: "contact", label: "Contact", path: "/contact", type: "LINK", visible: true }
      ]
    },
    features: [
      "fleet.vehicle.create",
      "booking.create",
      "website.enabled"
    ],
    limits: {
      maxVehicles: 5,
      maxMembers: 3,
      maxBookingsPerMonth: 100,
      storageGB: 2,
      apiRequestsPerMinute: 50
    },
    configuration: {
      timeZone: "Africa/Mombasa",
      dateFormat: "dd/MM/yyyy",
      dateSeparator: "-",
      vehicleStatusOptions: ["AVAILABLE", "ON_RENT", "MAINTENANCE", "UNAVAILABLE"],
      paymentTerms: "NET30",
      lateFeePercentage: 5,
      insuranceRequired: true,
      kycRequired: true,
      twoFactorAuthRequired: true
    },
    platformSettings: {
      allowSelfRegistration: true,
      autoApproveBookings: false,
      requireDriverLicense: true,
      requireInsurance: true,
      taxRate: 0.16,
      exciseDutyRate: 0.05
    },
    complianceSettings: {
      kycLevel: "STANDARD",
      riskScoringRequired: false,
      sanctionScreeningEnabled: true,
      monitoringAlertsEnabled: false
    },
    supportSettings: {
      emailSupport: "support@carhireos.com",
      phoneSupport: "+254 800 123 456",
      businessHours: {
        monday: { start: "08:00", end: "18:00", enabled: true },
        tuesday: { start: "08:00", end: "18:00", enabled: true },
        wednesday: { start: "08:00", end: "18:00", enabled: true },
        thursday: { start: "08:00", end: "18:00", enabled: true },
        friday: { start: "08:00", end: "18:00", enabled: true },
        saturday: { start: "08:00", end: "14:00", enabled: true },
        sunday: { start: "08:00", end: "12:00", enabled: true }
      },
      escalationPath: ["manager", "team_lead"]
    },
    webhookEndpoints: {
      payments: "https://api.carhireos.com/hooks/payments",
      bookings: "https://api.carhireos.com/hooks/bookings",
      analytics: "https://api.carhireos.com/hooks/analytics"
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false,
    deletedAt: null,
    version: 1
  },
  {
    id: "tenant-akin",
    name: "Akin & Sons Transport",
    slug: "akin",
    planId: "plan-starter",
    currency: "KES",
    status: "ACTIVE",
    tenantType: "OPERATOR",
    description: "Family-owned transport services with 15+ years experience",
    address: {
      street: "78 Industry Area",
      city: "Eldoret",
      county: "Uasin Gishu",
      postalCode: "30100",
      country: "KE"
    },
    contact: {
      phone: "+254 722 555 777",
      email: "akin@carhireos.com",
      website: "https://akin.carhireos.com"
    },
    branding: {
      primaryColor: "#059669",
      secondaryColor: "#10b981",
      logoUrl: "https://assets.carhireos.com/tenants/akin/logo.png",
      fontFamily: "Inter, sans-serif"
    },
    navigation: {
      items: [
        { id: "home", label: "Home", path: "/", type: "LINK", visible: true },
        { id: "about", label: "About Us", path: "/about", type: "LINK", visible: true },
        { id: "fleet", label: "Fleet", path: "/fleet", type: "LINK", visible: true },
        { id: "contact", label: "Contact", path: "/contact", type: "LINK", visible: true }
      ]
    },
    features: [
      "fleet.vehicle.create",
      "booking.create",
      "website.enabled"
    ],
    limits: {
      maxVehicles: 5,
      maxMembers: 3,
      maxBookingsPerMonth: 100,
      storageGB: 2,
      apiRequestsPerMinute: 50
    },
    configuration: {
      timeZone: "Africa/Nairobi",
      dateFormat: "dd/MM/yyyy",
      dateSeparator: "-",
      vehicleStatusOptions: ["AVAILABLE", "ON_RENT", "MAINTENANCE", "UNAVAILABLE"],
      paymentTerms: "NET30",
      lateFeePercentage: 5,
      insuranceRequired: true,
      kycRequired: true,
      twoFactorAuthRequired: true
    },
    platformSettings: {
      allowSelfRegistration: true,
      autoApproveBookings: false,
      requireDriverLicense: true,
      requireInsurance: true,
      taxRate: 0.16,
      exciseDutyRate: 0.05
    },
    complianceSettings: {
      kycLevel: "STANDARD",
      riskScoringRequired: false,
      sanctionScreeningEnabled: true,
      monitoringAlertsEnabled: false
    },
    supportSettings: {
      emailSupport: "support@carhireos.com",
      phoneSupport: "+254 800 123 456",
      businessHours: {
        monday: { start: "08:00", end: "18:00", enabled: true },
        tuesday: { start: "08:00", end: "18:00", enabled: true },
        wednesday: { start: "08:00", end: "18:00", enabled: true },
        thursday: { start: "08:00", end: "18:00", enabled: true },
        friday: { start: "08:00", end: "18:00", enabled: true },
        saturday: { start: "08:00", end: "14:00", enabled: true },
        sunday: { start: "08:00", end: "12:00", enabled: true }
      },
      escalationPath: ["manager"]
    },
    webhookEndpoints: {
      payments: "https://api.carhireos.com/hooks/payments",
      bookings: "https://api.carhireos.com/hooks/bookings",
      analytics: "https://api.carhireos.com/hooks/analytics"
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false,
    deletedAt: null,
    version: 1
  },
  {
    id: "tenant-platform-admin",
    name: "Platform Admin",
    slug: "platform",
    planId: "plan-starter",
    currency: "KES",
    status: "ACTIVE",
    tenantType: "PLATFORM_ADMIN",
    description: "Internal platform administration tenant for system-wide operations",
    address: {
      street: "1 Tech Hub",
      city: "Nairobi",
      county: "Nairobi",
      postalCode: "00100",
      country: "KE"
    },
    contact: {
      phone: "+254 700 000 000",
      email: "admin@carhireos.com",
      website: "https://platform.carhireos.com"
    },
    branding: {
      primaryColor: "#1e293b",
      secondaryColor: "#64748b",
      logoUrl: "https://assets.carhireos.com/tenants/platform/logo.png",
      fontFamily: "Inter, sans-serif"
    },
    navigation: {
      items: [
        { id: "dashboard", label: "Dashboard", path: "/platform/dashboard", type: "LINK", visible: true },
        { id: "tenants", label: "Tenants", path: "/platform/tenants", type: "LINK", visible: true },
        { id: "users", label: "Users", path: "/platform/users", type: "LINK", visible: true },
        { id: "analytics", label: "Analytics", path: "/platform/analytics", type: "LINK", visible: true },
        { id: "billing", label: "Billing", path: "/platform/billing", type: "LINK", visible: true },
        { id: "settings", label: "Settings", path: "/platform/settings", type: "LINK", visible: true }
      ]
    },
    features: [
      "platform.admin",
      "platform.analytics",
      "platform.billing",
      "platform.users",
      "platform.tenants",
      "platform.settings"
    ],
    limits: {
      maxVehicles: 0,
      maxMembers: 100,
      maxBookingsPerMonth: 10000,
      storageGB: 100,
      apiRequestsPerMinute: 1000
    },
    configuration: {
      timeZone: "Africa/Nairobi",
      dateFormat: "dd/MM/yyyy",
      dateSeparator: "-",
      vehicleStatusOptions: ["AVAILABLE", "ON_RENT", "MAINTENANCE", "UNAVAILABLE"],
      paymentTerms: "NET30",
      lateFeePercentage: 0,
      insuranceRequired: false,
      kycRequired: false,
      twoFactorAuthRequired: true
    },
    platformSettings: {
      allowSelfRegistration: false,
      autoApproveBookings: false,
      requireDriverLicense: false,
      requireInsurance: false,
      taxRate: 0,
      exciseDutyRate: 0
    },
    complianceSettings: {
      kycLevel: "PLATFORM",
      riskScoringRequired: true,
      sanctionScreeningEnabled: true,
      monitoringAlertsEnabled: true
    },
    supportSettings: {
      emailSupport: "techsupport@carhireos.com",
      phoneSupport: "+254 800 999 999",
      businessHours: {
        monday: { start: "08:00", end: "18:00", enabled: true },
        tuesday: { start: "08:00", end: "18:00", enabled: true },
        wednesday: { start: "08:00", end: "18:00", enabled: true },
        thursday: { start: "08:00", end: "18:00", enabled: true },
        friday: { start: "08:00", end: "18:00", enabled: true },
        saturday: { start: "08:00", end: "14:00", enabled: true },
        sunday: { start: "08:00", end: "12:00", enabled: true }
      },
      escalationPath: ["senior_engineer", "engineering_lead", "cto"]
    },
    webhookEndpoints: {
      payments: "https://api.carhireos.com/hooks/payments",
      bookings: "https://api.carhireos.com/hooks/bookings",
      analytics: "https://api.carhireos.com/hooks/analytics"
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false,
    deletedAt: null,
    version: 1
  }
];