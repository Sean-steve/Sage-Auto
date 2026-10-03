import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCESS_SECTIONS, ROLE_SECTIONS } from '@carhire/constants';
import { RESTORATION_SCREEN_CONNECTIONS } from '../../../src/lib/access-context';

for (const [role, sections] of Object.entries(ROLE_SECTIONS)) {
  assert.equal(new Set(sections).size, sections.length, `${role} must not contain duplicate navigation entries`);
  for (const section of sections) assert.ok(ACCESS_SECTIONS[section], `${role} references unknown section ${section}`);
}

for (const [screen, connection] of Object.entries(RESTORATION_SCREEN_CONNECTIONS)) {
  assert.equal(connection.mutationsEnabled, false, `${screen} must stay read-only until its mutation gate is explicitly accepted`);
  assert.ok(connection.readSource.length > 0);
  assert.ok(connection.note.length > 0);
}

for (const screen of ['overview','fleet','bookings','customers','rentals','inspections','maintenance','compliance','owners','finance','settlements','pricing','availability','website','settings']) {
  assert.ok(RESTORATION_SCREEN_CONNECTIONS[screen], `missing restoration ledger entry for ${screen}`);
}

const restored=readFileSync('src/components/RestoredWorkspace.tsx','utf8');
assert.match(restored,/disabled=\{!connection\.mutationsEnabled\}/,'restored legacy screen must be disabled from the central mutation gate');

const access=readFileSync('src/components/AccessApp.tsx','utf8');
assert.match(access,/clearPortalContext/,'portal switching must use central tenant-context clearing');
assert.match(access,/apiClient\.clearTenantId\(\)/,'portal exit/access loss must clear API tenant context');

const client=readFileSync('src/lib/api-client.ts','utf8');
assert.match(client,/public clearTenantId\(\)/,'API client must expose explicit tenant clearing');
assert.match(client,/localStorage\.removeItem\('carhire_active_tenant_id'\)/,'empty tenant context must be removed rather than persisted');

console.log('PASS: restoration controls enforce unique role navigation, read-only legacy screens, and tenant-context clearing.');
