import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESTORATION_SCREEN_CONNECTIONS } from '../../../src/lib/access-context';

const view=readFileSync('src/components/PricingExperienceView.tsx','utf8');
const restored=readFileSync('src/components/RestoredWorkspace.tsx','utf8');
const client=readFileSync('src/lib/api-client.ts','utf8');
const controller=readFileSync('apps/api/src/modules/pricing/presentation/pricing.controller.ts','utf8');
const contracts=readFileSync('docs/PRICING_EXPERIENCE_CONTRACTS.md','utf8');

assert.equal(RESTORATION_SCREEN_CONNECTIONS.pricing.status,'PARTIAL');
assert.equal(RESTORATION_SCREEN_CONNECTIONS.pricing.mutationsEnabled,true);
assert.match(restored,/PricingExperienceView/,'restored Pricing route must use reconstructed Pricing experience');
assert.doesNotMatch(view,/calculateInstantQuote|ratePlans\s*=\s*\[\]|createRatePlan\s*,\s*updateRatePlan/,'Pricing experience must not use legacy local pricing authority');

for (const call of [
  'apiClient.pricing.getRatePlans',
  'apiClient.pricing.getRates',
  'apiClient.pricing.setRates',
  'apiClient.pricing.getAssignments',
  'apiClient.pricing.assignPlan',
  'apiClient.pricing.getSeasonalRules',
  'apiClient.pricing.createSeasonalRule',
  'apiClient.pricing.deleteSeasonalRule',
  'apiClient.pricing.getDurationTiers',
  'apiClient.pricing.createDurationTier',
  'apiClient.pricing.deleteDurationTier',
  'apiClient.pricing.getFees',
  'apiClient.pricing.createFee',
  'apiClient.pricing.deleteFee',
  'apiClient.pricing.getPromoCodes',
  'apiClient.pricing.createPromoCode',
  'apiClient.pricing.updatePromoStatus',
  'apiClient.pricing.calculateQuote',
]) assert.ok(view.includes(call), 'Pricing experience must use '+call);

for (const permission of ['pricing.read','pricing.calculate','pricing.rate_plan.manage','pricing.promo.manage'])
  assert.ok(view.includes(permission), 'Pricing UI must account for '+permission);

assert.match(client,/calculateQuote:\s*\(req: any\) => this\.post\('\/pricing\/calculate'/,'quote client must call canonical calculate endpoint');
assert.doesNotMatch(client,/\/pricing\/quote/,'legacy quote endpoint must not remain in API client');
assert.match(controller,/\/seasonal-rules\/:id/);
assert.match(controller,/\/duration-tiers\/:id/);
assert.match(controller,/\/fees\/:id/);
assert.match(controller,/\/promo-codes\/:id\/status/);

for (let i=1;i<=17;i++){const id='PRICING-'+String(i).padStart(3,'0');assert.ok(contracts.includes(id),'Missing Pricing contract '+id);}

assert.match(view,/Saving replaces this plan's matrix atomically/,'matrix replacement semantics must be explicit');
assert.match(view,/expectedVersion:selectedPlan\.version/,'plan edits must use optimistic concurrency');
assert.match(view,/The browser sends inputs; Sage-Auto's Pricing Engine returns the authoritative result/,'server quote authority must be visible');
assert.match(view,/overflow-x-auto/,'Pricing tabs and tables must remain reachable on narrow screens');
assert.match(view,/This Workbench result is not a Booking/,'Booking handoff boundary must remain truthful');

console.log('PASS: Pricing is server-backed, permission-aware, responsive and uses the canonical quote engine.');
