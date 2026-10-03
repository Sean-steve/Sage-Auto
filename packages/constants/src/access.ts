import { TENANT_SYSTEM_ROLES, PLATFORM_ROLES } from './roles';

// One presentation catalogue; API permissions remain authoritative.
export const ACCESS_SECTIONS: Record<string, {label:string; permission?:string}> = {
  overview:{label:'Overview'}, team:{label:'Team & invitations'},
  companies:{label:'Companies',permission:'platform.tenant.read'},
  plans:{label:'Plans & subscriptions',permission:'platform.plan.read'},
  platformBilling:{label:'SaaS billing',permission:'platform.billing.read'},
  support:{label:'Support access',permission:'platform.support.access'},
  platformAnalytics:{label:'Platform analytics',permission:'platform.analytics.read'},
  platformCompliance:{label:'Platform compliance',permission:'platform.compliance.read'},
  platformSettings:{label:'Platform settings',permission:'platform.config.manage'},
  availability:{label:'Availability',permission:'vehicle.read'},
 fleet:{label:'Fleet',permission:'vehicle.read'}, bookings:{label:'Bookings',permission:'booking.read'},
  customers:{label:'Customers',permission:'customer.read'}, rentals:{label:'Rentals',permission:'rental.read'}, returns:{label:'Returns & final calculation',permission:'rental.read'},
  inspections:{label:'Inspections',permission:'inspection.read'}, maintenance:{label:'Maintenance',permission:'maintenance.read'},
  compliance:{label:'Compliance',permission:'compliance.read'}, owners:{label:'Vehicle owners',permission:'vehicle_owner.read'},
  finance:{label:'Finance',permission:'invoice.read'}, settlements:{label:'Settlements',permission:'settlement.read'},
  pricing:{label:'Pricing',permission:'pricing.read'}, website:{label:'Public website'}, settings:{label:'Company settings'},
  leads:{label:'Leads & quotes',permission:'lead.read'}, drivers:{label:'Drivers',permission:'driver.read'},
  myTrips:{label:'My trips'}, myInspections:{label:'My inspections'}, myVehicles:{label:'My vehicles'}, mySettlements:{label:'My settlements'},
  myBookings:{label:'My bookings'}, profile:{label:'My profile'},
};
export const ROLE_SECTIONS: Record<string,string[]> = {
  PLATFORM_OWNER:['overview','companies','team','plans','platformBilling','support','platformAnalytics','platformCompliance','platformSettings'],
  PLATFORM_ADMIN:['overview','companies','team','plans','platformBilling','support','platformAnalytics','platformCompliance'],
  BILLING_ADMIN:['platformBilling','plans','companies'], SUPPORT_ADMIN:['support','companies'],
  ANALYTICS_ADMIN:['platformAnalytics'], COMPLIANCE_ADMIN:['platformCompliance'],
  COMPANY_OWNER:['overview','fleet','bookings','availability','customers','rentals','returns','inspections','maintenance','compliance','owners','finance','settlements','pricing','website','team','settings'],
  TENANT_ADMIN:['overview','fleet','bookings','availability','customers','rentals','returns','inspections','maintenance','compliance','owners','finance','settlements','pricing','website','team'],
  MANAGER:['overview','bookings','availability','fleet','customers','rentals','returns','inspections','maintenance','compliance','finance','pricing'],
  FLEET_MANAGER:['fleet','returns','maintenance','compliance','inspections','owners'],
  BOOKING_MANAGER:['bookings','availability','availability','customers','rentals','returns','pricing','leads'], BOOKING_AGENT:['bookings','availability','customers','rentals','returns'],
  FINANCE_MANAGER:['returns','finance','settlements'], ACCOUNTANT:['returns','finance','settlements'], SALES_AGENT:['leads','bookings','customers'],
  DRIVER_MANAGER:['drivers','rentals','returns','compliance'], DRIVER:['myTrips','myInspections'],
  CUSTOMER_SERVICE:['customers','bookings','rentals','returns','finance'], VEHICLE_OWNER:['myVehicles','mySettlements'],
  RENTER:['myBookings','profile'],
};
export function accessSections(roles:string[], permissions:string[]) {
  return [...new Set(roles.flatMap(role=>ROLE_SECTIONS[role] || []))].filter(id=>{
    const permission=ACCESS_SECTIONS[id]?.permission;
    return !permission || permissions.includes('*') || permissions.includes(permission);
  }).map(id=>({id,label:ACCESS_SECTIONS[id].label}));
}
export const ACCESS_ROLES = {...TENANT_SYSTEM_ROLES, ...PLATFORM_ROLES, RENTER:{code:'RENTER',name:'Renter',defaultPermissions:[]}};
