// ============================================================================
// CAR HIRE OS — UNIFIED API CLIENT LAYER
// Type-safe HTTP REST client for all 35 Bounded Context NestJS APIs
// Supports JWT Bearer tokens, Multi-Tenant headers, and Graceful Offline Fallback
// ============================================================================

export interface ApiResponse<T = any> {
  data?: T;
  status?: string;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

class ApiClient {
  private baseUrl: string = '/api/v1';
  private authToken: string | null = localStorage.getItem('carhire_access_token');
  private refreshToken: string | null = localStorage.getItem('carhire_refresh_token');
  private tenantId: string = localStorage.getItem('carhire_active_tenant_id') || '';
  private refreshInFlight: Promise<boolean> | null = null;
  private sessionExpiredHandler: (() => void) | null = null;

  public setToken(token: string | null) {
    this.authToken = token;
    if (token) {
      localStorage.setItem('carhire_access_token', token);
    } else {
      localStorage.removeItem('carhire_access_token');
    }
  }

  public getToken(): string | null {
    return this.authToken;
  }

  public setRefreshToken(token: string | null) {
    this.refreshToken = token;
    if (token) {
      localStorage.setItem('carhire_refresh_token', token);
    } else {
      localStorage.removeItem('carhire_refresh_token');
    }
  }

  public getRefreshToken(): string | null {
    return this.refreshToken;
  }

  public setSessionExpiredHandler(handler: (() => void) | null) {
    this.sessionExpiredHandler = handler;
  }

  public setTenantId(tenantId: string) {
    this.tenantId = tenantId;
    if (tenantId) {
      localStorage.setItem('carhire_active_tenant_id', tenantId);
    } else {
      localStorage.removeItem('carhire_active_tenant_id');
    }
  }

  public clearTenantId() {
    this.setTenantId('');
  }

  public getTenantId(): string {
    return this.tenantId;
  }

