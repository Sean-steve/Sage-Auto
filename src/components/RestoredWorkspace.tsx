import React, { lazy, Suspense } from 'react';
import { Building2, ChevronLeft, LogOut } from 'lucide-react';
import { AppProvider, useApp } from '../lib/store';
import { RESTORATION_SCREEN_CONNECTIONS, type AccessContext, type AccessPortal } from '../lib/access-context';

const screens: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  overview:lazy(()=>import('./DashboardView').then(m=>({default:m.DashboardView}))),
  fleet:lazy(()=>import('./FleetView').then(m=>({default:m.FleetView}))),
  bookings:lazy(()=>import('./BookingsView').then(m=>({default:m.BookingsView}))),
  customers:lazy(()=>import('./CustomersView').then(m=>({default:m.CustomersView}))),
  rentals:lazy(()=>import('./RentalsView').then(m=>({default:m.RentalsView}))),
  inspections:lazy(()=>import('./InspectionsView').then(m=>({default:m.InspectionsView}))),
  maintenance:lazy(()=>import('./MaintenanceView').then(m=>({default:m.MaintenanceView}))),
  compliance:lazy(()=>import('./ComplianceView').then(m=>({default:m.ComplianceView}))),
  owners:lazy(()=>import('./VehicleOwnersView').then(m=>({default:m.VehicleOwnersView}))),
  finance:lazy(()=>import('./FinanceView').then(m=>({default:m.FinanceView}))),
  settlements:lazy(()=>import('./SettlementsView').then(m=>({default:m.SettlementsView}))),
  pricing:lazy(()=>import('./PricingView').then(m=>({default:m.PricingView}))),
  availability:lazy(()=>import('./AvailabilityView').then(m=>({default:m.AvailabilityView}))),
  website:lazy(()=>import('./PublicWebsiteView').then(m=>({default:m.PublicWebsiteView}))),
  settings:lazy(()=>import('./WorkspaceSettingsView').then(m=>({default:m.WorkspaceSettingsView}))),
};
function Screen({section}:{section:string}) {
  const {workspaceLoading,workspaceError,searchQuery,setSearchQuery}=useApp();
  const View=screens[section];
  const connection=RESTORATION_SCREEN_CONNECTIONS[section] || {status:'UNCONNECTED',readSource:'Not verified',mutationsEnabled:false,note:'This screen has not been connected yet.'};
  if(workspaceLoading)return <p role="status" className="p-8">Loading saved workspace records…</p>;
  return <>{workspaceError&&<p role="alert" className="m-6 rounded border border-red-200 bg-red-50 p-4 text-red-900">{workspaceError}</p>}
    <div id="restoration-actions-note" className="m-6 rounded border border-amber-200 bg-amber-50 p-4 text-amber-950"><strong>Original screen — {connection.status.replaceAll('_',' ').toLowerCase()}</strong><p>{connection.note}</p><p><small>Read source: {connection.readSource}. Mutations: {connection.mutationsEnabled?'verified and enabled':'disabled until the mutation acceptance gate passes'}.</small></p></div>
    {['fleet','bookings','customers'].includes(section)&&<label className="block mx-6 text-sm">Search saved records<input className="block mt-1 border rounded px-3 py-2" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/></label>}
    {View?<fieldset disabled={!connection.mutationsEnabled} aria-describedby="restoration-actions-note" className="min-w-0 border-0 p-0"><Suspense fallback={<p role="status" className="p-8">Opening your screen…</p>}><View/></Suspense></fieldset>:<p className="p-8">This role's workflow is not connected yet.</p>}
  </>;
}
export function RestoredWorkspace({context,portal,section,onSection,onSwitch,onSignOut}:{context:AccessContext;portal:AccessPortal;section:string;onSection:(s:string)=>void;onSwitch:()=>void;onSignOut:()=>void}) {
  if(!portal.sections.some(s=>s.id===section))return <p role="alert">This section is not permitted.</p>;
  return <AppProvider access={{context,portal,section,onSection}}><div className="access-workspace bg-slate-50 text-slate-900">
    <aside className="access-sidebar"><button className="access-back" onClick={onSwitch}><ChevronLeft size={16}/>Switch workspace</button><h2><Building2 size={20}/>{portal.name}</h2><p>{portal.roles.join(' · ').replaceAll('_',' ')}</p><nav aria-label="Workspace navigation">{portal.sections.map(s=><button key={s.id} aria-current={section===s.id?'page':undefined} onClick={()=>onSection(s.id)}>{s.label}</button>)}</nav><button className="access-back" onClick={onSignOut}><LogOut size={16}/>Sign out</button></aside>
    <main className="min-w-0 overflow-x-auto"><Screen key={section} section={section}/></main>
  </div></AppProvider>;
}
