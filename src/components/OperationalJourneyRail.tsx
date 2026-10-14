import React from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { AccessPortal } from "../lib/access-context";
const stages=[
  {id:"pricing",label:"Pricing"},
  {id:"availability",label:"Availability"},
  {id:"bookings",label:"Booking"},
  {id:"handover",label:"Handover"},
  {id:"rentals",label:"Rental"},
  {id:"returns",label:"Return"},
  {id:"finance",label:"Finance"},
  {id:"settlements",label:"Owner settlement"},
];
/** Workflow navigation, not a simulated state machine. All operations stay with their canonical modules. */
export function OperationalJourneyRail({portal,section,onSection,onSync}:{portal:AccessPortal;section:string;onSection:(s:string)=>void;onSync:()=>void}) {
  const permitted=new Set(portal.sections.map(s=>s.id));
  const visible=stages.filter(stage=>permitted.has(stage.id));
  if(visible.length<2)return null;
  return <div className="sage-journey-frame">
    <div className="sage-journey-label"><span>Rental lifecycle</span><button type="button" onClick={onSync} aria-label="Refresh current operational module"><RefreshCw size={13}/>Sync module</button></div>
    <nav className="sage-journey-rail" aria-label="Rental lifecycle navigation">
      {visible.map((stage,index)=><React.Fragment key={stage.id}>
        {index>0&&<ArrowRight aria-hidden="true" size={13} className="sage-journey-arrow"/>}
        <button type="button" aria-current={section===stage.id?"step":undefined} onClick={()=>onSection(stage.id)}>{stage.label}</button>
      </React.Fragment>)}
    </nav>
    <p className="sage-journey-disclaimer">Each step reads its own authoritative records. Moving between steps does not change a booking, payment, rental or owner payout.</p>
  </div>;
}
