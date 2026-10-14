import { useEffect } from "react";
/** Tenant-checked refresh listener: the active module re-reads its canonical API state. */
export function useOperationalSync(tenantId:string,refresh:()=>Promise<unknown>|void){
  useEffect(()=>{
    const onSync=(event:Event)=>{
      const detail=(event as CustomEvent<{tenantId?:string}>).detail;
      if(detail?.tenantId===tenantId)void refresh();
    };
    window.addEventListener("sage:operational-sync",onSync);
    return()=>window.removeEventListener("sage:operational-sync",onSync);
  },[tenantId,refresh]);
}
