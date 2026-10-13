import { apiClient, type ApiResponse } from "../lib/api-client";
import { permits, type AccessPortal } from "../lib/access-context";
import { mayOpen } from "./registry";
/** Backend guards remain the authority; this boundary also rejects stale tenant UI actions. */
export function requireWorkspace(portal:AccessPortal,permission:string,section?:string):void {
 if(portal.kind!=="tenant"||!portal.tenantId||apiClient.getTenantId()!==portal.tenantId)throw new Error("Select your company workspace again.");
 if(!permits(portal,permission)||(section&&!mayOpen(portal,section)))throw new Error("You do not have permission for this action.");
}
function requirePath(path:string){if(!path.startsWith("/")||path.startsWith("//"))throw new Error("Use only internal API paths.");}
export async function workspaceRead<T>(portal:AccessPortal,permission:string,path:string,section?:string):Promise<ApiResponse<T>>{
 requireWorkspace(portal,permission,section);requirePath(path);return apiClient.get<T>(path);
}
export async function workspaceCommand<T>(portal:AccessPortal,permission:string,path:string,body:unknown,section?:string):Promise<ApiResponse<T>>{
 requireWorkspace(portal,permission,section);requirePath(path);return apiClient.post<T>(path,body);
}
export function requireData<T>(response:ApiResponse<T>):T {
 if(response.error)throw new Error(response.error.message||"The request failed.");
 if(response.data===undefined)throw new Error("The server returned no data.");
 return response.data;
}
