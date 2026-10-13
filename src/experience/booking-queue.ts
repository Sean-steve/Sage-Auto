/** Presentation-only derivations from authoritative booking responses; no demo payment state. */
export type BookingSummary={id?:string;bookingNumber?:string;customerName?:string;pickupAt?:string;status?:string};
export type BookingLane="all"|"review"|"pickup";
export const labelStatus=(s?:string)=>s?s.toLowerCase().replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase()):"Unspecified";
const review=new Set(["AWAITING_PAYMENT","PENDING_CONFIRMATION","PENDING","QUOTED","PAYMENT_FAILED"]);
const pickup=new Set(["CONFIRMED","READY_FOR_HANDOVER","HANDOVER_SCHEDULED"]);
export const laneOf=(status?:string):"review"|"pickup"|"other"=>review.has(status||"")?"review":pickup.has(status||"")?"pickup":"other";
export function sortedBookings(rows:readonly BookingSummary[],lane:BookingLane="all"){
 return rows.filter(x=>lane==="all"||laneOf(x.status)===lane).slice().sort((a,b)=>{
 const rank=(x:BookingSummary)=>laneOf(x.status)==="review"?0:laneOf(x.status)==="pickup"?1:2;
 const delta=rank(a)-rank(b);if(delta)return delta;
 const moment=(x:BookingSummary)=>{const n=x.pickupAt?Date.parse(x.pickupAt):NaN;return Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER;};
 return moment(a)-moment(b);
 });
}
