// ============================================================================
// CAR HIRE OS — IN-MEMORY OBJECT STORAGE DRIVER (ARCH-001, DEV-001, SEC-001)
// Deterministic in-memory storage simulator with signed URL validation
// ============================================================================

import crypto from "node:crypto";
import {
  IObjectStorageDriver,
  PutObjectParams,
  PutObjectResult,
  GetObjectParams,
  GetObjectResult,
  HeadObjectParams,
  HeadObjectResult,
  DeleteObjectParams,
  CopyObjectParams,
  ListObjectsParams,
  ListObjectsResult,
  CreateSignedUploadUrlParams,
  CreateSignedUploadUrlResult,
  CreateSignedDownloadUrlParams,
} from "./object-storage.interface";

interface StoredObject {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
  etag: string;
  lastModified: Date;
  metadata?: Record<string, string>;
}

export class InMemoryObjectStorageDriver implements IObjectStorageDriver {
  private static sharedObjects = new Map<string, StoredObject>();
  private objects: Map<string, StoredObject>;
  private secretKey: string;
  private baseUrl: string;

  constructor(options?: { secretKey?: string; baseUrl?: string; isolate?: boolean }) {
    this.secretKey = options?.secretKey || "simulated-s3-secret-key-carhire-2026";
    this.baseUrl = options?.baseUrl || "https://storage.carhire-os.internal";
    this.objects = options?.isolate ? new Map<string, StoredObject>() : InMemoryObjectStorageDriver.sharedObjects;
  }

  public clear(): void {
    this.objects.clear();
  }

  public static clear(): void {
    InMemoryObjectStorageDriver.sharedObjects.clear();
  }

  private makeCompositeKey(bucket: string, key: string): string {
    return `${bucket}:::${key}`;
  }

  async putObject(params: PutObjectParams): Promise<PutObjectResult> {
    const etag = crypto.createHash("md5").update(params.body).digest("hex");
    const compositeKey = this.makeCompositeKey(params.bucket, params.key);

    this.objects.set(compositeKey, {
      bucket: params.bucket,
      key: params.key,
      body: Buffer.from(params.body),
      contentType: params.contentType,
      etag,
      lastModified: new Date(),
      metadata: params.metadata,
    });

    return { etag };
  }

  async getObject(params: GetObjectParams): Promise<GetObjectResult> {
    const compositeKey = this.makeCompositeKey(params.bucket, params.key);
    const obj = this.objects.get(compositeKey);
    if (!obj) {
      throw new Error(`NoSuchKey: The specified key does not exist. (${params.bucket}/${params.key})`);
    }

    return {
      body: Buffer.from(obj.body),
      contentType: obj.contentType,
      contentLength: obj.body.length,
      etag: obj.etag,
      lastModified: obj.lastModified,
      metadata: obj.metadata,
    };
  }

  async headObject(params: HeadObjectParams): Promise<HeadObjectResult | null> {
    const compositeKey = this.makeCompositeKey(params.bucket, params.key);
    const obj = this.objects.get(compositeKey);
    if (!obj) return null;

    return {
      contentLength: obj.body.length,
      contentType: obj.contentType,
      etag: obj.etag,
      lastModified: obj.lastModified,
      metadata: obj.metadata,
    };
  }

  async deleteObject(params: DeleteObjectParams): Promise<void> {
    const compositeKey = this.makeCompositeKey(params.bucket, params.key);
    this.objects.delete(compositeKey);
  }

  async copyObject(params: CopyObjectParams): Promise<void> {
    const sourceObj = await this.getObject({
      bucket: params.sourceBucket,
      key: params.sourceKey,
    });

    await this.putObject({
      bucket: params.destinationBucket,
      key: params.destinationKey,
      body: sourceObj.body,
      contentType: sourceObj.contentType,
      metadata: sourceObj.metadata,
    });
  }

  async moveObject(params: CopyObjectParams): Promise<void> {
    await this.copyObject(params);
    await this.deleteObject({
      bucket: params.sourceBucket,
      key: params.sourceKey,
    });
  }

  async objectExists(bucket: string, key: string): Promise<boolean> {
    const compositeKey = this.makeCompositeKey(bucket, key);
    return this.objects.has(compositeKey);
  }

  async listObjects(params: ListObjectsParams): Promise<ListObjectsResult> {
    const prefix = params.prefix || "";
    const matchedKeys: string[] = [];

    for (const [compositeKey, obj] of this.objects.entries()) {
      if (obj.bucket === params.bucket && obj.key.startsWith(prefix)) {
        matchedKeys.push(obj.key);
      }
    }

    const maxKeys = params.maxKeys || 1000;
    const isTruncated = matchedKeys.length > maxKeys;
    return {
      keys: matchedKeys.slice(0, maxKeys),
      isTruncated,
    };
  }

