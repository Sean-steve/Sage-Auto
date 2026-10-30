import assert from "node:assert/strict";
import { ACCESS_SECTIONS, ROLE_SECTIONS, accessSections } from "../../../packages/constants/src/access";
import { PLATFORM_ROLES, TENANT_SYSTEM_ROLES } from "../../../packages/constants/src/roles";

const phase2Sections = [
  "overview", "companies", "plans", "platformBilling", "platformAnalytics",
  "platformEntitlements", "platformIntegrations", "platformJobs",
  "platformIncidents", "platformNotifications", "team", "support",
  "platformAudit", "platformCompliance", "platformSettings",
];

for (const section of phase2Sections) {
  assert.ok(ACCESS_SECTIONS[section], "Missing platform route contract: " + section);
  assert.ok(ROLE_SECTIONS.PLATFORM_OWNER.includes(section), "Owner missing route: " + section);
}
const ownerPermissions = PLATFORM_ROLES.PLATFORM_OWNER.defaultPermissions;
const available = accessSections(["PLATFORM_OWNER"], ownerPermissions).map(s => s.id);
assert.deepEqual([...phase2Sections].sort(), phase2Sections.filter(s => available.includes(s)).sort(),
  "The platform owner should retain all permission-enabled control plane screens.");

for (const section of phase2Sections) {
  if (section === "overview" || section === "team") continue;
  const permission = ACCESS_SECTIONS[section].permission;
  assert.ok(permission?.startsWith("platform."), "Privileged section must be permission-filtered: " + section);
  assert.ok(!accessSections(["PLATFORM_OWNER"], []).map(s => s.id).includes(section),
    "A user without a required permission cannot see " + section);
}
for (const role of Object.keys(TENANT_SYSTEM_ROLES).concat("RENTER")) {
  const nav = accessSections([role], ["*"]).map(s => s.id);
  assert.equal(nav.filter(s => phase2Sections.includes(s) && s !== "overview" && s !== "team").length,
    0, "Tenant and renter identities may not enter platform control-plane screens: " + role);
}
const billingNav = accessSections(["BILLING_ADMIN"], PLATFORM_ROLES.BILLING_ADMIN.defaultPermissions).map(s => s.id);
assert.ok(billingNav.includes("platformBilling"));
assert.ok(!billingNav.includes("platformSettings"), "Billing staff must not gain global configuration access.");
const supportNav = accessSections(["SUPPORT_ADMIN"], PLATFORM_ROLES.SUPPORT_ADMIN.defaultPermissions).map(s => s.id);
assert.ok(supportNav.includes("support"));
assert.ok(!supportNav.includes("platformBilling"), "Support agents must not gain billing administration.");
const restrictedAdmin = accessSections(["PLATFORM_ADMIN"], ["platform.tenant.read"]).map(s => s.id);
assert.ok(restrictedAdmin.includes("companies"));
assert.ok(!restrictedAdmin.includes("platformBilling"));
assert.ok(!restrictedAdmin.includes("platformJobs"));
console.log("PASS: phase 2 platform portal sections, permission filtering and tenant isolation.");
