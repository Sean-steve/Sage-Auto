// ============================================================================
// CAR HIRE OS — DNS VERIFICATION ENGINE (DEV-009, TEN-001)
// Cryptographic token challenges, DNS lookups, and simulation interface
// ============================================================================

import { randomUUID } from "crypto";
import { WebsiteDomainRecord } from "@car-hire-os/types";

export interface DnsLookupResult {
  txtMatched: boolean;
  cnameMatched: boolean;
  observedTxtValues: string[];
  observedCnameTarget?: string;
  error?: string;
}

export interface IDnsResolver {
  resolveTxt(hostname: string): Promise<string[]>;
  resolveCname(hostname: string): Promise<string | null>;
}

export class DefaultDnsResolver implements IDnsResolver {
  // In a live production deployment, this uses Node's 'dns/promises'
  async resolveTxt(hostname: string): Promise<string[]> {
    return [];
  }

  async resolveCname(hostname: string): Promise<string | null> {
    return null;
  }
}

export class DnsVerificationService {
  constructor(
    private readonly platformCnameTarget: string = "cname.carhireos.com",
    private readonly dnsResolver: IDnsResolver = new DefaultDnsResolver()
  ) {}

  /**
   * Generates a unique, high-entropy cryptographic challenge token
   */
  generateChallenge(hostname: string): {
    verificationToken: string;
    expectedTxtRecord: string;
    expectedCnameRecord: string;
    challengeHostname: string;
  } {
    const token = `ch-verify-${randomUUID().replace(/-/g, "")}`;
    return {
      verificationToken: token,
      expectedTxtRecord: `carhire-verification=${token}`,
      expectedCnameRecord: this.platformCnameTarget,
      challengeHostname: `_carhireos-challenge.${hostname}`,
    };
  }

  /**
   * Verifies DNS records for a custom domain.
   * Supports simulated execution for offline test environments.
   */
  async verifyDnsChallenge(
    domain: WebsiteDomainRecord,
    options: {
      simulate?: boolean;
      simulateSuccess?: boolean;
      failureReason?: string;
    } = {}
  ): Promise<DnsLookupResult> {
    if (options.simulate) {
      if (options.simulateSuccess !== false) {
        return {
          txtMatched: true,
          cnameMatched: true,
          observedTxtValues: [domain.expectedTxtRecord],
          observedCnameTarget: domain.expectedCnameRecord,
        };
      } else {
        return {
          txtMatched: false,
          cnameMatched: false,
          observedTxtValues: [],
          error:
            options.failureReason ||
            "TXT record matching verification token not found in DNS zone.",
        };
      }
    }

    try {
      const challengeHost = `_carhireos-challenge.${domain.hostname}`;
      const txtRecords = await this.dnsResolver.resolveTxt(challengeHost);
      const txtMatched = txtRecords.some(
        (val) => val === domain.expectedTxtRecord || val.includes(domain.verificationToken)
      );

      const cnameTarget = await this.dnsResolver.resolveCname(domain.hostname);
      const cnameMatched =
        cnameTarget?.toLowerCase().replace(/\.$/, "") ===
        domain.expectedCnameRecord.toLowerCase().replace(/\.$/, "");

      return {
        txtMatched,
        cnameMatched,
        observedTxtValues: txtRecords,
        observedCnameTarget: cnameTarget || undefined,
        error: !txtMatched
          ? `Expected TXT record '${domain.expectedTxtRecord}' at '${challengeHost}', but received [${txtRecords.join(
              ", "
            )}]`
          : undefined,
      };
    } catch (err: any) {
      return {
        txtMatched: false,
        cnameMatched: false,
        observedTxtValues: [],
        error: `DNS query failed: ${err.message}`,
      };
    }
  }
}
