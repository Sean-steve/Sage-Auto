import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCESS_SECTIONS, ROLE_SECTIONS } from '@carhire/constants';
import { RESTORATION_SCREEN_CONNECTIONS } from '../../../src/lib/access-context';

for (const [role, sections] of Object.entries(ROLE_SECTIONS)) {
  assert.equal(new Set(sections).size, sections.length, `${role} must not contain duplicate navigation entries`);
  for (const section of sections) assert.ok(ACCESS_SECTIONS[section], `${role} references unknown section ${section}`);
}

for (const [screen, connection] of Object.entries(RESTORATION_SCREEN_CONNECTIONS)) {
  if (screen === 'fleet' || screen === 'customers' || screen === 'pricing' || screen === 'availability' || screen === 'bookings' || screen === 'handover') {
    assert.equal(connection.status, 'PARTIAL', `${screen} must retain its reconstruction audit status`);
    assert.equal(connection.mutationsEnabled, true, `${screen} reconstructed mutation contract must remain recorded`);
  }
  assert.ok(connection.readSource.length > 0);
  assert.ok(connection.note.length > 0);
}

for (const screen of ['overview','fleet','bookings','handover','customers','rentals','inspections','maintenance','compliance','owners','finance','settlements','pricing','availability','website','settings']) {
  assert.ok(RESTORATION_SCREEN_CONNECTIONS[screen], `missing restoration ledger entry for ${screen}`);
}

const restored=readFileSync('src/components/RestoredWorkspace.tsx','utf8');
assert.doesNotMatch(restored,/disabled=\{!connection\.mutationsEnabled\}/,'Company workspace must not use the historical restoration ledger as a global mutation gate');
assert.doesNotMatch(restored,/Original screen — read-only restoration|restoration-actions-note/,'Company workspace must not render the legacy read-only restoration banner');
assert.match(restored,/ReturnFinalCalculationView/,'Return & final calculation must be reachable from the unified Company workspace');
assert.match(restored,/FinanceView/,'Finance must be reachable from the unified Company workspace');
assert.match(restored,/SettlementsView/,'Owner Settlements must be reachable from the unified Company workspace');

const access=readFileSync('src/components/AccessApp.tsx','utf8');
assert.match(access,/clearPortalContext/,'portal switching must use central tenant-context clearing');
assert.match(access,/apiClient\.clearTenantId\(\)/,'portal exit/access loss must clear API tenant context');

const client=readFileSync('src/lib/api-client.ts','utf8');
assert.match(client,/public clearTenantId\(\)/,'API client must expose explicit tenant clearing');
assert.match(client,/localStorage\.removeItem\('carhire_active_tenant_id'\)/,'empty tenant context must be removed rather than persisted');

console.log('PASS: unified workspace preserves reconstruction audit evidence without a global read-only gate, and tenant-context clearing remains enforced.');
