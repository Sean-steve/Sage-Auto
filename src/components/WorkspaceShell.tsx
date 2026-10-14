import React, {useEffect,useRef,useState} from 'react';
import {ArrowLeftRight,ChevronDown,LogOut,Menu,X} from 'lucide-react';
import type {AccessContext,AccessPortal} from '../lib/access-context';
import {sectionLabel} from './PageHeader';

export function WorkspaceShell({context,portal,section,onSection,onSwitch,onSignOut,groups,children}:{context:AccessContext;portal:AccessPortal;section:string;onSection:(id:string)=>void;onSwitch:()=>void;onSignOut:()=>void;groups?:{label:string;ids:string[]}[];children:React.ReactNode}) {
  const [open,setOpen]=useState(false);
  const drawer=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const account=useRef<HTMLDetailsElement>(null);
  const sections=new Map(portal.sections.map(s=>[s.id,s]));
  const navigation=groups||[{label:'',ids:portal.sections.map(s=>s.id)}];
  useEffect(()=>{if(!open)return;const dialog=drawer.current!;dialog.showModal();document.body.style.overflow='hidden';const closeOnDesktop=()=>{if(window.innerWidth>=1024)setOpen(false);};window.addEventListener('resize',closeOnDesktop);return()=>{dialog.close();document.body.style.overflow='';window.removeEventListener('resize',closeOnDesktop);trigger.current?.focus();};},[open]);
  useEffect(()=>{setOpen(false);if(account.current)account.current.open=false;},[portal.id,section]);
  const nav=(mobile=false)=><aside className="workspace-sidebar">
    <div className="workspace-identity"><span className="workspace-logo" aria-hidden="true">S</span><div><strong>Sage Auto</strong><p>{portal.name}</p></div>{mobile&&<button autoFocus aria-label="Close navigation" onClick={()=>setOpen(false)}><X size={20}/></button>}</div>
    <nav aria-label={mobile?'Mobile workspace navigation':'Workspace navigation'}>{navigation.map(group=><div className="workspace-nav-group" key={group.label}>{group.label&&<p>{group.label}</p>}{group.ids.filter(id=>sections.has(id)).map(id=><button key={id} aria-current={section===id?'page':undefined} onClick={()=>{onSection(id);setOpen(false);}}>{sectionLabel(id,sections.get(id)!.label)}</button>)}</div>)}</nav>
  </aside>;
  return <div className="workspace-shell"><a className="workspace-skip" href="#workspace-content">Skip to content</a><div className="workspace-desktop-nav">{nav()}</div>
    <dialog ref={drawer} className="workspace-drawer" aria-label="Navigation" onCancel={()=>setOpen(false)} onKeyDown={e=>{
      if(e.key!=='Tab')return;
      const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'));
      const first=items[0],last=items[items.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }} onClick={e=>{if(e.target===drawer.current)setOpen(false);}}>{nav(true)}</dialog>
    <div className="workspace-body"><header className="workspace-topbar"><div className="workspace-topbar-start"><button ref={trigger} className="workspace-menu-trigger" aria-label="Open navigation" aria-expanded={open} onClick={()=>setOpen(true)}><Menu size={20}/></button><button className="workspace-switch" onClick={onSwitch}><ArrowLeftRight size={16}/>Switch workspace</button></div>
      <details ref={account} className="workspace-account" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}><summary><span className="workspace-avatar" aria-hidden="true">{context.user.fullName.split(/\s+/).map(w=>w[0]).join('').slice(0,2)}</span><span>{context.user.fullName}</span><ChevronDown size={14}/></summary><div className="workspace-account-panel"><strong>{context.user.email}</strong><p>{portal.roles.map(r=>r.replaceAll('_',' ').toLowerCase()).join(', ')}</p><p>{context.user.emailVerified?'Email verified':'Email not verified'}</p><button onClick={onSignOut}><LogOut size={16}/>Sign out</button></div></details>
    </header><main id="workspace-content" tabIndex={-1}>{children}</main></div></div>;
}
