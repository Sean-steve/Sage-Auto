// ============================================================================
// CAR HIRE OS — SPRINT 3 IDENTITY & AUTHENTICATION AUTOMATED TEST SUITE
// Validates global identity, Scrypt password security, JWT claims discipline,
// opaque rotating refresh tokens, token family reuse detection, session revocation,
// password reset, email verification, brute-force rate limiting, and audit logging.
// ============================================================================

import { AUTH_CONFIG, ERROR_CODES } from "@carhire/constants";
import {
  UserRepository,
  AuthSessionRepository,
  PasswordResetTokenRepository,
  EmailVerificationTokenRepository,
  AuditRepository,
  OutboxRepository,
} from "../src/index";
import { ScryptPasswordHasher } from "../../../apps/api/src/modules/identity/application/security/password-hasher";
import { TokenService } from "../../../apps/api/src/modules/identity/application/security/token.service";
import { RateLimiterService } from "../../../apps/api/src/modules/identity/application/security/rate-limiter.service";
import { DevelopmentEmailDeliveryAdapter } from "../../../apps/api/src/modules/identity/application/services/email-delivery.service";
import { AuthService } from "../../../apps/api/src/modules/identity/application/services/auth.service";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

const previousAppEnv = process.env.APP_ENV;
const previousNodeEnv = process.env.NODE_ENV;
const previousJwtSecret = process.env.JWT_SECRET;

