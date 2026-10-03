export type AccessPortal = {id:string;name:string;kind:string;site?:string;tenantId?:string;roles:string[];permissions:string[];sections:{id:string;label:string}[]};
export type AccessContext = {reviewMode?:boolean;user:{id:string;email:string;fullName:string;emailVerified:boolean};onboarding:any;portals:AccessPortal[]};
export const permits = (portal:AccessPortal, permission:string) => portal.permissions.includes('*') || portal.permissions.includes(permission);
export const originalViews:Record<string,string>={overview:'dashboard',fleet:'fleet',bookings:'bookings',customers:'customers',rentals:'rentals',inspections:'inspections',maintenance:'maintenance',compliance:'compliance',owners:'owners',finance:'finance',settlements:'settlements',pricing:'pricing',availability:'availability',website:'website',settings:'settings'};


export type RestorationConnectionStatus = 'READ_VERIFIED' | 'PARTIAL' | 'UNCONNECTED';

export type RestorationScreenConnection = {
  status: RestorationConnectionStatus;
  readSource: string;
  mutationsEnabled: boolean;
  note: string;
};

// The original interface is restored as a compatibility presentation layer.
// A screen becomes writable only after its server mutation contract, authorization,
// persistence, negative tests and reload/login persistence have been verified.
export const RESTORATION_SCREEN_CONNECTIONS: Record<string, RestorationScreenConnection> = {
  overview:{status:'UNCONNECTED',readSource:'No verified dashboard aggregate',mutationsEnabled:false,note:'Layout preserved; dashboard figures are not authoritative business totals.'},
  fleet:{status:'PARTIAL',readSource:'Fleet REST API + digital twin + permission-scoped linked domain reads',mutationsEnabled:true,note:'Fleet list, registration, asset edits, status, telemetry, ownership, documents and profile reads are server-backed. Maintenance, Compliance and Inspection execution remain in their dedicated modules.'},
  bookings:{status:'READ_VERIFIED',readSource:'GET /api/v1/bookings',mutationsEnabled:false,note:'Saved booking reads are verified. Original mutations remain quarantined.'},
  customers:{status:'PARTIAL',readSource:'Customers + Drivers + Corporate Accounts REST APIs with permission-scoped detail/readiness/relationship reads',mutationsEnabled:true,note:'Customers, Drivers and Corporate Accounts use a reconstructed server-backed People & Accounts experience. Booking remains a separate workflow.'},
  rentals:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only.'},
  inspections:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only.'},
  maintenance:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only.'},
  compliance:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only.'},
  owners:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only.'},
  finance:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only; no local financial totals are authoritative.'},
  settlements:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only.'},
  pricing:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only; local quote logic is not authoritative in restoration mode.'},
  availability:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only.'},
  website:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only.'},
  settings:{status:'UNCONNECTED',readSource:'Not loaded by restoration provider',mutationsEnabled:false,note:'Layout preserved only.'},
};
