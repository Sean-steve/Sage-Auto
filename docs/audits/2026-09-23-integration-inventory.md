# Complete integration inventory

23 September 2026. Runtime Express route enumeration plus static TypeScript client/import/context analysis. See the [prioritized findings and limits](/home/jenny/Downloads/auto-spec-sage/docs/audits/2026-09-23-production-readiness.md).

A route match is a structural match only; it does not certify DTOs, persistence, authorization, response handling or business behavior. A screen binding means a reachable component references the store callback/client method; it is not a browser execution test. “No client” is not automatically a defect: provider callbacks, health probes and delivery URLs need other consumers.

## Counts

| Measure | Count |
| --- | --- |
| backendRegistrations | 495 |
| uniqueBackendEndpoints | 492 |
| clientMethods | 93 |
| matchedClientMethods | 71 |
| unmatchedClientMethods | 22 |
| backendEndpointsWithClient | 74 |

## Every frontend API-client method

| Client and source | Request | Registered match | Reachable screen bindings |
| --- | --- | --- | --- |
| [auth.login](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:166) | POST '/auth/login' | MATCH: /api/v1/auth/login | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:34) |
| [auth.refresh](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:172) | POST '/auth/refresh' | MATCH: /api/v1/auth/refresh | No reachable screen binding found |
| [auth.register](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:174) | POST '/auth/register' | MATCH: /api/v1/auth/register | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:35) |
| [auth.getMe](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:175) | GET '/auth/me' | MATCH: /api/v1/auth/me | No reachable screen binding found |
| [auth.logout](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:177) | POST '/auth/logout' | MATCH: /api/v1/auth/logout | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:36); [Header.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/Header.tsx:46) |
| [auth.getSessions](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:178) | GET '/auth/sessions' | MATCH: /api/v1/auth/sessions | No reachable screen binding found |
| [auth.revokeSession](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:179) | DELETE `/auth/sessions/${sessionId}` | MATCH: /api/v1/auth/sessions/:sessionId | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:41) |
| [auth.revokeAllSessions](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:180) | DELETE '/auth/sessions' | MATCH: /api/v1/auth/sessions | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:42) |
| [auth.forgotPassword](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:181) | POST '/auth/forgot-password' | MATCH: /api/v1/auth/forgot-password | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:37) |
| [auth.resetPassword](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:182) | POST '/auth/reset-password' | MATCH: /api/v1/auth/reset-password | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:38) |
| [auth.verifyEmail](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:183) | POST '/auth/verify-email' | MATCH: /api/v1/auth/verify-email | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:39) |
| [tenancy.listTenants](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:188) | GET '/tenants' | MATCH: /api/v1/tenants | No reachable screen binding found |
| [tenancy.getTenant](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:189) | GET `/tenants/${id}` | MISMATCH — see G07 | No reachable screen binding found |
| [tenancy.switchTenant](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:190) | POST '/switch' | MISMATCH — see G07 | [Header.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/Header.tsx:28); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SaaSControlPlaneView.tsx:56) |
| [tenancy.provisionTenant](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:191) | POST '/provision' | MISMATCH — see G07 | No reachable screen binding found |
| [fleet.listVehicles](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:198) | GET `/fleet/vehicles${q ? `?${q}` : ''}` | MATCH: /api/v1/fleet/vehicles | No reachable screen binding found |
| [fleet.getVehicle](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:200) | GET `/fleet/vehicles/${id}` | MATCH: /api/v1/fleet/vehicles/:id | No reachable screen binding found |
| [fleet.getDigitalTwin](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:201) | GET `/fleet/vehicles/${id}/digital-twin` | MATCH: /api/v1/fleet/vehicles/:id/digital-twin | No reachable screen binding found |
| [fleet.createVehicle](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:202) | POST '/fleet/vehicles' | MATCH: /api/v1/fleet/vehicles | [NewVehicleModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewVehicleModal.tsx:13) |
| [fleet.updateVehicle](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:203) | PATCH `/fleet/vehicles/${id}` | MATCH: /api/v1/fleet/vehicles/:id | [VehicleDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/VehicleDetailsModal.tsx:27) |
| [fleet.deleteVehicle](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:204) | DELETE `/fleet/vehicles/${id}` | MATCH: /api/v1/fleet/vehicles/:id | No reachable screen binding found |
| [fleet.changeLifecycleStatus](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:205) | POST `/fleet/vehicles/${id}/lifecycle-status` | MATCH: /api/v1/fleet/vehicles/:id/lifecycle-status | No reachable screen binding found |
| [fleet.changeAvailabilityStatus](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:206) | POST `/fleet/vehicles/${id}/availability-status` | MATCH: /api/v1/fleet/vehicles/:id/availability-status | No reachable screen binding found |
| [fleet.recordMileage](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:207) | POST `/fleet/vehicles/${id}/mileage` | MATCH: /api/v1/fleet/vehicles/:id/mileage | No reachable screen binding found |
| [fleet.recordFuel](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:208) | POST `/fleet/vehicles/${id}/fuel` | MATCH: /api/v1/fleet/vehicles/:id/fuel | No reachable screen binding found |
| [vehicleOwners.listOwners](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:213) | GET '/vehicle-owners' | MATCH: /api/v1/vehicle-owners | No reachable screen binding found |
| [vehicleOwners.getOwner](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:214) | GET `/vehicle-owners/${id}` | MATCH: /api/v1/vehicle-owners/:id | No reachable screen binding found |
| [vehicleOwners.createOwner](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:215) | POST '/vehicle-owners' | MATCH: /api/v1/vehicle-owners | [NewOwnerModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewOwnerModal.tsx:6) |
| [vehicleOwners.updateOwner](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:216) | PATCH `/vehicle-owners/${id}` | MATCH: /api/v1/vehicle-owners/:id | No reachable screen binding found |
| [vehicleOwners.assignOwnership](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:217) | POST '/vehicle-owners/ownerships/assign' | MATCH: /api/v1/vehicle-owners/ownerships/assign | No reachable screen binding found |
| [vehicleOwners.transferOwnership](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:218) | POST '/vehicle-owners/ownerships/transfer' | MATCH: /api/v1/vehicle-owners/ownerships/transfer | No reachable screen binding found |
| [vehicleOwners.renegotiateTerms](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:219) | POST '/vehicle-owners/ownerships/change-terms' | MATCH: /api/v1/vehicle-owners/ownerships/change-terms | No reachable screen binding found |
| [bookings.listBookings](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:226) | GET `/bookings${q ? `?${q}` : ''}` | MATCH: /api/v1/bookings | No reachable screen binding found |
| [bookings.getBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:228) | GET `/bookings/${id}` | MATCH: /api/v1/bookings/:id | No reachable screen binding found |
| [bookings.createBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:229) | POST '/bookings' | MATCH: /api/v1/bookings | [PublicWebsiteView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PublicWebsiteView.tsx:26); [NewBookingModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewBookingModal.tsx:13) |
| [bookings.confirmBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:230) | POST `/bookings/${id}/confirm` | MATCH: /api/v1/bookings/:id/confirm | [BookingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/BookingsView.tsx:33); [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:38) |
| [bookings.cancelBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:231) | POST `/bookings/${id}/cancel` | MATCH: /api/v1/bookings/:id/cancel | [BookingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/BookingsView.tsx:34); [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:39) |
| [bookings.rescheduleBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:232) | POST `/bookings/${id}/reschedule` | MISMATCH — see G07 | [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:41) |
| [bookings.substituteVehicle](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:234) | POST `/bookings/${id}/substitute` | MISMATCH — see G07 | [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:42) |
| [availability.checkAvailability](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:240) | GET '/availability/check' | MISMATCH — see G07 | No reachable screen binding found |
| [availability.getTimeline](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:241) | GET '/availability/timeline' | MISMATCH — see G07 | No reachable screen binding found |
| [rentals.listRentals](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:246) | GET '/rentals' | MATCH: /api/v1/rentals | No reachable screen binding found |
| [rentals.getRental](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:247) | GET `/rentals/${id}` | MATCH: /api/v1/rentals/:id | No reachable screen binding found |
| [rentals.startRental](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:248) | POST '/rentals/start' | MATCH: /api/v1/rentals/start | [BookingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/BookingsView.tsx:36); [RentalsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/RentalsView.tsx:28); [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:43) |
| [rentals.extendRental](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:249) | POST `/rentals/${id}/extend` | MISMATCH — see G07 | [RentalsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/RentalsView.tsx:30) |
| [rentals.completeRental](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:250) | POST `/rentals/${id}/complete` | MATCH: /api/v1/rentals/:id/complete | [RentalsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/RentalsView.tsx:29) |
| [rentals.recordIncident](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:251) | POST `/rentals/${id}/incidents` | MISMATCH — see G07 | [RentalsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/RentalsView.tsx:31) |
| [inspections.listInspections](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:256) | GET '/inspections' | MATCH: /api/v1/inspections | No reachable screen binding found |
| [inspections.createInspection](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:257) | POST '/inspections' | MATCH: /api/v1/inspections | [InspectionModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/InspectionModal.tsx:41) |
| [inspections.getInspection](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:258) | GET `/inspections/${id}` | MATCH: /api/v1/inspections/:id | No reachable screen binding found |
| [customers.listCustomers](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:263) | GET '/customers' | MATCH: /api/v1/customers | No reachable screen binding found |
| [customers.getCustomer](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:264) | GET `/customers/${id}` | MATCH: /api/v1/customers/:id | No reachable screen binding found |
| [customers.createCustomer](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:265) | POST '/customers' | MATCH: /api/v1/customers | [NewCustomerModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewCustomerModal.tsx:6) |
| [customers.updateCustomer](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:266) | PATCH `/customers/${id}` | MISMATCH — see G07 | No reachable screen binding found |
| [customers.verifyCustomer](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:267) | POST `/customers/${id}/verify` | MISMATCH — see G07 | No reachable screen binding found |
| [customers.blockCustomer](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:268) | POST `/customers/${id}/block` | MISMATCH — see G07 | No reachable screen binding found |
| [pricing.getRatePlans](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:273) | GET '/pricing/rate-plans' | MATCH: /api/v1/pricing/rate-plans | No reachable screen binding found |
| [pricing.createRatePlan](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:274) | POST '/pricing/rate-plans' | MATCH: /api/v1/pricing/rate-plans | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:60) |
| [pricing.calculateQuote](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:275) | POST '/pricing/quote' | MISMATCH — see G07 | No reachable screen binding found |
| [pricing.getPromoCodes](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:276) | GET '/pricing/promo-codes' | MATCH: /api/v1/pricing/promo-codes | No reachable screen binding found |
| [pricing.createPromoCode](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:277) | POST '/pricing/promo-codes' | MATCH: /api/v1/pricing/promo-codes | No reachable screen binding found |
| [finance.getInvoices](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:282) | GET '/finance/invoices' | MISMATCH — see G07 | No reachable screen binding found |
| [finance.getExpenses](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:283) | GET '/finance/expenses' | MISMATCH — see G07 | No reachable screen binding found |
| [finance.createExpense](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:284) | POST '/finance/expenses' | MATCH: /api/v1/finance/expenses | [FinanceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/FinanceView.tsx:30) |
| [finance.recordPayment](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:285) | POST '/finance/payments' | MISMATCH — see G07 | [FinanceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/FinanceView.tsx:29) |
| [finance.getLedgerAccounts](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:286) | GET '/ledger/accounts' | MATCH: /api/v1/ledger/accounts | No reachable screen binding found |
| [finance.getLedgerTransactions](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:287) | GET '/ledger/transactions' | MISMATCH — see G07 | No reachable screen binding found |
| [ownerSettlements.listSettlements](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:292) | GET '/owner-settlements' | MATCH: /api/v1/owner-settlements | No reachable screen binding found |
| [ownerSettlements.calculateSettlement](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:293) | POST '/owner-settlements/calculate' | MATCH: /api/v1/owner-settlements/calculate | [SettlementsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SettlementsView.tsx:23); [VehicleOwnersView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/VehicleOwnersView.tsx:28) |
| [ownerSettlements.approveSettlement](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:294) | POST `/owner-settlements/${id}/approve` | MATCH: /api/v1/owner-settlements/:id/approve | [SettlementsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SettlementsView.tsx:24) |
| [ownerSettlements.paySettlement](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:295) | POST `/owner-settlements/${id}/pay` | MISMATCH — see G07 | [SettlementsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SettlementsView.tsx:25) |
| [payments.stkPush](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:301) | POST '/payments/attempts' | MATCH: /api/v1/payments/attempts | [MpesaModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MpesaModal.tsx:13) |
| [payments.getAttempts](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:308) | GET '/payments/attempts' | MATCH: /api/v1/payments/attempts | No reachable screen binding found |
| [maintenance.listWorkOrders](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:313) | GET '/maintenance/work-orders' | MATCH: /api/v1/maintenance/work-orders | No reachable screen binding found |
| [maintenance.createWorkOrder](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:314) | POST '/maintenance/work-orders' | MATCH: /api/v1/maintenance/work-orders | [MaintenanceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/MaintenanceView.tsx:40); [NewWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewWorkOrderModal.tsx:14) |
| [maintenance.updateWorkOrder](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:328) | POST `/maintenance/work-orders/${id}/${action}` | MATCH: /api/v1/maintenance/work-orders/:id/schedule; /api/v1/maintenance/work-orders/:id/start; /api/v1/maintenance/work-orders/:id/complete | [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:38); [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:39); [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:44) |
| [maintenance.listSchedules](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:330) | GET '/maintenance/schedules' | MATCH: /api/v1/maintenance/schedules | No reachable screen binding found |
| [maintenance.createSchedule](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:331) | POST '/maintenance/schedules' | MATCH: /api/v1/maintenance/schedules | No reachable screen binding found |
| [maintenance.listProviders](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:332) | GET '/maintenance/providers' | MATCH: /api/v1/maintenance/providers | No reachable screen binding found |
| [maintenance.createProvider](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:333) | POST '/maintenance/providers' | MATCH: /api/v1/maintenance/providers | No reachable screen binding found |
| [compliance.listDocuments](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:338) | GET '/compliance/documents' | MISMATCH — see G07 | No reachable screen binding found |
| [compliance.addDocument](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:339) | POST '/compliance/documents' | MISMATCH — see G07 | [ComplianceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/ComplianceView.tsx:24) |
| [compliance.overrideHold](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:340) | POST `/compliance/documents/${id}/override-hold` | MISMATCH — see G07 | [ComplianceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/ComplianceView.tsx:25) |
| [analytics.getDashboard](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:347) | GET `/analytics/dashboard${q ? `?${q}` : ''}` | MATCH: /api/v1/analytics/dashboard | [DashboardView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/DashboardView.tsx:81) |
| [analytics.getReportCatalogue](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:349) | GET '/reports/catalogue' | MATCH: /api/v1/reports/catalogue | [ReportsHubModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/analytics/ReportsHubModal.tsx:81) |
| [analytics.getReportExecutions](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:350) | GET '/reports/executions' | MATCH: /api/v1/reports/executions | [ReportsHubModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/analytics/ReportsHubModal.tsx:96) |
| [analytics.queryReport](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:353) | GET `/reports/query/${reportKey}${q ? `?${q}` : ''}` | MATCH: /api/v1/reports/query/:key | [ReportsHubModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/analytics/ReportsHubModal.tsx:122) |
| [analytics.exportReport](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:356) | POST `/reports/export/${reportKey}` | MATCH: /api/v1/reports/export/:key | [ReportsHubModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/analytics/ReportsHubModal.tsx:168) |
| [platform.getAnalyticsOverview](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:361) | GET '/platform/analytics/overview' | MATCH: /api/v1/platform/analytics/overview | No reachable screen binding found |
| [platform.getMrrMovements](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:362) | GET '/platform/analytics/mrr-movements' | MATCH: /api/v1/platform/analytics/mrr-movements | No reachable screen binding found |
| [platform.listTenants](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:363) | GET '/platform/tenants' | MATCH: /api/v1/platform/tenants | No reachable screen binding found |
| [platform.toggleTenantSuspension](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:365) | POST `/platform/tenants/${tenantId}/${shouldSuspend ? 'suspend' : 'reactivate'}` | MATCH: /api/v1/platform/tenants/:id/suspend; /api/v1/platform/tenants/:id/reactivate | No reachable screen binding found |
| [platform.changeTenantPlan](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:368) | POST `/platform/tenants/${tenantId}/change-plan` | MISMATCH — see G07 | [WorkspaceSettingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/WorkspaceSettingsView.tsx:35) |

