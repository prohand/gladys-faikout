import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, normalizeHost, parseUnits } from '../src/config.js';

test('units are read with or without a name, whatever the separator', () => {
  const { units, invalid } = parseUnits(
    'Salon=192.168.1.50, Chambre = guestac.local;192.168.1.52\n http://192.168.1.53/ ',
  );
  assert.deepEqual(units, [
    { host: '192.168.1.50', label: 'Salon' },
    { host: 'guestac.local', label: 'Chambre' },
    { host: '192.168.1.52', label: null },
    { host: '192.168.1.53', label: null },
  ]);
  assert.deepEqual(invalid, []);
});

test('a unit typed twice is kept once, an unusable entry is reported', () => {
  const { units, invalid } = parseUnits('A=10.0.0.5, 10.0.0.5, B=not an address, =10.0.0.6');
  assert.deepEqual(
    units.map((u) => u.host),
    ['10.0.0.5', '10.0.0.6'],
  );
  assert.deepEqual(invalid, ['B=not an address']);
  assert.deepEqual(parseUnits(''), { units: [], invalid: [] });
  assert.deepEqual(parseUnits(undefined), { units: [], invalid: [] });
});

test('addresses: ports, IPv6, schemes and case', () => {
  assert.equal(normalizeHost('GuestAC.local'), 'guestac.local');
  assert.equal(normalizeHost('10.0.0.5:8080'), '10.0.0.5:8080');
  assert.equal(normalizeHost('ws://10.0.0.5/status'), '10.0.0.5');
  assert.equal(normalizeHost('[fe80::1]:80'), '[fe80::1]:80');
  assert.equal(normalizeHost('10.0.0.5:99999'), null);
  assert.equal(normalizeHost('a b'), null);
  assert.equal(normalizeHost('evil.com@10.0.0.5'), null);
  assert.equal(normalizeHost(''), null);
});

test('normalizeConfig types and bounds the values', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(normalizeConfig({ poll_frequency: '60' }).poll_frequency, 60);
  assert.equal(normalizeConfig({ poll_frequency: 1 }).poll_frequency, 5);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, 600);
  assert.equal(normalizeConfig({ poll_frequency: 'x' }).poll_frequency, 30);
  assert.equal(normalizeConfig({ units: 42 }).units, '');
  assert.equal(normalizeConfig({ password: ' s3cret\n' }).password, 's3cret');
  assert.equal(normalizeConfig({ password: null }).password, '');
});