  async createSignedUploadUrl(params: CreateSignedUploadUrlParams): Promise<CreateSignedUploadUrlResult> {
    const expiresAt = new Date(Date.now() + params.expiresInSeconds * 1000).toISOString();
    const tokenPayload = `${params.bucket}:${params.key}:${params.contentType}:${params.maxSizeBytes}:${expiresAt}`;
    const signature = crypto.createHmac("sha256", this.secretKey).update(tokenPayload).digest("hex");

    const searchParams = new URLSearchParams({
      bucket: params.bucket,
      key: params.key,
      expiresAt,
      maxSizeBytes: String(params.maxSizeBytes),
      signature,
    });

    const uploadUrl = `${this.baseUrl}/upload?${searchParams.toString()}`;

    return {
      uploadUrl,
      uploadMethod: "PUT",
      headers: {
        "Content-Type": params.contentType,
        "x-amz-acl": "private",
      },
      expiresAt,
    };
  }

  async createSignedDownloadUrl(params: CreateSignedDownloadUrlParams): Promise<string> {
    const expiresAt = new Date(Date.now() + params.expiresInSeconds * 1000).toISOString();
    const disposition = params.disposition || "attachment";
    const filename = params.filename ? encodeURIComponent(params.filename) : "";

    const tokenPayload = `${params.bucket}:${params.key}:${disposition}:${filename}:${expiresAt}`;
    const signature = crypto.createHmac("sha256", this.secretKey).update(tokenPayload).digest("hex");

    const searchParams = new URLSearchParams({
      bucket: params.bucket,
      key: params.key,
      expires: expiresAt,
      expiresAt,
      disposition,
      filename,
      signature,
    });

    return `${this.baseUrl}/download?${searchParams.toString()}`;
  }

  /**
   * Helper for tests: simulates the client performing a PUT to the signed upload URL.
   * Verifies signature, expiration, and stores the buffer in memory.
   */
  public async simulateClientUpload(uploadUrl: string, body: Buffer, contentType: string): Promise<PutObjectResult> {
    const url = new URL(uploadUrl);
    const bucket = url.searchParams.get("bucket")!;
    const key = url.searchParams.get("key")!;
    const expiresAt = url.searchParams.get("expiresAt")!;
    const maxSizeBytes = Number(url.searchParams.get("maxSizeBytes")!);
    const signature = url.searchParams.get("signature")!;

    // Check expiration
    if (new Date(expiresAt).getTime() < Date.now()) {
      throw new Error("Signed upload URL has expired.");
    }

    // Check signature
    const tokenPayload = `${bucket}:${key}:${contentType}:${maxSizeBytes}:${expiresAt}`;
    const expectedSig = crypto.createHmac("sha256", this.secretKey).update(tokenPayload).digest("hex");
    if (signature !== expectedSig) {
      throw new Error("Invalid upload signature.");
    }

    // Check size limit
    if (body.length > maxSizeBytes) {
      throw new Error(`Upload payload exceeds maximum allowed size of ${maxSizeBytes} bytes.`);
    }

    return this.putObject({ bucket, key, body, contentType });
  }

  /**
   * Helper for tests: simulates the client downloading from the signed URL.
   */
  public async simulateClientDownload(downloadUrl: string): Promise<{ body: Buffer; contentType: string; disposition: string }> {
    const url = new URL(downloadUrl);
    const bucket = url.searchParams.get("bucket")!;
    const key = url.searchParams.get("key")!;
    const expiresAt = url.searchParams.get("expiresAt")!;
    const disposition = url.searchParams.get("disposition") || "attachment";
    const filename = url.searchParams.get("filename") || "";
    const signature = url.searchParams.get("signature")!;

    if (new Date(expiresAt).getTime() < Date.now()) {
      throw new Error("Signed download URL has expired.");
    }

    const tokenPayload = `${bucket}:${key}:${disposition}:${filename}:${expiresAt}`;
    const expectedSig = crypto.createHmac("sha256", this.secretKey).update(tokenPayload).digest("hex");
    if (signature !== expectedSig) {
      throw new Error("Invalid download signature.");
    }

    const obj = await this.getObject({ bucket, key });
    return {
      body: obj.body,
      contentType: obj.contentType,
      disposition,
    };
  }
}