## Every mounted backend endpoint

495 registrations collapse to 492 exact method/path pairs. Multiple registrations are noted; endpoint order and broad middleware can still prevent the intended handler from running (G06). Backend-only endpoints must be classified as a launch UI requirement, external/operational consumer, or explicitly deferred capability.

### agents

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/agents | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/agents/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/agents | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/agents/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### analytics

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/analytics/dashboard | analytics.getDashboard | DashboardView.tsx |
| GET /api/v1/analytics/metrics | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/analytics/metrics/:key | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/analytics/metrics/batch | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/analytics/reconciliation | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/analytics/backfill | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### auth

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/auth/register | auth.register | AuthModal.tsx |
| POST /api/v1/auth/login | auth.login | AuthModal.tsx |
| POST /api/v1/auth/refresh | auth.refresh | Wrapper exists; no reachable screen binding found |
| POST /api/v1/auth/logout | auth.logout | AuthModal.tsx; Header.tsx |
| GET /api/v1/auth/me | auth.getMe | Wrapper exists; no reachable screen binding found |
| GET /api/v1/auth/sessions | auth.getSessions | Wrapper exists; no reachable screen binding found |
| DELETE /api/v1/auth/sessions/:sessionId | auth.revokeSession | AuthModal.tsx |
| DELETE /api/v1/auth/sessions | auth.revokeAllSessions | AuthModal.tsx |
| POST /api/v1/auth/forgot-password | auth.forgotPassword | AuthModal.tsx |
| POST /api/v1/auth/reset-password | auth.resetPassword | AuthModal.tsx |
| POST /api/v1/auth/verify-email | auth.verifyEmail | AuthModal.tsx |
| POST /api/v1/auth/resend-verification | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### authorization

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/authorization/me | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### availability

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/availability/check | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/availability/search | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/availability/allocations | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/availability/allocations/:id/release | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/availability/allocations/:id/substitute | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/availability/holds | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/availability/holds/confirm | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/availability/holds/:idOrToken/release | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/availability/blocks | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/availability/blocks/:id/release | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/availability/calendar/:vehicleId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### billing

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/billing/invoices | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/billing/invoices/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/billing/invoices/:id/pay-mock | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/billing/payments | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### bookings

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/bookings/quote | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/bookings | bookings.createBooking | NewBookingModal.tsx; PublicWebsiteView.tsx |
| GET /api/v1/bookings | bookings.listBookings | Wrapper exists; no reachable screen binding found |
| GET /api/v1/bookings/:id | bookings.getBooking | Wrapper exists; no reachable screen binding found |
| PATCH /api/v1/bookings/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/bookings/:id/quote | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/bookings/:id/request-payment | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/bookings/:id/confirm | bookings.confirmBooking | BookingDetailsModal.tsx; BookingsView.tsx |
| POST /api/v1/bookings/:id/cancel | bookings.cancelBooking | BookingDetailsModal.tsx; BookingsView.tsx |
| POST /api/v1/bookings/:id/reject | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/bookings/:id/expire | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/bookings/:id/no-show | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/bookings/:id/substitute-vehicle | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/bookings/:id/amend-dates | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/bookings/:id/simulate-payment | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/bookings/:id/handover-readiness | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### compliance

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/compliance/summary | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/compliance/readiness/vehicle/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/compliance/readiness/driver/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/compliance/readiness/rental-start | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/compliance/requirements | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/compliance/requirements | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/compliance/requirements/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/compliance/records | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/compliance/records | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/compliance/records/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/compliance/records/:id/history | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/compliance/records/:id/verify | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/compliance/records/:id/reject | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/compliance/records/:id/revoke | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/compliance/records/:id/renew | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/compliance/issues | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/compliance/issues/:id/resolve | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/compliance/overrides | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/compliance/overrides | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/compliance/overrides/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/compliance/evaluate-sweep | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### contracts

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/contracts/generate | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/contracts/:id/sign | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/contracts/:id/send | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/contracts/:id/amend | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/contracts/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/contracts | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### corporate-accounts

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/corporate-accounts | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/corporate-accounts/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/corporate-accounts | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/corporate-accounts/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/corporate-accounts/:id/authorized-drivers | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/corporate-accounts/:id/authorized-drivers/:authId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### crm

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/crm/leads | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/leads | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/crm/leads/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/crm/leads/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/crm/leads/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/leads/:id/assign | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/leads/:id/stage | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/leads/:id/qualify | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/leads/:id/lost | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/leads/:id/convert | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/crm/quotes | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/quotes | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/crm/quotes/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/quotes/:id/versions | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/quotes/:id/send | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/quotes/:id/accept | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/quotes/:id/convert-to-booking | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/crm/pipeline/stages | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/crm/pipeline/summary | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/crm/tasks | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/tasks | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/tasks/:id/complete | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/crm/activities | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/crm/activities | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### customers

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/customers | customers.listCustomers | Wrapper exists; no reachable screen binding found |
| GET /api/v1/customers/:id | customers.getCustomer | Wrapper exists; no reachable screen binding found |
| POST /api/v1/customers | customers.createCustomer | NewCustomerModal.tsx |
| PUT /api/v1/customers/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/customers/:id/status | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/customers/:id/verify | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### documents

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/documents | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/documents | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/documents/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/documents/:id/versions | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/documents/:id/archive | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/documents/resource/:resourceType/:resourceId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### drivers

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/drivers | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/drivers/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/drivers | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/drivers/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/drivers/:id/status | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/drivers/:id/verify | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### entitlements

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/entitlements/effective | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/entitlements/check/:featureKey | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/entitlements/reserve | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/entitlements/usage | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### files

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/files/public/:fileId | No domain API-client wrapper | Public resource delivery URL; blocked by broad auth middleware (G06) |
| POST /api/v1/files/upload-intent | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/files/finalize-upload | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/files/cancel-upload | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/files/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/files/:id/download-url | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/files/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/files/resource/:resourceType/:resourceId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/files/reconciliation | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### finance

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/finance/invoices | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/invoices/generate-from-rental | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/invoices/:id/issue | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/invoices/:id/void | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/invoices/:id/payments | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/credit-notes | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/credit-notes/:id/issue | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/credit-notes/:id/void | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/expenses | finance.createExpense | FinanceView.tsx |
| POST /api/v1/finance/expenses/:id/submit | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/expenses/:id/approve | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/expenses/:id/reject | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/expenses/:id/void | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/expenses/ingest-maintenance | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/deposits | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/deposits/:id/apply | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/refunds | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/finance/refunds/:id/approve | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/finance/receivables/customers/:customerId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/finance/receivables/corporate/:corporateAccountId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/finance/summary | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/finance/settlement-components/rentals/:rentalId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/finance/settlement-components/vehicles/:vehicleId/expenses | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### fleet

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/fleet/vehicles | fleet.listVehicles | Wrapper exists; no reachable screen binding found |
| POST /api/v1/fleet/vehicles | fleet.createVehicle | NewVehicleModal.tsx |
| GET /api/v1/fleet/vehicles/:id | fleet.getVehicle | Wrapper exists; no reachable screen binding found |
| GET /api/v1/fleet/vehicles/:id/digital-twin | fleet.getDigitalTwin | Wrapper exists; no reachable screen binding found |
| PATCH /api/v1/fleet/vehicles/:id | fleet.updateVehicle | VehicleDetailsModal.tsx |
| POST /api/v1/fleet/vehicles/:id/lifecycle-status | fleet.changeLifecycleStatus | Wrapper exists; no reachable screen binding found |
| POST /api/v1/fleet/vehicles/:id/availability-status | fleet.changeAvailabilityStatus | Wrapper exists; no reachable screen binding found |
| POST /api/v1/fleet/vehicles/:id/mileage | fleet.recordMileage | Wrapper exists; no reachable screen binding found |
| POST /api/v1/fleet/vehicles/:id/fuel | fleet.recordFuel | Wrapper exists; no reachable screen binding found |
| GET /api/v1/fleet/vehicles/:id/documents | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/fleet/vehicles/:id/documents | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/fleet/categories | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/fleet/vehicles/:id | fleet.deleteVehicle | Wrapper exists; no reachable screen binding found |

