import React from 'react';

/** One page title; descriptions explain the task rather than repeat its name. */
export function PageHeader({title,children,description,actions}:{title?:React.ReactNode;children?:React.ReactNode;description?:React.ReactNode;actions?:React.ReactNode}) {
  return <div className="page-header"><div className="page-header-copy"><h1>{title ?? children}</h1>{description&&<p>{description}</p>}</div>{actions&&<div className="page-header-actions">{actions}</div>}</div>;
}

export function sectionLabel(id:string,fallback:string) {
  return ({fleet:'Fleet',bookings:'Bookings',rentals:'Rentals',returns:'Returns',finance:'Finance',settlements:'Settlements',settings:'Settings',pricing:'Pricing',availability:'Availability',team:'Team',handover:'Contract & handover'} as Record<string,string>)[id]||fallback;
}
