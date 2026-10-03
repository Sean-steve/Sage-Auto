export type AccessPortal = {id:string;name:string;kind:string;site?:string;tenantId?:string;roles:string[];permissions:string[];sections:{id:string;label:string}[]};
export type AccessContext = {reviewMode?:boolean;user:{id:string;email:string;fullName:string;emailVerified:boolean};onboarding:any;portals:AccessPortal[]};
export const permits = (portal:AccessPortal, permission:string) => portal.permissions.includes('*') || portal.permissions.includes(permission);
export const originalViews:Record<string,string>={
  overview:'dashboard', fleet:'fleet', bookings:'bookings', handover:'handover', availability:'availability',
  customers:'customers', rentals:'rentals', returns:'returns', inspections:'inspections', maintenance:'maintenance',
  compliance:'compliance', owners:'owners', pricing:'pricing', finance:'finance', settlements:'settlements',
  mySettlements:'settlements', website:'website', settings:'settings'
};