### handovers

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/handovers/schedule | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/handovers/:id/arrive | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/handovers/:id/verify-documents | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/handovers/:id/inspection | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/handovers/:id/confirm-signature | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/handovers/:id/handover-keys | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/handovers/:id/complete | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/handovers/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/handovers | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### health-and-operations

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/health | No domain API-client wrapper | Operational endpoint; no screen required by itself |
| GET /api/health/live | No domain API-client wrapper | Operational endpoint; no screen required by itself |
| GET /api/health/ready | No domain API-client wrapper | Operational endpoint; no screen required by itself |
| GET /api/metrics | No domain API-client wrapper | Operational endpoint; no screen required by itself |
| GET /api/metadata | No domain API-client wrapper | Operational endpoint; no screen required by itself |

### inspections

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/inspections/templates | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/inspections/templates/:idOrCode | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/inspections/templates | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/inspections | inspections.listInspections | Wrapper exists; no reachable screen binding found |
| POST /api/v1/inspections | inspections.createInspection | InspectionModal.tsx |
| GET /api/v1/inspections/:id | inspections.getInspection | Wrapper exists; no reachable screen binding found |
| POST /api/v1/inspections/:id/start | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/inspections/:id/responses | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/inspections/:id/damages | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/inspections/:id/evidence | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/inspections/:id/signatures | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/inspections/:id/readiness | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/inspections/:id/complete | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/inspections/:id/void | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/inspections/:id/correct | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/inspections/compare | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/inspections/rentals/:rentalId/comparison | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/inspections/damage-cases/list | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/inspections/damage-cases/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/inspections/damage-cases | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/inspections/damage-cases/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### ledger

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/ledger/accounts | finance.getLedgerAccounts | Wrapper exists; no reachable screen binding found |
| POST /api/v1/ledger/accounts | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/ledger/accounts/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/ledger/accounts/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/ledger/journals | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/ledger/journals | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/ledger/post-source | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/ledger/journals/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/ledger/journals/:id/reverse | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/ledger/trial-balance | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/ledger/statements/:accountId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### maintenance

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/maintenance/work-orders | maintenance.listWorkOrders | Wrapper exists; no reachable screen binding found |
| POST /api/v1/maintenance/work-orders | maintenance.createWorkOrder | MaintenanceView.tsx; NewWorkOrderModal.tsx |
| GET /api/v1/maintenance/work-orders/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/maintenance/work-orders/:id/schedule | maintenance.updateWorkOrder | MaintenanceWorkOrderModal.tsx |
| POST /api/v1/maintenance/work-orders/:id/start | maintenance.updateWorkOrder | MaintenanceWorkOrderModal.tsx |
| POST /api/v1/maintenance/work-orders/:id/tasks | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/maintenance/work-orders/:id/tasks/:taskId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/maintenance/work-orders/:id/parts | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/maintenance/work-orders/:id/costs | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/maintenance/work-orders/:id/evidence | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/maintenance/work-orders/:id/complete | maintenance.updateWorkOrder | MaintenanceWorkOrderModal.tsx |
| POST /api/v1/maintenance/work-orders/:id/verify | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/maintenance/work-orders/:id/cancel | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/maintenance/schedules | maintenance.listSchedules | Wrapper exists; no reachable screen binding found |
| POST /api/v1/maintenance/schedules | maintenance.createSchedule | Wrapper exists; no reachable screen binding found |
| GET /api/v1/maintenance/schedules/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/maintenance/schedules/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/maintenance/due-evaluations | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/maintenance/providers | maintenance.listProviders | Wrapper exists; no reachable screen binding found |
| POST /api/v1/maintenance/providers | maintenance.createProvider | Wrapper exists; no reachable screen binding found |
| GET /api/v1/maintenance/providers/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/maintenance/providers/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### media

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/media/public/:id | No domain API-client wrapper | Public resource delivery URL; blocked by broad auth middleware (G06); 2 registrations |
| POST /api/v1/media/process | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/media/assets/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/media/assets/:id/responsive | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/media/derivatives/:id/download-url | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/media/regenerate | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/media/reconcile | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/media/profiles | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### memberships

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/memberships/:membershipId/roles | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/memberships/:membershipId/roles/:roleId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### notifications

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/notifications/webhooks/:provider | No domain API-client wrapper | Provider callback; public routing blocked in assembled app (G06); 2 registrations |
| POST /api/v1/notifications/send | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/notifications | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/notifications/stats | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/notifications/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/notifications/:id/receipts | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/notifications/:id/retry | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/notifications/templates/all | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/notifications/templates | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/notifications/templates/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/notifications/preferences/:partyId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/notifications/preferences/:partyId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/notifications/suppressions/all | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/notifications/suppressions | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/notifications/suppressions/:channel/:recipient | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### owner-settlements

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/owner-settlements/periods | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/owner-settlements/periods | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/owner-settlements/periods/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/owner-settlements/periods/:id/close | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/owner-settlements/batches | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/owner-settlements/batches | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/owner-settlements | ownerSettlements.listSettlements | Wrapper exists; no reachable screen binding found |
| POST /api/v1/owner-settlements/calculate | ownerSettlements.calculateSettlement | SettlementsView.tsx; VehicleOwnersView.tsx |
| GET /api/v1/owner-settlements/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/owner-settlements/:id/statement | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/owner-settlements/:id/approve | ownerSettlements.approveSettlement | SettlementsView.tsx |
| POST /api/v1/owner-settlements/:id/dispute | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/owner-settlements/:id/resolve-dispute | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/owner-settlements/:id/adjustments | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/owner-settlements/:id/payout | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/owner-settlements/payables/list | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/owner-settlements/reports/profitability | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### payments

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/payments/webhooks/:provider | No domain API-client wrapper | Provider callback; public routing blocked in assembled app (G06); 2 registrations |
| POST /api/v1/payments/attempts | payments.stkPush | MpesaModal.tsx |
| GET /api/v1/payments/attempts | payments.getAttempts | Wrapper exists; no reachable screen binding found |
| GET /api/v1/payments/attempts/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/payments/attempts/:id/verify | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/payments/manual | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/payments | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/payments/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/payments/:id/allocate | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/payments/:id/allocations | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/payments/refunds | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/payments/refunds/:id/approve-and-execute | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/payments/refunds | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/payments/payouts/owner-settlement | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/payments/reconciliation/scan | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/payments/reconciliation/issues | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/payments/reconciliation/issues/:id/resolve | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/payments/mpesa/callback | No domain API-client wrapper | Provider callback; public routing blocked in assembled app (G06) |
| POST /api/v1/payments/mpesa/c2b/validation | No domain API-client wrapper | Provider callback; public routing blocked in assembled app (G06) |
| POST /api/v1/payments/mpesa/c2b/confirmation | No domain API-client wrapper | Provider callback; public routing blocked in assembled app (G06) |