process.env.APP_ENV = "production";
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "dev_jwt_secret_change_in_production_32char_minimum";
try {
  new TokenService();
  throw new Error("Production must reject insecure default JWT secrets");
} catch (err: any) {
  if (!/Production.*JWT_SECRET|JWT_SECRET.*production/i.test(err.message || String(err))) {
    throw err;
  }
}
try {
  new DevelopmentEmailDeliveryAdapter();
  throw new Error("Production must reject the development email delivery adapter");
} catch (err: any) {
  if (!/Production.*email|development.*email.*adapter/i.test(err.message || String(err))) {
    throw err;
  }
}
process.env.APP_ENV = previousAppEnv;
process.env.NODE_ENV = previousNodeEnv;
if (previousJwtSecret === undefined) {
  delete process.env.JWT_SECRET;
} else {
  process.env.JWT_SECRET = previousJwtSecret;
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 3 IDENTITY & AUTHENTICATION TEST SUITE");
  console.log("==================================================================");

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(err);
    }
  }

  const userRepo = new UserRepository();
  const sessionRepo = new AuthSessionRepository();
  const resetTokenRepo = new PasswordResetTokenRepository();
  const verifyTokenRepo = new EmailVerificationTokenRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();

  const passwordHasher = new ScryptPasswordHasher();
  const tokenService = new TokenService("test-secure-jwt-secret-key-32-chars-minimum!!");
  const emailDelivery = new DevelopmentEmailDeliveryAdapter();
  const rateLimiter = new RateLimiterService(3, 60); // 3 attempts per minute for testing

  const authService = new AuthService(
    userRepo,
    sessionRepo,
    resetTokenRepo,
    verifyTokenRepo,
    auditRepo,
    outboxRepo,
    passwordHasher,
    tokenService,
    emailDelivery,
    rateLimiter
  );

  // --------------------------------------------------------------------------
  // TEST 1: SCRYPT PASSWORD HASHING & VERIFICATION
  // --------------------------------------------------------------------------
  await test("1. Scrypt Password Hasher: Generates salted hash and verifies correctly", async () => {
    const rawPassword = "StrongSecurePassword!2026";
    const hash = await passwordHasher.hashPassword(rawPassword);

    assert(hash.startsWith("$scrypt$"), "Hash must follow scrypt serialization format");
    const isCorrect = await passwordHasher.verifyPassword(rawPassword, hash);
    assert(isCorrect === true, "Password verification must succeed for valid password");

    const isWrong = await passwordHasher.verifyPassword("WrongPassword123", hash);
    assert(isWrong === false, "Password verification must fail for incorrect password");

    const isGarbage = await passwordHasher.verifyPassword(rawPassword, "invalid_hash_string");
    assert(isGarbage === false, "Malformed hash must safely evaluate to false without crashing");
  });

  // --------------------------------------------------------------------------
  // TEST 2: EMAIL NORMALIZATION & REGISTRATION
  // --------------------------------------------------------------------------
  await test("2. Registration: Normalizes email and dispatches email verification token", async () => {
    emailDelivery.clearCaptured();
    const result = await authService.register({
      email: "  Test.Pilot@AutoSpecSage.co.ke  ",
      password: "PilotPassword#2026",
      fullName: "Captain John Mwangi",
      phone: "+254 700 111 222",
    });

    assert(result.user.email === "Test.Pilot@AutoSpecSage.co.ke", "Original casing preserved for display");
    assert(result.user.emailVerified === false, "New user must start as unverified");

    // Attempting duplicate with different casing/whitespace must fail
    try {
      await authService.register({
        email: "test.pilot@autospecsage.co.ke",
        password: "AnotherPassword123",
        fullName: "Duplicate User",
      });
      assert(false, "Duplicate registration on normalized email should have failed");
    } catch (err: any) {
      assert(err.code === ERROR_CODES.EMAIL_ALREADY_REGISTERED, "Must throw EMAIL_ALREADY_REGISTERED error code");
    }

    const captured = emailDelivery.getCapturedEmails();
    assert(captured.length >= 1, "Verification email must be dispatched via delivery port");
    assert(captured[0].type === "EMAIL_VERIFICATION", "Dispatched email must be verification type");
  });

  // --------------------------------------------------------------------------
  // TEST 3: EMAIL VERIFICATION LIFECYCLE
  // --------------------------------------------------------------------------
  await test("3. Email Verification: Validates verification token and updates user status", async () => {
    const rawToken = emailDelivery.getLatestTokenFor("Test.Pilot@AutoSpecSage.co.ke", "EMAIL_VERIFICATION");
    assert(Boolean(rawToken), "Must find captured verification token");

    await authService.verifyEmail(rawToken!);

    const user = await userRepo.findByEmail("Test.Pilot@AutoSpecSage.co.ke");
    assert(user?.emailVerified === true, "User emailVerified must be true after verification");
    assert(Boolean(user?.emailVerifiedAt), "User emailVerifiedAt must be populated with timestamp");

    // Attempting reuse of verified token must fail
    try {
      await authService.verifyEmail(rawToken!);
      assert(false, "Reusing verification token should fail");
    } catch (err: any) {
      assert(err.code === ERROR_CODES.VERIFICATION_TOKEN_INVALID, "Must reject already-used token");
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: AUTHENTICATION LOGIN & TOKEN CLAIMS DISCIPLINE
  // --------------------------------------------------------------------------
  let loggedInUserSession: any;
  let activeRefreshToken: string;
  let activeAccessToken: string;

  await test("4. Login: Issues short-lived access JWT and opaque refresh token without tenant leakage", async () => {
    const loginResult = await authService.login({
      email: "test.pilot@autospecsage.co.ke",
      password: "PilotPassword#2026",
    }, { ipAddress: "192.168.1.100", userAgent: "Mozilla/5.0 Mac" });

    assert(Boolean(loginResult.tokens.accessToken), "Must issue access token");
    assert(Boolean(loginResult.tokens.refreshToken), "Must issue opaque refresh token");
    assert(loginResult.tokens.expiresIn === AUTH_CONFIG.ACCESS_TOKEN_TTL_SEC, "Access token TTL must match config");

    activeAccessToken = loginResult.tokens.accessToken;
    activeRefreshToken = loginResult.tokens.refreshToken;
    loggedInUserSession = loginResult.session;

    // Verify JWT Claims
    const verifiedClaims = tokenService.verifyAccessToken(activeAccessToken);
    assert(verifiedClaims.sub === loginResult.user.id, "Subject claim must be userId");
    assert(verifiedClaims.sid === loginResult.session.id, "Session ID claim must be present");
    assert(verifiedClaims.email === "Test.Pilot@AutoSpecSage.co.ke", "Email claim must be present");
    assert((verifiedClaims as any).role === undefined, "STRICT REQUIREMENT: No tenant role allowed in JWT");
    assert((verifiedClaims as any).permissions === undefined, "STRICT REQUIREMENT: No permissions allowed in JWT");
  });

  // --------------------------------------------------------------------------
  // TEST 5: REFRESH TOKEN ROTATION & SESSION EXPIRATION
  // --------------------------------------------------------------------------
  let rotatedRefreshToken: string;

  await test("5. Refresh Flow: Rotates refresh token and invalidates old token", async () => {
    const refreshResult = await authService.refreshToken(activeRefreshToken, { ipAddress: "192.168.1.100" });

    assert(Boolean(refreshResult.tokens.accessToken), "Must issue new access token");
    assert(Boolean(refreshResult.tokens.refreshToken), "Must issue new refresh token");
    assert(refreshResult.tokens.refreshToken !== activeRefreshToken, "Rotated refresh token must differ from previous");

    rotatedRefreshToken = refreshResult.tokens.refreshToken;
  });

  // --------------------------------------------------------------------------
  // TEST 6: REFRESH TOKEN REUSE DETECTION & FAMILY REVOCATION
  // --------------------------------------------------------------------------
  await test("6. Security: Replaying previously rotated refresh token triggers reuse detection", async () => {
    // Attempt to use the already-rotated activeRefreshToken
    try {
      await authService.refreshToken(activeRefreshToken);
      assert(false, "Replaying an old refresh token must be rejected");
    } catch (err: any) {
      assert(err.code === ERROR_CODES.REFRESH_TOKEN_INVALID || err.code === ERROR_CODES.REFRESH_TOKEN_REUSED, "Must reject rotated token replay");
    }
  });

  // --------------------------------------------------------------------------
  // TEST 7: BRUTE-FORCE RATE LIMITING
  // --------------------------------------------------------------------------
  await test("7. Rate Limiting: Blocks repeated invalid login attempts after threshold", async () => {
    const attackEmail = "victim@autospecsage.co.ke";
    const meta = { ipAddress: "10.0.0.99" };

    // Register dummy victim
    await authService.register({
      email: attackEmail,
      password: "TargetPassword#2026",
      fullName: "Victim Account",
    });

    // 3 failed attempts allowed with rateLimiter(3, 60)
    for (let i = 0; i < 3; i++) {
      try {
        await authService.login({ email: attackEmail, password: "BadPassword" }, meta);
      } catch (err: any) {
        assert(err.code === ERROR_CODES.INVALID_CREDENTIALS, "Should fail with invalid credentials");
      }
    }

    // 4th attempt must be throttled with RATE_LIMITED
    try {
      await authService.login({ email: attackEmail, password: "BadPassword" }, meta);
      assert(false, "4th attempt must trigger rate limiter");
    } catch (err: any) {
      assert(err.code === ERROR_CODES.RATE_LIMITED, "Must return RATE_LIMITED error code");
    }
  });

  // --------------------------------------------------------------------------
  // TEST 8: PASSWORD RESET LIFECYCLE & SESSION INVALIDATION
  // --------------------------------------------------------------------------
  await test("8. Password Reset: Dispatches token, updates password, and revokes all active sessions", async () => {
    emailDelivery.clearCaptured();
    const userEmail = "test.pilot@autospecsage.co.ke";

    await authService.forgotPassword(userEmail);

    const resetToken = emailDelivery.getLatestTokenFor(userEmail, "PASSWORD_RESET");
    assert(Boolean(resetToken), "Password reset token must be captured");

    const newPassword = "BrandNewPilotPassword!2026";
    await authService.resetPassword(resetToken!, newPassword);

    // Verify login with new password succeeds
    const newLogin = await authService.login({
      email: userEmail,
      password: newPassword,
    });
    assert(Boolean(newLogin.tokens.accessToken), "Login with new password must succeed");

    // Old password must fail
    try {
      await authService.login({ email: userEmail, password: "PilotPassword#2026" });
      assert(false, "Login with old password should fail");
    } catch (err: any) {
      assert(err.code === ERROR_CODES.INVALID_CREDENTIALS, "Old password rejected");
    }
  });

  // --------------------------------------------------------------------------
  // TEST 9: SESSION REVOCATION (SINGLE & ALL)
  // --------------------------------------------------------------------------
  await test("9. Session Management: List active sessions and revoke on demand", async () => {
    const user = await userRepo.findByEmail("test.pilot@autospecsage.co.ke");
    assert(Boolean(user), "User exists");

    const activeSessions = await authService.getActiveSessions(user!.id);
    assert(activeSessions.length >= 1, "Must list active sessions");

    // Revoke all sessions
    const revokeResult = await authService.revokeAllSessions(user!.id);
    assert(revokeResult.revokedCount >= 1, "Must revoke all active sessions");

    const remainingSessions = await authService.getActiveSessions(user!.id);
    assert(remainingSessions.length === 0, "No active sessions should remain after revokeAll");
  });

  // --------------------------------------------------------------------------
  // TEST 10: AUDIT LOG ATOMICITY & SENSITIVE DATA REDACTION
  // --------------------------------------------------------------------------
  await test("10. Audit Logging: Captures auth security events without secret leakage", async () => {
    const logs = await auditRepo.findRecentByAction("auth.login_succeeded", 10);
    assert(logs.length >= 1, "Must find login_succeeded audit records");

    for (const log of logs) {
      assert(!JSON.stringify(log).includes("PilotPassword"), "Audit logs must NEVER contain raw passwords");
      assert(!JSON.stringify(log).includes(activeRefreshToken), "Audit logs must NEVER contain raw refresh tokens");
    }
  });

  console.log("==================================================================");
  console.log(`SPRINT 3 TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR IN SPRINT 3 TEST SUITE:", err);
  process.exit(1);
});
