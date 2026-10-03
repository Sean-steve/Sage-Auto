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
  };

  // 5. Bookings & Reservation Engine Context
  public bookings = {
    listBookings: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/bookings${q ? `?${q}` : ''}`);
    },
    getBooking: (id: string) => this.get(`/bookings/${id}`),
    createBooking: (dto: any) => this.post('/bookings', dto),
    confirmBooking: (id: string, reason?: string) => this.post(`/bookings/${id}/confirm`, { reason }),
    cancelBooking: (id: string, reason: string) => this.post(`/bookings/${id}/cancel`, { reason }),
    rescheduleBooking: (id: string, dates: { startDate: string; endDate: string }) => this.post(`/bookings/${id}/reschedule`, dates),
    substituteVehicle: (id: string, replacementVehicleId: string, reason: string) =>
      this.post(`/bookings/${id}/substitute`, { replacementVehicleId, reason }),
  };

  // 6. Availability & Allocation Context
  public availability = {
    checkAvailability: (params: { vehicleId: string; startDate: string; endDate: string }) =>
      this.get('/availability/check', params),
    getTimeline: (params: { startDate: string; endDate: string }) => this.get('/availability/timeline', params),
  };

  // 7. On-Road Rentals & Operations Context
  public rentals = {
    listRentals: () => this.get<any[]>('/rentals'),
    getRental: (id: string) => this.get(`/rentals/${id}`),
    startRental: (bookingId: string) => this.post('/rentals/start', { bookingId }),
    extendRental: (id: string, dto: any) => this.post(`/rentals/${id}/extend`, dto),
    completeRental: (id: string, dto: any) => this.post(`/rentals/${id}/complete`, dto),
    recordIncident: (id: string, incident: any) => this.post(`/rentals/${id}/incidents`, incident),
  };

  // 8. Vehicle Inspections & Damage Mapping Context
  public inspections = {
    listInspections: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/inspections${q ? `?${q}` : ''}`);
    },
    listDamageCases: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/inspections/damage-cases/list${q ? `?${q}` : ''}`);
    },
    createInspection: (dto: any) => this.post('/inspections', dto),
    getInspection: (id: string) => this.get(`/inspections/${id}`),
  };

  // 9. Customers & Parties Context
  public customers = {
    listCustomers: () => this.get<any[]>('/customers'),
    getCustomer: (id: string) => this.get(`/customers/${id}`),
    createCustomer: (dto: any) => this.post('/customers', dto),
    updateCustomer: (id: string, dto: any) => this.put(`/customers/${id}`, dto),
    verifyCustomer: (id: string, dto: any) => this.patch(`/customers/${id}/verify`, dto),
    changeStatus: (id: string, dto: any) => this.patch(`/customers/${id}/status`, dto),
    blockCustomer: (id: string, reason: string) => this.patch(`/customers/${id}/status`, { status: "BLOCKED", reason }),
  };

  // 10. Pricing & Rate Engine Context
  public pricing = {
    getRatePlans: () => this.get<any[]>('/pricing/rate-plans'),
    createRatePlan: (dto: any) => this.post('/pricing/rate-plans', dto),
    calculateQuote: (req: any) => this.post('/pricing/quote', req),
    getPromoCodes: () => this.get<any[]>('/pricing/promo-codes'),
    createPromoCode: (dto: any) => this.post('/pricing/promo-codes', dto),
  };

  // 11. Operational Finance & General Ledger Context
  public finance = {
    getInvoices: () => this.get<any[]>('/finance/invoices'),
    getExpenses: () => this.get<any[]>('/finance/expenses'),
    createExpense: (dto: any) => this.post('/finance/expenses', dto),
    recordPayment: (dto: any) => this.post('/finance/payments', dto),
    getLedgerAccounts: () => this.get<any[]>('/ledger/accounts'),
    getLedgerTransactions: () => this.get<any[]>('/ledger/transactions'),
  };

  // 12. Vehicle Owner Settlements Context
  public ownerSettlements = {
    listSettlements: () => this.get<any[]>('/owner-settlements'),
    calculateSettlement: (dto: any) => this.post('/owner-settlements/calculate', dto),
    approveSettlement: (id: string) => this.post(`/owner-settlements/${id}/approve`),
    paySettlement: (id: string, payoutRef: string) => this.post(`/owner-settlements/${id}/pay`, { payoutRef }),
  };

  // 13. Payments & M-Pesa Integration Context
  public payments = {
    stkPush: (dto: { bookingId: string; phoneNumber: string; amount: number }) =>
      this.post('/payments/attempts', {
        purpose: 'CUSTOMER_INVOICE',
        amount: String(dto.amount),
        targetId: dto.bookingId,
        customerPhone: dto.phoneNumber,
        provider: 'MPESA_DARAJA',
      }),
    getAttempts: (bookingId?: string) => this.get('/payments/attempts', bookingId ? { bookingId } : undefined),
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

  // 15. Regulatory Compliance & Expiry Alerts Context
  public compliance = {
    listRecords: (params?: Record<string, any>) => {
      const q = new URLSearchParams(params).toString();
      return this.get<any[]>(`/compliance/records${q ? `?${q}` : ''}`);
    },
    getVehicleReadiness: (vehicleId: string) => this.get<any>(`/compliance/readiness/vehicle/${vehicleId}`),
    listDocuments: () => this.get<any[]>('/compliance/documents'),
    addDocument: (dto: any) => this.post('/compliance/documents', dto),
    overrideHold: (id: string, reason: string) => this.post(`/compliance/documents/${id}/override-hold`, { reason }),
  };

  // 16. Analytics & Reports Engine Context
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

  // 17. SaaS Control Plane & Platform Operations Context
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