### permissions

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/permissions | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### platform

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/platform/roles | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/support/sessions | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/support/sessions | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/support/sessions/:id/end | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/staff | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/staff | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/platform/staff/:id/roles | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/platform/staff/:id/roles/:role | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/metrics/overview | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/subscriptions | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/subscriptions/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/subscriptions/:id/history | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/subscriptions/:id/transition | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/subscriptions/:id/suspend | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/subscriptions/:id/reactivate | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/plans | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/plans | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/platform/plans/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/plans/:id/archive | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/billing/invoices | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/billing/invoices/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/billing/invoices | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/billing/invoices/:id/record-payment | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/billing/payments | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/billing/jobs/run-renewals | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/features | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/features | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/platform/features/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/plans/:planId/features | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/platform/plans/:planId/features | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/tenants/:tenantId/overrides | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/platform/overrides/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/restrictions | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/platform/restrictions/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/analytics/overview | platform.getAnalyticsOverview | Wrapper exists; no reachable screen binding found |
| GET /api/v1/platform/analytics/metrics | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/analytics/metrics/:key | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/analytics/mrr-movements | platform.getMrrMovements | Wrapper exists; no reachable screen binding found |
| GET /api/v1/platform/analytics/cohorts | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/analytics/plans | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/analytics/billing-health | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/analytics/reports | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/analytics/reports/execute | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/analytics/reports/export | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/analytics/reconcile | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/analytics/backfill | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/tenants | platform.listTenants | Wrapper exists; no reachable screen binding found |
| GET /api/v1/platform/tenants/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/tenants/provision | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/tenants/:id/suspend | platform.toggleTenantSuspension | Wrapper exists; no reachable screen binding found |
| POST /api/v1/platform/tenants/:id/reactivate | platform.toggleTenantSuspension | Wrapper exists; no reachable screen binding found |
| POST /api/v1/platform/tenants/:id/offboard | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/operations/providers | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/operations/jobs/queues | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/operations/jobs/dlq | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/platform/operations/jobs/dlq/:id/retry | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/operations/domains | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/operations/audit | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/operations/config | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/platform/operations/config | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/platform/operations/reports/export | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### pricing

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/pricing/rate-plans | pricing.getRatePlans | Wrapper exists; no reachable screen binding found |
| POST /api/v1/pricing/rate-plans | pricing.createRatePlan | PricingView.tsx |
| GET /api/v1/pricing/rate-plans/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/pricing/rate-plans/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/pricing/rate-plans/:id/activate | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/pricing/rate-plans/:id/archive | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/pricing/rate-plans/:id/rates | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/pricing/rate-plans/:id/rates | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/pricing/rate-plans/:id/assignments | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/pricing/rate-plans/:id/assignments | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/pricing/rate-plans/:id/seasonal-rules | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/pricing/rate-plans/:id/seasonal-rules | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/pricing/rate-plans/:id/duration-tiers | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/pricing/rate-plans/:id/duration-tiers | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/pricing/fees | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/pricing/fees | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/pricing/promo-codes | pricing.getPromoCodes | Wrapper exists; no reachable screen binding found |
| POST /api/v1/pricing/promo-codes | pricing.createPromoCode | Wrapper exists; no reachable screen binding found |
| POST /api/v1/pricing/calculate | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### public

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/public/website/resolve | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/website/pages/:slug(*) | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/website/catalogue | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/website/sitemap.xml | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/website/robots.txt | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/domains/resolve | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/domains/health | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/booking/vehicles | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/booking/vehicles/:id | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/booking/availability | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| POST /api/v1/public/booking/quote | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| POST /api/v1/public/booking/checkout | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/booking/status/:bookingId | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| POST /api/v1/public/booking/verify-payment/:attemptId | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| POST /api/v1/public/crm/enquiries | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| GET /api/v1/public/crm/quotes/:token | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| POST /api/v1/public/crm/quotes/:token/accept | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |
| POST /api/v1/public/crm/quotes/:token/reject | No domain API-client wrapper | Public application/backend surface; no current domain-client integration (G06/G10) |

