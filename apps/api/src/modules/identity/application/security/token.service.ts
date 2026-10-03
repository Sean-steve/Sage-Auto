// ============================================================================
// CAR HIRE OS — TOKEN MANAGEMENT SERVICE (DEV-004, SEC-007)
// Handles JWT access token lifecycle, cryptographic opaque refresh tokens,
// and token hashing with strict claim discipline
// ============================================================================

import crypto from "crypto";
import { AUTH_CONFIG } from "@carhire/constants";
import { UserJwtPayload } from "@carhire/types";
import { ITokenService } from "../../domain/ports";

export class TokenService implements ITokenService {
  private readonly jwtSecret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTokenTtlSec: number;

  private static getProductionLikeEnvironment(): boolean {
    const envName = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
    return envName === "production" || envName === "staging";
  }

  private static ensureProductionSafeJwtSecret(jwtSecret?: string): string {
    const resolved = jwtSecret || process.env.JWT_SECRET || "carhire-os-secure-dev-jwt-secret-key-32chars-min";
    const isProductionLike = TokenService.getProductionLikeEnvironment();
    const isWeakDefault =
      !resolved ||
      resolved.length < 32 ||
      resolved.includes("dev_jwt_secret") ||
      resolved.includes("development_only") ||
      resolved.includes("carhire-os-secure-dev-jwt-secret-key-32chars-min");

    if (isProductionLike && isWeakDefault) {
      throw new Error("Production/Staging JWT_SECRET must be explicitly set and at least 32 characters long.");
    }

    return resolved;
  }

  constructor(
    jwtSecret?: string,
    issuer: string = AUTH_CONFIG.JWT_ISSUER,
    audience: string = AUTH_CONFIG.JWT_AUDIENCE,
    accessTokenTtlSec: number = AUTH_CONFIG.ACCESS_TOKEN_TTL_SEC
  ) {
    this.jwtSecret = TokenService.ensureProductionSafeJwtSecret(jwtSecret);
    this.issuer = issuer;
    this.audience = audience;
    this.accessTokenTtlSec = accessTokenTtlSec;
  }

  /**
   * Helper to base64url encode buffers or strings
   */
  private base64UrlEncode(input: string | Buffer): string {
    const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
    return buf.toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  /**
   * Helper to base64url decode strings
   */
  private base64UrlDecode(input: string): string {
    let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    return Buffer.from(base64, "base64").toString("utf-8");
  }

  /**
   * Generates a signed short-lived Access JWT with minimal identity claims.
   * STRICT RULE: No tenant roles or permissions embedded in the token.
   */
  generateAccessToken(payload: {
    userId: string;
    sessionId: string;
    email: string;
    fullName: string;
    isPlatformStaff: boolean;
  }): string {
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + this.accessTokenTtlSec;

    const header = {
      alg: "HS256",
      typ: "JWT",
    };

    const claims: UserJwtPayload = {
      sub: payload.userId,
      sid: payload.sessionId,
      email: payload.email,
      fullName: payload.fullName,
      isPlatformStaff: payload.isPlatformStaff,
      iss: this.issuer,
      aud: this.audience,
      iat: nowSec,
      exp: expSec,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(claims));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
      .createHmac("sha256", this.jwtSecret)
      .update(unsignedToken)
      .digest();
    const encodedSignature = this.base64UrlEncode(signature);

    return `${unsignedToken}.${encodedSignature}`;
  }

  /**
   * Verifies and decodes an Access JWT.
   * Throws Error if signature is invalid, token is expired, or issuer/audience mismatch.
   */
  verifyAccessToken(token: string): UserJwtPayload {
    if (!token || typeof token !== "string") {
      throw new Error("TOKEN_MISSING");
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("TOKEN_MALFORMED");
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    // Verify signature with timingSafeEqual
    const expectedSignature = crypto
      .createHmac("sha256", this.jwtSecret)
      .update(unsignedToken)
      .digest();
    const expectedEncodedSig = this.base64UrlEncode(expectedSignature);

    if (
      expectedEncodedSig.length !== encodedSignature.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedEncodedSig), Buffer.from(encodedSignature))
    ) {
      throw new Error("INVALID_SIGNATURE");
    }


    // Parse header and payload
    const header = JSON.parse(this.base64UrlDecode(encodedHeader));
    if (header.alg !== "HS256") {
      throw new Error("UNSUPPORTED_ALGORITHM");
    }

    const claims: UserJwtPayload = JSON.parse(this.base64UrlDecode(encodedPayload));
    const nowSec = Math.floor(Date.now() / 1000);

    if (claims.exp && claims.exp < nowSec) {
      throw new Error("TOKEN_EXPIRED");
    }

    if (claims.iss !== this.issuer) {
      throw new Error("INVALID_ISSUER");
    }

    if (claims.aud !== this.audience) {
      throw new Error("INVALID_AUDIENCE");
    }

    return claims;
  }

  /**
   * Generates a cryptographically random opaque refresh token (64 hex characters / 256-bit entropy).
   */
  generateOpaqueRefreshToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Computes SHA-256 hash of a refresh token for safe database persistence.
   */
  hashRefreshToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Generates a unique Token Family ID for rotation tracking and reuse detection.
   */
  generateTokenFamilyId(): string {
    return crypto.randomUUID();
  }

  /**
   * Generates a generic cryptographically random token for password resets or email verification.
   */
  generateCryptoToken(byteLength: number = 32): string {
    return crypto.randomBytes(byteLength).toString("hex");
  }

  /**
   * Computes SHA-256 hash of generic crypto tokens.
   */
  hashCryptoToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
