import React, { useMemo, useState } from "react";
import { ArrowUpRight, CalendarClock, ChevronRight } from "lucide-react";
import { laneOf, labelStatus, sortedBookings, type BookingLane, type BookingSummary } from "./booking-queue";
/** V2 Work Mode visual: renders only records supplied by the canonical API. */
export function DepartureBoard({bookings,loading,error,canOpen,onOpen}:{bookings:BookingSummary[];loading:boolean;error?:string;canOpen:boolean;onOpen:()=>void}){
 const [lane,setLane]=useState<BookingLane>("all");
 const rows=useMemo(()=>sortedBookings(bookings,lane),[bookings,lane]);
 return <section className="sage-departure-board" aria-labelledby="departure-heading">
 <header className="sage-board-heading"><div><span className="sage-overline"><CalendarClock size={15}/> OPERATIONS / LIVE RECORDS</span><h2 id="departure-heading">Departure board<span className="sage-dot">.</span></h2><p>Priority scan of saved reservations; details and authoritative actions remain in Bookings.</p></div>
 {canOpen&&<button type="button" onClick={onOpen} className="sage-board-link">Open bookings<ArrowUpRight size={16}/></button>}</header>
 <div className="sage-board-tabs" aria-label="Reservation filters">{([{id:"all",name:"All"},{id:"review",name:"Needs review"},{id:"pickup",name:"Pickup flow"}] as const).map(tab=><button key={tab.id} aria-pressed={lane===tab.id} type="button" onClick={()=>setLane(tab.id)}>{tab.name}</button>)}</div>
 {loading?<div className="sage-board-message" role="status">Loading server records…</div>:error?<div className="sage-board-message" role="alert">Reservations could not be loaded. Refresh to retry.</div>:!rows.length?<div className="sage-board-message">No records in this filter. This does not confirm vehicle availability.</div>:<div className="sage-board-list">{rows.map((row,i)=>{
 const date=row.pickupAt?new Date(row.pickupAt):null;
 const pickup=date&&Number.isFinite(date.getTime())?date.toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"}):"Time not provided";
 return <div className="sage-board-row" key={row.id||row.bookingNumber||i}><span className="sage-row-index">{String(i+1).padStart(2,"0")}</span>
 <div className="sage-row-name"><strong>{row.bookingNumber||"Booking reference unavailable"}</strong><small>{row.customerName||"See customer in booking"}</small></div>
 <div className="sage-row-pickup"><small>Pickup</small><strong>{pickup}</strong></div>
 <span className={"sage-row-status "+laneOf(row.status)}>{labelStatus(row.status)}</span>
 {canOpen&&<button type="button" onClick={onOpen} className="sage-row-action" aria-label={"Open bookings to review "+(row.bookingNumber||"reservation")}><ChevronRight size={16}/></button>}</div>;
 })}</div>}
 <footer className="sage-board-foot">Snapshot of up to eight records from the booking API. Not a complete schedule; no simulated payments or possession.</footer>
 </section>;
}