### rentals

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/rentals/readiness/:bookingId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/rentals/start | rentals.startRental | BookingDetailsModal.tsx; BookingsView.tsx; RentalsView.tsx |
| GET /api/v1/rentals/:id | rentals.getRental | Wrapper exists; no reachable screen binding found |
| GET /api/v1/rentals/:id/start-snapshot | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/rentals | rentals.listRentals | Wrapper exists; no reachable screen binding found |
| POST /api/v1/rentals/:id/extensions | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/rentals/:id/extensions/:extensionId/approve | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/rentals/:id/extensions/:extensionId/reject | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/rentals/:id/extensions | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/rentals/:id/return-schedule | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/rentals/:id/receive | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/rentals/:id/return-inspection | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/rentals/:id/return-record | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/rentals/:id/calculate-final | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/rentals/:id/final-calculation | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/rentals/:id/deposit-settlement | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/rentals/:id/complete | rentals.completeRental | RentalsView.tsx |

### reports

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/reports/catalogue | analytics.getReportCatalogue | ReportsHubModal.tsx |
| GET /api/v1/reports/catalogue/:key | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/reports/query/:key | analytics.queryReport | ReportsHubModal.tsx |
| POST /api/v1/reports/export/:key | analytics.exportReport | ReportsHubModal.tsx |
| GET /api/v1/reports/executions | analytics.getReportExecutions | ReportsHubModal.tsx |
| GET /api/v1/reports/executions/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/reports/executions/:id/download | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/reports/saved | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/reports/saved | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/reports/saved/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/reports/schedules | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/reports/schedules | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/reports/schedules/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### roles

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/roles | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/roles/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/roles | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/roles/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/roles/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### subscription

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/subscription | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/subscription/access-context | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/subscription/plans | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/subscription/history | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/subscription/change-plan | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/subscription/cancel | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### tenant

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/tenant/context | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/tenant/details | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PATCH /api/v1/tenant/settings | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/tenant/domains | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/tenant/domains | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/tenant/domains/:domainId/verify | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/tenant/domains/:domainId/set-primary | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/tenant/domains/:domainId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### tenants

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/tenants | tenancy.listTenants | Wrapper exists; no reachable screen binding found |
| POST /api/v1/tenants | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### vehicle-owners

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/vehicle-owners | vehicleOwners.listOwners | Wrapper exists; no reachable screen binding found |
| POST /api/v1/vehicle-owners | vehicleOwners.createOwner | NewOwnerModal.tsx |
| GET /api/v1/vehicle-owners/:id | vehicleOwners.getOwner | Wrapper exists; no reachable screen binding found |
| PATCH /api/v1/vehicle-owners/:id | vehicleOwners.updateOwner | Wrapper exists; no reachable screen binding found |
| GET /api/v1/vehicle-owners/:id/vehicles | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/vehicle-owners/:id | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/vehicle-owners/ownerships/assign | vehicleOwners.assignOwnership | Wrapper exists; no reachable screen binding found |
| POST /api/v1/vehicle-owners/ownerships/transfer | vehicleOwners.transferOwnership | Wrapper exists; no reachable screen binding found |
| POST /api/v1/vehicle-owners/ownerships/change-terms | vehicleOwners.renegotiateTerms | Wrapper exists; no reachable screen binding found |
| GET /api/v1/vehicle-owners/ownerships/vehicle/:vehicleId/history | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### vehicles

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| POST /api/v1/vehicles/:vehicleId/media | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/vehicles/:vehicleId/media | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/vehicles/:vehicleId/media/primary | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/vehicles/:vehicleId/media/:mediaAssetId/primary | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/vehicles/:vehicleId/media/reorder | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/vehicles/:vehicleId/media/:mediaAssetId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

