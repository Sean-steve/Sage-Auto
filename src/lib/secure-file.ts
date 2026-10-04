import { apiClient } from "./api-client";

export type SecureResourceType =
  | "CUSTOMER" | "DRIVER" | "VEHICLE" | "VEHICLE_OWNER" | "BOOKING"
  | "CONTRACT" | "HANDOVER" | "RENTAL" | "INSPECTION" | "DAMAGE_CASE"
  | "MAINTENANCE" | "COMPLIANCE" | "INVOICE" | "EXPENSE" | "SETTLEMENT" | "WEBSITE";

export type SecureResourceRole =
  | "DRIVER_LICENCE_FRONT" | "DRIVER_LICENCE_BACK" | "ID_DOCUMENT_FRONT" | "ID_DOCUMENT_BACK"
  | "NATIONAL_ID" | "PASSPORT" | "VEHICLE_PHOTO" | "VEHICLE_LOGBOOK" | "INSURANCE_CERTIFICATE"
  | "CONTRACT_SIGNED_PDF" | "INSPECTION_PHOTO" | "DAMAGE_EVIDENCE" | "MAINTENANCE_INVOICE"
  | "EXPENSE_RECEIPT" | "SETTLEMENT_STATEMENT" | "WEBSITE_LOGO" | "OTHER";

function unwrap<T>(response:any):T {
  if(response?.error) throw new Error(response.error.message||"File operation failed.");
  return response?.data as T;
}

export async function uploadSecureResourceFile(args:{
  resourceType:SecureResourceType;
  resourceId:string;
  resourceRole?:SecureResourceRole;
  file:File;
  classification?:"PUBLIC"|"INTERNAL"|"CONFIDENTIAL"|"RESTRICTED";
}) {
  const {resourceType,resourceId,file}=args;
  if(!file.size) throw new Error("Choose a non-empty file.");
  if(file.size>15*1024*1024) throw new Error("Attachments must be 15 MB or smaller.");
  const contentType=file.type||"application/octet-stream";
  const intent:any=unwrap(await apiClient.post("/files/upload-intent",{
    resourceType,
    resourceId,
    resourceRole:args.resourceRole||"OTHER",
    originalFilename:file.name||"attachment",
    declaredContentType:contentType,
    declaredSizeBytes:file.size,
    classification:args.classification||"RESTRICTED",
    idempotencyKey:crypto.randomUUID(),
  }));
  const sessionId=intent.sessionId||intent.uploadSessionId;
  if(!sessionId) throw new Error("The upload session could not be created.");

  if(String(intent.uploadUrl||"").includes("storage.carhire-os.internal")){
    unwrap(await apiClient.uploadBinary(`/files/upload-session/${sessionId}`,file,contentType));
  }else{
    const response=await fetch(intent.uploadUrl,{
      method:intent.uploadMethod||"PUT",
      headers:intent.headers||{"Content-Type":contentType},
      body:file,
    });
    if(!response.ok)throw new Error("The attachment could not be uploaded.");
  }

  const finalized:any=unwrap(await apiClient.post("/files/finalize-upload",{sessionId,actualSizeBytes:file.size}));
  const fileId=finalized.fileId||finalized.file?.id||intent.fileId;
  if(!fileId)throw new Error("The attachment uploaded but no file reference was returned.");
  return {fileId,fileReference:`file:${fileId}`,fileName:file.name,contentType};
}

export async function openAttachmentReference(reference?:string|null){
  if(!reference)return;
  if(reference.startsWith("file:")){
    const fileId=reference.slice(5);
    const response:any=await apiClient.get(`/files/${encodeURIComponent(fileId)}/download-url?disposition=inline`);
    const ticket:any=unwrap(response);
    if(!ticket?.downloadUrl)throw new Error("A secure download link could not be generated.");
    window.open(ticket.downloadUrl,"_blank","noopener,noreferrer");
    return;
  }
  window.open(reference,"_blank","noopener,noreferrer");
}
