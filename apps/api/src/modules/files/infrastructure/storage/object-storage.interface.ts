// ============================================================================
// CAR HIRE OS — OBJECT STORAGE DRIVER INTERFACE (ARCH-001, DATA-001, SEC-001)
// Cloud-agnostic contract for multi-tenant private object storage
// ============================================================================

export interface PutObjectParams {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface PutObjectResult {
  etag?: string;
  versionId?: string;
}

export interface GetObjectParams {
  bucket: string;
  key: string;
}

export interface GetObjectResult {
  body: Buffer;
  contentType: string;
  contentLength: number;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface HeadObjectParams {
  bucket: string;
  key: string;
}

export interface HeadObjectResult {
  contentLength: number;
  contentType: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface DeleteObjectParams {
  bucket: string;
  key: string;
}

export interface CopyObjectParams {
  sourceBucket: string;
  sourceKey: string;
  destinationBucket: string;
  destinationKey: string;
}

export interface CreateSignedUploadUrlParams {
  bucket: string;
  key: string;
  contentType: string;
  maxSizeBytes: number;
  expiresInSeconds: number;
}

export interface CreateSignedUploadUrlResult {
  uploadUrl: string;
  uploadMethod: "PUT" | "POST";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface CreateSignedDownloadUrlParams {
  bucket: string;
  key: string;
  expiresInSeconds: number;
  disposition?: "inline" | "attachment";
  filename?: string;
}

export interface ListObjectsParams {
  bucket: string;
  prefix?: string;
  maxKeys?: number;
}

export interface ListObjectsResult {
  keys: string[];
  isTruncated: boolean;
}

export interface IObjectStorageDriver {
  putObject(params: PutObjectParams): Promise<PutObjectResult>;
  getObject(params: GetObjectParams): Promise<GetObjectResult>;
  headObject(params: HeadObjectParams): Promise<HeadObjectResult | null>;
  deleteObject(params: DeleteObjectParams): Promise<void>;
  copyObject(params: CopyObjectParams): Promise<void>;
  moveObject(params: CopyObjectParams): Promise<void>;
  listObjects(params: ListObjectsParams): Promise<ListObjectsResult>;
  createSignedUploadUrl(params: CreateSignedUploadUrlParams): Promise<CreateSignedUploadUrlResult>;
  createSignedDownloadUrl(params: CreateSignedDownloadUrlParams): Promise<string>;
  objectExists(bucket: string, key: string): Promise<boolean>;
}