### website

| HTTP endpoint | Client methods | Consumer evidence |
| --- | --- | --- |
| GET /api/v1/website | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/website/init | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/website/branding | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/website/navigation | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/website/pages | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/website/pages | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/website/pages/:pageId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| PUT /api/v1/website/pages/:pageId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/website/pages/:pageId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/website/publish | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/website/unpublish | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/website/maintenance | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/website/rollback | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/website/snapshots | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| GET /api/v1/website/domains | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/website/domains | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| POST /api/v1/website/domains/:domainId/verify | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |
| DELETE /api/v1/website/domains/:domainId | No domain API-client wrapper | Backend capability not represented in domain API client; review launch UI scope |

## Every store callback and its screen consumers

This includes UI helpers and calculated state, not only business mutations. “No direct API call” may be appropriate for a helper; the report identifies the business actions where this is a persistence/integration gap. Delegating to another callback can create an indirect dependency.

| Store callback | Direct API-client calls | Component references |
| --- | --- | --- |
| [showNotification](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:450) | No direct API call | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:43); [CreateTenantModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/CreateTenantModal.tsx:16); [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:73); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SaaSControlPlaneView.tsx:65); [WorkspaceSettingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/WorkspaceSettingsView.tsx:37) |
| [emitDomainFact](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:711) | No direct API call | No direct component context binding found |
| [checkEntitlement](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:776) | No direct API call | [FleetView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/FleetView.tsx:32); [NewVehicleModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewVehicleModal.tsx:14); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/apps/platform-admin/src/SaaSControlPlaneView.tsx:31) (not in active entrypoint); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SaaSControlPlaneView.tsx:59) |
| [canUseCapability](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1008) | No direct API call | No direct component context binding found |
| [createEntitlementOverride](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1015) | No direct API call | No direct component context binding found |
| [revokeEntitlementOverride](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1043) | No direct API call | No direct component context binding found |
| [createEntitlementRestriction](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1053) | No direct API call | No direct component context binding found |
| [liftEntitlementRestriction](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1078) | No direct API call | No direct component context binding found |
| [evaluateSubscriptionAccess](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1211) | No direct API call | [PublicWebsiteView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PublicWebsiteView.tsx:28) |
| [checkVehicleAvailability](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1359) | No direct API call | [NewBookingModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewBookingModal.tsx:14) |
| [addVehicle](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1448) | fleet.createVehicle | [NewVehicleModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewVehicleModal.tsx:13) |
| [updateVehicle](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1506) | fleet.updateVehicle | [VehicleDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/VehicleDetailsModal.tsx:27) |
| [deleteVehicle](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1519) | fleet.deleteVehicle | No direct component context binding found |
| [addVehicleOwner](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1530) | vehicleOwners.createOwner | [NewOwnerModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewOwnerModal.tsx:6) |
| [attachVehicleOwnership](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1548) | vehicleOwners.assignOwnership | No direct component context binding found |
| [addCustomer](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1577) | customers.createCustomer | [NewCustomerModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewCustomerModal.tsx:6) |
| [updateCustomer](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1606) | No direct API call | [CustomersView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/CustomersView.tsx:28) |
| [addDriver](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1617) | No direct API call | No direct component context binding found |
| [createBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1644) | bookings.createBooking | [NewBookingModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewBookingModal.tsx:13); [PublicBookingExperience.tsx](/home/jenny/Downloads/auto-spec-sage/apps/public-web/src/PublicBookingExperience.tsx:7) (not in active entrypoint); [PublicWebsiteView.tsx](/home/jenny/Downloads/auto-spec-sage/apps/public-web/src/PublicWebsiteView.tsx:26) (not in active entrypoint); [PublicWebsiteView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PublicWebsiteView.tsx:26) |
| [confirmBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1710) | bookings.confirmBooking | [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:38); [BookingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/BookingsView.tsx:33) |
| [cancelBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1759) | bookings.cancelBooking | [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:39); [BookingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/BookingsView.tsx:34) |
| [rejectBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1801) | No direct API call | [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:40); [BookingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/BookingsView.tsx:35) |
| [rescheduleBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1835) | bookings.rescheduleBooking | [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:41) |
| [substituteVehicle](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1869) | bookings.substituteVehicle | [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:42) |
| [createRentalFromBooking](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1926) | rentals.startRental | [BookingDetailsModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/BookingDetailsModal.tsx:43); [BookingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/BookingsView.tsx:36) |
| [startRental](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1976) | rentals.startRental | [RentalsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/RentalsView.tsx:28) |
| [extendRental](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2009) | rentals.extendRental | [RentalsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/RentalsView.tsx:30) |
| [completeRental](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2076) | rentals.completeRental | [RentalsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/RentalsView.tsx:29) |
| [recordRentalIncident](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2126) | rentals.recordIncident | [RentalsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/RentalsView.tsx:31) |
| [saveInspection](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2146) | inspections.createInspection | [InspectionModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/InspectionModal.tsx:41) |
| [createMaintenanceRequest](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2205) | maintenance.createWorkOrder | [MaintenanceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/MaintenanceView.tsx:40); [NewWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewWorkOrderModal.tsx:14) |
| [scheduleMaintenanceWorkOrder](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2296) | maintenance.updateWorkOrder | [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:38) |
| [startMaintenanceWorkOrder](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2355) | maintenance.updateWorkOrder | [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:39) |
| [addMaintenanceTask](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2420) | No direct API call | [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:40) |
| [updateMaintenanceTask](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2456) | No direct API call | [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:41) |
| [addMaintenancePart](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2490) | No direct API call | [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:42) |
| [recordMaintenanceCost](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2531) | No direct API call | [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:43) |
| [completeMaintenanceWorkOrder](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2569) | maintenance.updateWorkOrder | [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:44) |
| [verifyMaintenanceWorkOrder](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2661) | No direct API call | [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:45) |
| [cancelMaintenanceWorkOrder](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2734) | No direct API call | [MaintenanceWorkOrderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MaintenanceWorkOrderModal.tsx:46) |
| [createMaintenanceSchedule](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2791) | No direct API call | [NewScheduleModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewScheduleModal.tsx:12) |
| [updateMaintenanceSchedule](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2837) | No direct API call | No direct component context binding found |
| [createServiceProvider](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2861) | No direct API call | [NewProviderModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/NewProviderModal.tsx:11) |
| [updateServiceProvider](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2892) | No direct API call | No direct component context binding found |
| [evaluateMaintenanceDue](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2916) | No direct API call | [MaintenanceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/MaintenanceView.tsx:41) |
| [scheduleMaintenance](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:2997) | No direct API call | No direct component context binding found |
| [updateMaintenanceStatus](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3020) | No direct API call | No direct component context binding found |
| [addComplianceDocument](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3051) | compliance.addDocument | [ComplianceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/ComplianceView.tsx:24) |
| [overrideComplianceHold](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3067) | compliance.overrideHold | [ComplianceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/ComplianceView.tsx:25) |
| [recordPayment](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3093) | finance.recordPayment | [FinanceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/FinanceView.tsx:29) |
| [addExpense](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3132) | finance.createExpense | [FinanceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/FinanceView.tsx:30) |
| [calculateOwnerSettlement](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3150) | ownerSettlements.calculateSettlement | [SettlementsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SettlementsView.tsx:23); [VehicleOwnersView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/VehicleOwnersView.tsx:28) |
| [approveOwnerSettlement](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3219) | ownerSettlements.approveSettlement | [SettlementsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SettlementsView.tsx:24) |
| [payOwnerSettlement](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3236) | ownerSettlements.paySettlement | [SettlementsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SettlementsView.tsx:25) |
| [postLedgerTransaction](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3253) | No direct API call | [FinanceView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/FinanceView.tsx:31) |
| [processMpesaPayment](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3291) | payments.stkPush | [MpesaModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/modals/MpesaModal.tsx:13) |
| [startSupportAccess](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3368) | No direct API call | [Header.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/Header.tsx:37); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/apps/platform-admin/src/SaaSControlPlaneView.tsx:33) (not in active entrypoint); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SaaSControlPlaneView.tsx:61) |
| [endSupportAccess](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3378) | No direct API call | [Header.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/Header.tsx:36); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/apps/platform-admin/src/SaaSControlPlaneView.tsx:34) (not in active entrypoint); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SaaSControlPlaneView.tsx:62) |
| [changeTenantPlan](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3385) | platform.changeTenantPlan | [WorkspaceSettingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/WorkspaceSettingsView.tsx:35) |
| [toggleTenantSuspension](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3401) | platform.toggleTenantSuspension | No direct component context binding found |
| [updateTenantSettings](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3429) | No direct API call | [WorkspaceSettingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/WorkspaceSettingsView.tsx:27) |
| [updateWebsite](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3440) | No direct API call | No direct component context binding found |
| [verifyCustomDomain](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3451) | No direct API call | No direct component context binding found |
| [updateSubscriptionState](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3469) | No direct API call | [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/apps/platform-admin/src/SaaSControlPlaneView.tsx:29) (not in active entrypoint); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SaaSControlPlaneView.tsx:57); [WorkspaceSettingsView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/WorkspaceSettingsView.tsx:36) |
| [switchSubscriptionPlan](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3484) | No direct API call | [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/apps/platform-admin/src/SaaSControlPlaneView.tsx:30) (not in active entrypoint); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SaaSControlPlaneView.tsx:58) |
| [updateTenantWebsiteConfig](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3494) | No direct API call | [PublicWebsiteView.tsx](/home/jenny/Downloads/auto-spec-sage/apps/public-web/src/PublicWebsiteView.tsx:25) (not in active entrypoint); [PublicWebsiteView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PublicWebsiteView.tsx:25) |
| [resetToSeedData](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3508) | No direct API call | No direct component context binding found |
| [loginUser](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3540) | auth.login | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:34) |
| [registerUser](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3565) | auth.register | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:35) |
| [logoutUser](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3584) | auth.logout | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:36); [Header.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/Header.tsx:46) |
| [forgotPasswordUser](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3652) | auth.forgotPassword | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:37) |
| [resetPasswordUser](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3659) | auth.resetPassword | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:38) |
| [verifyEmailUser](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3667) | auth.verifyEmail | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:39) |
| [resendVerificationUser](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3678) | No direct API call | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:40) |
| [revokeSessionUser](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3682) | auth.revokeSession | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:41) |
| [revokeAllSessionsUser](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3687) | auth.revokeAllSessions | [AuthModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/AuthModal.tsx:42) |
| [switchTenant](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3704) | tenancy.switchTenant | [Header.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/Header.tsx:28); [SaaSControlPlaneView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/SaaSControlPlaneView.tsx:56) |
| [provisionNewTenant](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3739) | No direct API call | [CreateTenantModal.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/CreateTenantModal.tsx:16) |
| [createRatePlan](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3812) | pricing.createRatePlan | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:60) |
| [updateRatePlan](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3841) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:61) |
| [activateRatePlan](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3847) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:62) |
| [archiveRatePlan](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3853) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:63) |
| [saveRatePlanRates](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3859) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:64) |
| [createSeasonalRule](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3866) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:65) |
| [deleteSeasonalRule](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3884) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:66) |
| [createDurationTier](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3888) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:67) |
| [deleteDurationTier](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3903) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:68) |
| [createPricingFee](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3907) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:69) |
| [createPromoCode](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3925) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:70) |
| [togglePromoStatus](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3950) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:71) |
| [calculateInstantQuote](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3958) | No direct API call | [PricingView.tsx](/home/jenny/Downloads/auto-spec-sage/src/components/PricingView.tsx:72) |

## Verification

Full local HTTP responses, per-suite statuses and source mapping are in [audit data](/home/jenny/Downloads/auto-spec-sage/docs/audits/2026-09-23-audit-data.json). Synthetic identifiers are test-only; no credentials or bearer tokens are included.
