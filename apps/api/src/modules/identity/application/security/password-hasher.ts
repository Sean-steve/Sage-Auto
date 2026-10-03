// ============================================================================
// CAR HIRE OS — CRYPTOGRAPHIC PASSWORD HASHER (SEC-007, DEV-004)
// Implements secure salted key derivation with timing-attack resistant verification
// ============================================================================

import crypto from "crypto";
import { IPasswordHasher } from "../../domain/ports";

export class ScryptPasswordHasher implements IPasswordHasher {
  private readonly keyLength = 64;
  private readonly saltLength = 32;
  private readonly scryptOptions: crypto.ScryptOptions = {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  };

  /**
   * Hashes a plaintext password using salted scrypt derivation.
   * Returns standard serialized format: $scrypt$N=16384,r=8,p=1$<saltHex>$<hashHex>
   */
  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(this.saltLength).toString("hex");

    return new Promise((resolve, reject) => {
      crypto.scrypt(
        password,
        salt,
        this.keyLength,
        this.scryptOptions,
        (err, derivedKey) => {
          if (err) return reject(err);
          const hash = derivedKey.toString("hex");
          resolve(`$scrypt$N=${this.scryptOptions.N},r=${this.scryptOptions.r},p=${this.scryptOptions.p}$${salt}$${hash}`);
        }
      );
    });
  }

  /**
   * Verifies a plaintext password against a stored scrypt hash using constant-time comparison.
   */
  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    if (!storedHash || !storedHash.startsWith("$scrypt$")) {
      return false;
    }

    const parts = storedHash.split("$");
    if (parts.length !== 5) {
      return false;
    }

    const salt = parts[3];
    const originalHashHex = parts[4];
    const originalHash = Buffer.from(originalHashHex, "hex");

    return new Promise((resolve) => {
      crypto.scrypt(
        password,
        salt,
        originalHash.length,
        this.scryptOptions,
        (err, derivedKey) => {
          if (err) return resolve(false);
          try {
            const isMatch = crypto.timingSafeEqual(originalHash, derivedKey);
            resolve(isMatch);
          } catch {
            resolve(false);
          }
        }
      );
    });
  }
}