  private getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-ID': this.tenantId,
      ...customHeaders,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  public async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
    retried = false
  ): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: this.getHeaders(options.headers as Record<string, string>),
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 && !['/auth/refresh','/auth/login','/auth/register'].some(path=>endpoint.startsWith(path))) {
          if (!retried && this.refreshToken) {
            this.refreshInFlight ||= (async()=>{
              const refreshed=await fetch(`${this.baseUrl}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:this.refreshToken})});
              const payload=await refreshed.json();
              if(!refreshed.ok || !payload.data?.tokens?.accessToken) return false;
              this.setToken(payload.data.tokens.accessToken);this.setRefreshToken(payload.data.tokens.refreshToken);return true;
            })().finally(()=>{this.refreshInFlight=null;});
            if(await this.refreshInFlight) return this.request<T>(endpoint,options,true);
          }
          this.setToken(null);this.setRefreshToken(null);this.sessionExpiredHandler?.();
        }

        return {
          error: {
            code: data.error?.code || `HTTP_${response.status}`,
            message: data.message || data.error?.message || (typeof data.error === 'string' ? data.error : '') || response.statusText || 'An unexpected error occurred',
            details: data.error?.details,
          },
        };
      }

      return data as ApiResponse<T>;
    } catch (err: any) {
      console.warn(`[ApiClient] Network request failed for ${url}:`, err.message);
      return {
        error: {
          code: 'NETWORK_ERROR',
          message: err.message || 'Unable to connect to the backend API server.',
        },
      };
    }
  }

  public async uploadBinary<T = any>(endpoint: string, body: Blob, contentType: string): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: this.getHeaders({ 'Content-Type': contentType }),
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          error: {
            code: data.error?.code || `HTTP_${response.status}`,
            message: data.error?.message || data.message || response.statusText || 'Upload failed',
            details: data.error?.details,
          },
        };
      }
      return data as ApiResponse<T>;
    } catch (err: any) {
      return { error: { code: 'NETWORK_ERROR', message: err.message || 'Upload failed' } };
    }
  }

  // HTTP Verbs
  public get<T = any>(endpoint: string, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  public post<T = any>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    });
  }

  public put<T = any>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    });
  }

  public patch<T = any>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    });
  }

  public delete<T = any>(endpoint: string, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }

  // --------------------------------------------------------------------------
  // DOMAIN BOUNDED CONTEXT CLIENT SERVICES
  // --------------------------------------------------------------------------

  // 1. Identity & Auth Context
  public auth = {
    login: (credentials: { email: string; password?: string; authType?: string }) =>
      this.post<{
        user: any;
        tokens: { accessToken: string; refreshToken: string; tokenType: string; expiresIn: number };
        session: any;
      }>('/auth/login', credentials),
    refresh: (refreshToken: string) =>
      this.post<{ tokens: { accessToken: string; refreshToken: string } }>('/auth/refresh', { refreshToken }),
    register: (userData: any) =>
      this.post<{ user: any; token: string }>('/auth/register', userData),
    getMe: () => this.get<{ user: any }>('/auth/me'),
    logout: (allSessions = false, refreshToken?: string | null) =>
      this.post('/auth/logout', { allSessions, refreshToken: refreshToken || undefined }),
    getSessions: () => this.get<{ sessions: any[] }>('/auth/sessions'),
    revokeSession: (sessionId: string) => this.delete(`/auth/sessions/${sessionId}`),
    revokeAllSessions: () => this.delete('/auth/sessions'),
    forgotPassword: (email: string) => this.post('/auth/forgot-password', { email }),
    resetPassword: (token: string, newPassword: string) => this.post('/auth/reset-password', { token, newPassword }),
    verifyEmail: (token: string) => this.post('/auth/verify-email', { token }),
  };

  // 2. Tenancy & Workspaces Context
  public tenancy = {
    listTenants: () => this.get<any[]>('/tenants'),
    getTenant: (id: string) => this.get<{ tenant: any }>('/tenant/details'),
    switchTenant: (targetTenantId: string) => this.get<any>('/tenant/context'),
    provisionTenant: (dto: any) => this.post<{ tenant: any }>('/tenants', dto),
  };

  // 3. Fleet & Vehicle Digital Twin Context
  public fleet = {
    listVehicles: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/fleet/vehicles${q ? `?${q}` : ''}`);
    },
    getVehicle: (id: string) => this.get<{ vehicle: any }>(`/fleet/vehicles/${id}`),
    getDigitalTwin: (id: string) => this.get<any>(`/fleet/vehicles/${id}/digital-twin`),
    getCategories: () => this.get<any[]>('/fleet/categories'),
    getDocuments: (id: string) => this.get<any[]>(`/fleet/vehicles/${id}/documents`),
    addDocument: (id: string, dto: any) => this.post(`/fleet/vehicles/${id}/documents`, dto),
    createVehicle: (dto: any) => this.post('/fleet/vehicles', dto),
    updateVehicle: (id: string, dto: any) => this.patch(`/fleet/vehicles/${id}`, dto),
    deleteVehicle: (id: string) => this.delete(`/fleet/vehicles/${id}`),
    changeLifecycleStatus: (id: string, dto: any) => this.post(`/fleet/vehicles/${id}/lifecycle-status`, dto),
    changeAvailabilityStatus: (id: string, dto: any) => this.post(`/fleet/vehicles/${id}/availability-status`, dto),
    recordMileage: (id: string, dto: any) => this.post(`/fleet/vehicles/${id}/mileage`, dto),
    recordFuel: (id: string, dto: any) => this.post(`/fleet/vehicles/${id}/fuel`, dto),
    listMedia: (id: string) => this.get<any[]>(`/vehicles/${id}/media`),
    getPrimaryMedia: (id: string) => this.get<any>(`/vehicles/${id}/media/primary`),
    removeMedia: (id: string, mediaAssetId: string) => this.delete(`/vehicles/${id}/media/${mediaAssetId}`),
  };

  // 4. Vehicle Owners & Revenue Shares Context
  public vehicleOwners = {
    listOwners: () => this.get<any[]>('/vehicle-owners'),
    getOwner: (id: string) => this.get(`/vehicle-owners/${id}`),
    createOwner: (dto: any) => this.post('/vehicle-owners', dto),
    updateOwner: (id: string, dto: any) => this.patch(`/vehicle-owners/${id}`, dto),
    assignOwnership: (dto: any) => this.post('/vehicle-owners/ownerships/assign', dto),
    transferOwnership: (dto: any) => this.post('/vehicle-owners/ownerships/transfer', dto),
    renegotiateTerms: (dto: any) => this.post('/vehicle-owners/ownerships/change-terms', dto),
    getOwnershipHistory: (vehicleId: string) => this.get<any[]>(`/vehicle-owners/ownerships/vehicle/${vehicleId}/history`),
  };

  // 5. Bookings & Reservation Engine Context
  public bookings = {
    listBookings: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/bookings${q ? `?${q}` : ''}`);
    },
    getBooking: (id: string) => this.get(`/bookings/${id}`),
    previewQuote: (dto: any) => this.post('/bookings/quote', dto),
    createBooking: (dto: any) => this.post('/bookings', dto),
    updateDraft: (id: string, dto: any) => this.patch(`/bookings/${id}`, dto),
    quoteBooking: (id: string, dto: any = {}) => this.post(`/bookings/${id}/quote`, dto),
    requestPayment: (id: string) => this.post(`/bookings/${id}/request-payment`),
    confirmBooking: (id: string, dto: any = {}) => this.post(`/bookings/${id}/confirm`, dto),
    cancelBooking: (id: string, dto: any) => this.post(`/bookings/${id}/cancel`, dto),
    rejectBooking: (id: string, dto: any) => this.post(`/bookings/${id}/reject`, dto),
    expireBooking: (id: string, dto: any = {}) => this.post(`/bookings/${id}/expire`, dto),
    markNoShow: (id: string, dto: any = {}) => this.post(`/bookings/${id}/no-show`, dto),
    amendDates: (id: string, dto: any) => this.post(`/bookings/${id}/amend-dates`, dto),
    substituteVehicle: (id: string, dto: any) => this.post(`/bookings/${id}/substitute-vehicle`, dto),
    getHandoverReadiness: (id: string) => this.get(`/bookings/${id}/handover-readiness`),
  };

  // 6. Availability & Allocation Context
  public availability = {
    checkAvailability: (dto: any) => this.post('/availability/check', dto),
    searchAvailableVehicles: (dto: any) => this.post('/availability/search', dto),
    listAllocations: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/availability/allocations${q ? `?${q}` : ''}`);
    },
    createAllocation: (dto: any) => this.post('/availability/allocations', dto),
    releaseAllocation: (id: string, reason: string) =>
      this.post(`/availability/allocations/${id}/release`, { reason }),
    substituteAllocation: (id: string, newVehicleId: string) =>
      this.post(`/availability/allocations/${id}/substitute`, { newVehicleId }),
    listHolds: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/availability/holds${q ? `?${q}` : ''}`);
    },
    createHold: (dto: any) => this.post('/availability/holds', dto),
    confirmHold: (dto: any) => this.post('/availability/holds/confirm', dto),
    releaseHold: (idOrToken: string) => this.post(`/availability/holds/${idOrToken}/release`),
    listBlocks: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/availability/blocks${q ? `?${q}` : ''}`);
    },
    createBlock: (dto: any) => this.post('/availability/blocks', dto),
    releaseBlock: (id: string, reason: string) =>
      this.post(`/availability/blocks/${id}/release`, { reason }),
    getVehicleCalendar: (vehicleId: string, start: string, end: string) => {
      const q = new URLSearchParams({ start, end }).toString();
      return this.get(`/availability/calendar/${vehicleId}?${q}`);
    },
  };

  // 7. Contracts & Handover Context
  public contracts = {
    listContracts: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/contracts${q ? `?${q}` : ''}`);
    },
    getContract: (id: string) => this.get(`/contracts/${id}`),
    generateContract: (dto: any) => this.post('/contracts/generate', dto),
    sendContract: (id: string, dto: any) => this.post(`/contracts/${id}/send`, dto),
    signContract: (id: string, dto: any) => this.post(`/contracts/${id}/sign`, dto),
    amendContract: (id: string, dto: any) => this.post(`/contracts/${id}/amend`, dto),
  };

  public handovers = {
    listHandovers: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/handovers${q ? `?${q}` : ''}`);
    },
    getHandover: (id: string) => this.get(`/handovers/${id}`),
    schedule: (dto: any) => this.post('/handovers/schedule', dto),
    recordArrival: (id: string, dto: any) => this.post(`/handovers/${id}/arrive`, dto),
    verifyDocuments: (id: string, dto: any) => this.post(`/handovers/${id}/verify-documents`, dto),
    completeInspection: (id: string, dto: any) => this.post(`/handovers/${id}/inspection`, dto),
    confirmSignature: (id: string, dto: any) => this.post(`/handovers/${id}/confirm-signature`, dto),
    handoverKeys: (id: string, dto: any) => this.post(`/handovers/${id}/handover-keys`, dto),
    complete: (id: string, dto: any = {}) => this.post(`/handovers/${id}/complete`, dto),
  };

  // 8. On-Road Rentals & Operations Context
  public rentals = {
    listRentals: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/rentals${q ? `?${q}` : ''}`);
    },
    getRental: (id: string) => this.get(`/rentals/${id}`),
    getReadiness: (bookingId: string) => this.get(`/rentals/readiness/${bookingId}`),
    startRental: (dtoOrBookingId: string | {
      bookingId: string;
      contractId?: string;
      handoverId?: string;
      startOdometer?: number;
      startFuelLevel?: number;
      notes?: string;
      idempotencyKey?: string;
    }) => this.post('/rentals/start', typeof dtoOrBookingId === 'string' ? { bookingId: dtoOrBookingId } : dtoOrBookingId),
    getStartSnapshot: (id: string) => this.get(`/rentals/${id}/start-snapshot`),

    requestExtension: (id: string, dto: any) => this.post(`/rentals/${id}/extensions`, dto),
    // Compatibility alias for legacy callers; this now creates a REQUESTED extension.
    extendRental: (id: string, dto: any) => this.post(`/rentals/${id}/extensions`, dto),
    listExtensions: (id: string) => this.get(`/rentals/${id}/extensions`),
    approveExtension: (id: string, extensionId: string, dto: any = {}) =>
      this.post(`/rentals/${id}/extensions/${extensionId}/approve`, dto),
    rejectExtension: (id: string, extensionId: string, dto: any) =>
      this.post(`/rentals/${id}/extensions/${extensionId}/reject`, dto),

    listIncidents: (id: string) => this.get(`/rentals/${id}/incidents`),
    recordIncident: (id: string, incident: any) => this.post(`/rentals/${id}/incidents`, incident),

    scheduleReturn: (id: string, dto: any) => this.post(`/rentals/${id}/return-schedule`, dto),
    receiveReturnedVehicle: (id: string, dto: any) => this.post(`/rentals/${id}/receive`, dto),
    linkReturnInspection: (id: string, dto: any) => this.post(`/rentals/${id}/return-inspection`, dto),
    getReturnRecord: (id: string) => this.get(`/rentals/${id}/return-record`),
    calculateFinal: (id: string, dto: any) => this.post(`/rentals/${id}/calculate-final`, dto),
    getFinalCalculation: (id: string) => this.get(`/rentals/${id}/final-calculation`),
    processDepositSettlement: (id: string, dto: any) => this.post(`/rentals/${id}/deposit-settlement`, dto),
    completeRental: (id: string, dto: any = {}) => this.post(`/rentals/${id}/complete`, dto),
  };

  // 8. Vehicle Inspections & Damage Mapping Context
  public inspections = {
    listInspections: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/inspections${q ? `?${q}` : ''}`);
    },
    createInspection: (dto: any) => this.post('/inspections', dto),
    getInspection: (id: string) => this.get(`/inspections/${id}`),
    startInspection: (id: string, dto: any = {}) => this.post(`/inspections/${id}/start`, dto),
    recordResponses: (id: string, dto: any) => this.post(`/inspections/${id}/responses`, dto),
    recordDamage: (id: string, dto: any) => this.post(`/inspections/${id}/damages`, dto),
    addEvidence: (id: string, dto: any) => this.post(`/inspections/${id}/evidence`, dto),
    addSignature: (id: string, dto: any) => this.post(`/inspections/${id}/signatures`, dto),
    getReadiness: (id: string) => this.get(`/inspections/${id}/readiness`),
    completeInspection: (id: string, dto: any) => this.post(`/inspections/${id}/complete`, dto),
    compare: (baselineId: string, returnId: string) => this.post('/inspections/compare', { baselineId, returnId }),
    getRentalComparison: (rentalId: string) => this.get(`/inspections/rentals/${rentalId}/comparison`),
    listDamageCases: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/inspections/damage-cases/list${q ? `?${q}` : ''}`);
    },
  };

  // 9. Customers & Parties Context
  public customers = {
    listCustomers: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/customers${q ? `?${q}` : ''}`);
    },
    getCustomer: (id: string) => this.get(`/customers/${id}`),
    createCustomer: (dto: any) => this.post('/customers', dto),
    updateCustomer: (id: string, dto: any) => this.put(`/customers/${id}`, dto),
    verifyCustomer: (id: string, dto: any) => this.patch(`/customers/${id}/verify`, dto),
    changeStatus: (id: string, dto: any) => this.patch(`/customers/${id}/status`, dto),
    blockCustomer: (id: string, reason: string, expectedVersion?: number) =>
      this.patch(`/customers/${id}/status`, { status: "BLOCKED", reason, expectedVersion }),
  };

  public drivers = {
    listDrivers: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/drivers${q ? `?${q}` : ''}`);
    },
    getDriver: (id: string) => this.get(`/drivers/${id}`),
    createDriver: (dto: any) => this.post('/drivers', dto),
    updateDriver: (id: string, dto: any) => this.put(`/drivers/${id}`, dto),
    changeStatus: (id: string, dto: any) => this.patch(`/drivers/${id}/status`, dto),
    verifyDriver: (id: string, dto: any) => this.patch(`/drivers/${id}/verify`, dto),
    listCustomerRelationships: (customerId: string) =>
      this.get<any[]>(`/drivers/relationships/customer/${customerId}`),
    linkCustomer: (dto: any) => this.post('/drivers/relationships', dto),
    unlinkCustomer: (relationshipId: string) => this.delete(`/drivers/relationships/${relationshipId}`),
  };

  public agents = {
    listAgents: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/agents${q ? `?${q}` : ''}`);
    },
    getAgent: (id: string) => this.get(`/agents/${id}`),
  };

  public corporateAccounts = {
    listAccounts: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/corporate-accounts${q ? `?${q}` : ''}`);
    },
    getAccount: (id: string) => this.get(`/corporate-accounts/${id}`),
    createAccount: (dto: any) => this.post('/corporate-accounts', dto),
    updateAccount: (id: string, dto: any) => this.put(`/corporate-accounts/${id}`, dto),
    authorizeDriver: (id: string, dto: any) => this.post(`/corporate-accounts/${id}/authorized-drivers`, dto),
    revokeAuthorizedDriver: (id: string, authorizationId: string) =>
      this.delete(`/corporate-accounts/${id}/authorized-drivers/${authorizationId}`),
  };

  // 11. Pricing & Rate Engine Context
  public pricing = {
    getRatePlans: () => this.get<any[]>('/pricing/rate-plans'),
    getRatePlan: (id: string) => this.get(`/pricing/rate-plans/${id}`),
    createRatePlan: (dto: any) => this.post('/pricing/rate-plans', dto),
    updateRatePlan: (id: string, dto: any) => this.patch(`/pricing/rate-plans/${id}`, dto),
    activateRatePlan: (id: string) => this.post(`/pricing/rate-plans/${id}/activate`),
    archiveRatePlan: (id: string) => this.post(`/pricing/rate-plans/${id}/archive`),
    getRates: (id: string) => this.get<any[]>(`/pricing/rate-plans/${id}/rates`),
    setRates: (id: string, rates: any[]) => this.post(`/pricing/rate-plans/${id}/rates`, { rates }),
    getAssignments: (id: string) => this.get<any[]>(`/pricing/rate-plans/${id}/assignments`),
    assignPlan: (id: string, dto: any) => this.post(`/pricing/rate-plans/${id}/assignments`, dto),
    getSeasonalRules: (id: string) => this.get<any[]>(`/pricing/rate-plans/${id}/seasonal-rules`),
    createSeasonalRule: (id: string, dto: any) => this.post(`/pricing/rate-plans/${id}/seasonal-rules`, dto),
    deleteSeasonalRule: (id: string) => this.delete(`/pricing/seasonal-rules/${id}`),
    getDurationTiers: (id: string) => this.get<any[]>(`/pricing/rate-plans/${id}/duration-tiers`),
    createDurationTier: (id: string, dto: any) => this.post(`/pricing/rate-plans/${id}/duration-tiers`, dto),
    deleteDurationTier: (id: string) => this.delete(`/pricing/duration-tiers/${id}`),
    getFees: () => this.get<any[]>('/pricing/fees'),
    createFee: (dto: any) => this.post('/pricing/fees', dto),
    deleteFee: (id: string) => this.delete(`/pricing/fees/${id}`),
    getPromoCodes: () => this.get<any[]>('/pricing/promo-codes'),
    createPromoCode: (dto: any) => this.post('/pricing/promo-codes', dto),
    updatePromoStatus: (id: string, status: string) => this.patch(`/pricing/promo-codes/${id}/status`, { status }),
    calculateQuote: (req: any) => this.post('/pricing/calculate', req),
  };

  // 12. Operational Finance & General Ledger Context
  public finance = {
    getSummary: () => this.get('/finance/summary'),
    getInvoices: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/finance/invoices${q ? `?${q}` : ''}`);
    },
    getInvoice: (id: string) => this.get(`/finance/invoices/${id}`),
    getInvoiceHistory: (id: string) => this.get<any[]>(`/finance/invoices/${id}/history`),
    createInvoice: (dto: any) => this.post('/finance/invoices', dto),
    generateRentalInvoice: (dto: any) => this.post('/finance/invoices/generate-from-rental', dto),
    issueInvoice: (id: string, dto: any = {}) => this.post(`/finance/invoices/${id}/issue`, dto),
    voidInvoice: (id: string, dto: any) => this.post(`/finance/invoices/${id}/void`, dto),

    getCreditNotes: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/finance/credit-notes${q ? `?${q}` : ''}`);
    },
    createCreditNote: (dto: any) => this.post('/finance/credit-notes', dto),
    issueCreditNote: (id: string) => this.post(`/finance/credit-notes/${id}/issue`),
    voidCreditNote: (id: string, reason: string) => this.post(`/finance/credit-notes/${id}/void`, { reason }),

    getExpenses: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/finance/expenses${q ? `?${q}` : ''}`);
    },
    createExpense: (dto: any) => this.post('/finance/expenses', dto),
    submitExpense: (id: string) => this.post(`/finance/expenses/${id}/submit`),
    approveExpense: (id: string, dto: any = {}) => this.post(`/finance/expenses/${id}/approve`, dto),
    rejectExpense: (id: string, reason: string) => this.post(`/finance/expenses/${id}/reject`, { reason }),
    voidExpense: (id: string, reason: string) => this.post(`/finance/expenses/${id}/void`, { reason }),

    getDeposits: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/finance/deposits${q ? `?${q}` : ''}`);
    },
    createDeposit: (dto: any) => this.post('/finance/deposits', dto),
    applyDeposit: (id: string, dto: any) => this.post(`/finance/deposits/${id}/apply`, dto),

    getRefundObligations: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/finance/refunds${q ? `?${q}` : ''}`);
    },
    createRefundObligation: (dto: any) => this.post('/finance/refunds', dto),
    approveRefundObligation: (id: string) => this.post(`/finance/refunds/${id}/approve`),

    getCustomerReceivables: (customerId: string) => this.get(`/finance/receivables/customers/${customerId}`),
    getCorporateReceivables: (corporateAccountId: string) => this.get(`/finance/receivables/corporate/${corporateAccountId}`),

    getLedgerAccounts: () => this.get<any[]>('/ledger/accounts'),
    getLedgerTransactions: () => this.get<any[]>('/ledger/journals'),
    getTrialBalance: (asOfDate?: string) => this.get(`/ledger/trial-balance${asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : ''}`),
  };

  // 12. Vehicle Owner Settlements Context
  public ownerSettlements = {
    listPeriods: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/owner-settlements/periods${q ? `?${q}` : ''}`);
    },
    createPeriod: (dto: any) => this.post('/owner-settlements/periods', dto),
    closePeriod: (id: string) => this.post(`/owner-settlements/periods/${id}/close`, {}),
    listBatches: (periodId?: string) =>
      this.get<any[]>(`/owner-settlements/batches${periodId ? `?periodId=${encodeURIComponent(periodId)}` : ''}`),
    generateBatch: (dto: any) => this.post('/owner-settlements/batches', dto),

    listSettlements: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/owner-settlements${q ? `?${q}` : ''}`);
    },
    getSettlement: (id: string) => this.get(`/owner-settlements/${id}`),
    calculateSettlement: (dto: any) => this.post('/owner-settlements/calculate', dto),
    getStatement: (id: string) => this.get(`/owner-settlements/${id}/statement`),
    approveSettlement: (id: string, dto: any = {}) => this.post(`/owner-settlements/${id}/approve`, dto),
    disputeSettlement: (id: string, reason: string) => this.post(`/owner-settlements/${id}/dispute`, { reason }),
    resolveDispute: (id: string, dto: any) => this.post(`/owner-settlements/${id}/resolve-dispute`, dto),
    addAdjustment: (id: string, dto: any) => this.post(`/owner-settlements/${id}/adjustments`, dto),
    listPayables: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/owner-settlements/payables/list${q ? `?${q}` : ''}`);
    },
    getProfitability: (params: { startDate: string; endDate: string; vehicleId?: string }) => {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get(`/owner-settlements/reports/profitability?${q}`);
    },

    // Resource-scoped Vehicle Owner self-service.
    listMine: () => this.get<any[]>('/owner-settlements/mine'),
    getMyStatement: (id: string) => this.get(`/owner-settlements/mine/${id}/statement`),
    disputeMine: (id: string, reason: string) => this.post(`/owner-settlements/mine/${id}/dispute`, { reason }),
  };

  // 13. Payments & Provider Integration Context
  public payments = {
    initiateAttempt: (dto: any) => this.post('/payments/attempts', dto),
    stkPush: (dto: { invoiceId: string; phoneNumber: string; amount: number; customerId?: string }) =>
      this.post('/payments/attempts', {
        purpose: 'CUSTOMER_INVOICE',
        amount: String(dto.amount),
        targetId: dto.invoiceId,
        customerId: dto.customerId,
        customerPhone: dto.phoneNumber,
        provider: 'MPESA_DARAJA',
      }),
    listAttempts: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/payments/attempts${q ? `?${q}` : ''}`);
    },
    getAttempt: (id: string) => this.get(`/payments/attempts/${id}`),
    verifyAttempt: (id: string) => this.post(`/payments/attempts/${id}/verify`, {}),

    recordManual: (dto: any) => this.post('/payments/manual', dto),
    listPayments: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/payments${q ? `?${q}` : ''}`);
    },
    getPayment: (id: string) => this.get(`/payments/${id}`),
    allocate: (paymentId: string, dto: any) => this.post(`/payments/${paymentId}/allocate`, dto),
    getAllocations: (paymentId: string) => this.get<any[]>(`/payments/${paymentId}/allocations`),

    listRefunds: (params?: Record<string, any>) => {
      const q = new URLSearchParams(
        Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '') as [string, string][]
      ).toString();
      return this.get<any[]>(`/payments/refunds${q ? `?${q}` : ''}`);
    },
    requestRefund: (dto: any) => this.post('/payments/refunds', dto),
    approveAndExecuteRefund: (id: string) => this.post(`/payments/refunds/${id}/approve-and-execute`),

    runReconciliation: () => this.post<any[]>('/payments/reconciliation/scan', {}),
    listReconciliationIssues: (resolved?: boolean) =>
      this.get<any[]>(`/payments/reconciliation/issues${resolved === undefined ? '' : `?resolved=${resolved}`}`),
    resolveReconciliationIssue: (id: string) => this.post(`/payments/reconciliation/issues/${id}/resolve`),
    executeOwnerPayout: (dto: {
      settlementPayableId: string;
      provider?: string;
      idempotencyKey?: string;
      notes?: string;
    }) => this.post('/payments/payouts/owner-settlement', dto),
  };

  // 14. Fleet Maintenance & Servicing Context
  public maintenance = {
    listWorkOrders: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/maintenance/work-orders${q ? `?${q}` : ''}`);
    },
    createWorkOrder: (dto: any) => this.post('/maintenance/work-orders', dto),
    updateWorkOrder: (id: string, dto: any) => {
      const { status, ...payload } = dto;
      const actionByStatus: Record<string, string> = {
        SCHEDULED: 'schedule',
        IN_PROGRESS: 'start',
        COMPLETED: 'complete',
      };
      const action = actionByStatus[status];
      if (!action) {
        return Promise.resolve({
          error: { code: 'UNSUPPORTED_MAINTENANCE_STATUS', message: `Unsupported work order status: ${status}` },
        } as ApiResponse);
      }
      return this.post(`/maintenance/work-orders/${id}/${action}`, payload);
    },
    listSchedules: () => this.get<any[]>('/maintenance/schedules'),
    createSchedule: (dto: any) => this.post('/maintenance/schedules', dto),
    listProviders: () => this.get<any[]>('/maintenance/providers'),
    createProvider: (dto: any) => this.post('/maintenance/providers', dto),
  };

  // 16. Regulatory Compliance & Expiry Alerts Context
  public compliance = {
    listRecords: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/compliance/records${q ? `?${q}` : ''}`);
    },
    getVehicleReadiness: (vehicleId: string) => this.get<any>(`/compliance/readiness/vehicle/${vehicleId}`),
    getDriverReadiness: (driverId: string) => this.get<any>(`/compliance/readiness/driver/${driverId}`),
    listDocuments: () => this.get<any[]>('/compliance/documents'),
    addDocument: (dto: any) => this.post('/compliance/documents', dto),
    overrideHold: (id: string, reason: string) => this.post(`/compliance/documents/${id}/override-hold`, { reason }),
  };

  // 17. Analytics & Reports Engine Context
  public analytics = {
    getDashboard: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get(`/analytics/dashboard${q ? `?${q}` : ''}`);
    },
    getReportCatalogue: () => this.get('/reports/catalogue'),
    getReportExecutions: () => this.get('/reports/executions'),
    queryReport: (reportKey: string, params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get(`/reports/query/${reportKey}${q ? `?${q}` : ''}`);
    },
    exportReport: (reportKey: string, format = 'csv') =>
      this.post(`/reports/export/${reportKey}`, { format }),
  };

  // 18. SaaS Control Plane & Platform Operations Context
  public platform = {
    getAnalyticsOverview: () => this.get('/platform/analytics/overview'),
    getMrrMovements: () => this.get('/platform/analytics/mrr-movements'),
    listTenants: () => this.get('/platform/tenants'),
    toggleTenantSuspension: (tenantId: string, shouldSuspend: boolean) =>
      this.post(`/platform/tenants/${tenantId}/${shouldSuspend ? 'suspend' : 'reactivate'}`, {
        reason: shouldSuspend ? 'Suspended by platform operator' : 'Reactivated by platform operator',
      }),
    changeTenantPlan: (tenantId: string, planId: string) => this.post(`/platform/tenants/${tenantId}/change-plan`, { planId }),
  };
}

export const apiClient = new ApiClient();
