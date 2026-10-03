import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESTORATION_SCREEN_CONNECTIONS } from '../../../src/lib/access-context';

const view=readFileSync('src/components/CustomersDriversExperienceView.tsx','utf8');
const restored=readFileSync('src/components/RestoredWorkspace.tsx','utf8');
const client=readFileSync('src/lib/api-client.ts','utf8');
const driversController=readFileSync('apps/api/src/modules/drivers/presentation/drivers.controller.ts','utf8');
const contracts=readFileSync('docs/CUSTOMERS_DRIVERS_EXPERIENCE_CONTRACTS.md','utf8');

assert.equal(RESTORATION_SCREEN_CONNECTIONS.customers.status,'PARTIAL');
assert.equal(RESTORATION_SCREEN_CONNECTIONS.customers.mutationsEnabled,true);

assert.match(restored,/CustomersDriversExperienceView/,'restored Customers route must use reconstructed People experience');
assert.doesNotMatch(view,/INITIAL_CUSTOMERS|mockData|setIsNewCustomerOpen|const\s*\{[^}]*updateCustomer[^}]*\}\s*=\s*useApp/s,'People experience must not use legacy customer store as business authority');

for (const call of [
  'apiClient.customers.listCustomers',
  'apiClient.customers.getCustomer',
  'apiClient.customers.createCustomer',
  'apiClient.customers.updateCustomer',
  'apiClient.customers.verifyCustomer',
  'apiClient.customers.changeStatus',
  'apiClient.drivers.listDrivers',
  'apiClient.drivers.getDriver',
  'apiClient.drivers.createDriver',
  'apiClient.drivers.updateDriver',
  'apiClient.drivers.changeStatus',
  'apiClient.drivers.verifyDriver',
  'apiClient.drivers.listCustomerRelationships',
  'apiClient.drivers.linkCustomer',
  'apiClient.drivers.unlinkCustomer',
  'apiClient.corporateAccounts.listAccounts',
  'apiClient.corporateAccounts.getAccount',
  'apiClient.corporateAccounts.createAccount',
  'apiClient.corporateAccounts.updateAccount',
  'apiClient.corporateAccounts.authorizeDriver',
  'apiClient.corporateAccounts.revokeAuthorizedDriver',
  'apiClient.compliance.getDriverReadiness',
]) assert.ok(view.includes(call), 'People experience must use '+call);

for (const permission of [
  'customer.read','customer.create','customer.update','customer.verify','customer.block',
  'driver.read','driver.create','driver.update','driver.assign','compliance.read'
]) assert.ok(view.includes(permission), 'People UI must account for '+permission);

assert.match(client,/public drivers =/);
assert.match(client,/public corporateAccounts =/);
assert.match(client,/getDriverReadiness:/);
assert.match(driversController,/\/relationships\/customer\/:customerId/);
assert.match(driversController,/TENANT_PERMISSIONS\.DRIVER_ASSIGN/);

for (let i=1;i<=16;i++) {
  const contract='PEOPLE-'+String(i).padStart(3,'0');
  assert.ok(contracts.includes(contract), 'Missing People contract '+contract);
}

assert.match(view,/md:hidden/,'People lists must include mobile card presentations');
assert.match(view,/overflow-x-auto/,'People tabs/lists must remain reachable on narrow screens');
assert.match(view,/expectedVersion/,'People mutations must preserve optimistic concurrency where supported');
assert.match(view,/Customer prefill will be connected when the Booking experience is reconstructed/,'Booking handoff must remain truthful');

console.log('PASS: Customers, Drivers and Corporate Accounts are server-backed, permission-aware and responsive.');
