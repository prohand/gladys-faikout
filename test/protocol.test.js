import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AC_FAN_SPEED,
  AC_MODE,
  FEATURES,
  capabilitiesOf,
  controlFrame,
  frameApplied,
  statesOf,
} from '../src/faikout/protocol.js';
import { SAMPLE_STATUS } from './helpers/fakeFaikout.js';

const featureId = (key) => `dev:${key}`;
const stateOf = (status, key) =>
  statesOf(status, [key], featureId).find((s) => s.device_feature_external_id === featureId(key))
    ?.state;

test('every feature declares min and max (NOT NULL in Gladys) and a unique key', () => {
  const keys = new Set();
  for (const feature of FEATURES) {
    assert.equal(typeof feature.min, 'number', `${feature.key}.min`);
    assert.equal(typeof feature.max, 'number', `${feature.key}.max`);
    assert.ok(feature.min < feature.max, `${feature.key}: min < max`);
    assert.ok(!keys.has(feature.key), `${feature.key} declared twice`);
    keys.add(feature.key);
  }
});

test('the features of a unit are the fields its status carries', () => {
  const caps = capabilitiesOf(SAMPLE_STATUS);
  assert.ok(caps.includes('power') && caps.includes('home') && caps.includes('consumption'));
  assert.ok(!caps.includes('comfort'), 'a field the unit does not send is not a feature');
  assert.ok(!caps.includes('streamer'));
  // A field reported as null (a reading not known yet) is still a feature.
  assert.ok(capabilitiesOf({ outside: null }).includes('outside'));
  assert.deepEqual(capabilitiesOf(undefined), []);
});

test('Faikout modes and fan speeds map to the Gladys values', () => {
  assert.equal(stateOf({ mode: 'H' }, 'mode'), AC_MODE.HEATING);
  assert.equal(stateOf({ mode: 'C' }, 'mode'), AC_MODE.COOLING);
  assert.equal(stateOf({ mode: 'A' }, 'mode'), AC_MODE.AUTO);
  assert.equal(stateOf({ mode: 'D' }, 'mode'), AC_MODE.DRYING);
  assert.equal(stateOf({ mode: 'F' }, 'mode'), AC_MODE.FAN);
  assert.equal(stateOf({ mode: '4' }, 'mode'), undefined, 'an unknown mode is not published');
  assert.equal(stateOf({ fan: 'A' }, 'fan'), AC_FAN_SPEED.AUTO);
  assert.equal(stateOf({ fan: '3' }, 'fan'), AC_FAN_SPEED.MID);
  assert.equal(stateOf({ fan: 'Q' }, 'fan'), AC_FAN_SPEED.QUIET);
});

test('booleans become 0/1 and null readings are left out', () => {
  assert.equal(stateOf({ power: true }, 'power'), 1);
  assert.equal(stateOf({ power: false }, 'power'), 0);
  assert.equal(stateOf({ home: 21.5 }, 'home'), 21.5);
  assert.equal(stateOf({ home: null }, 'home'), undefined);
  assert.equal(statesOf(SAMPLE_STATUS, capabilitiesOf(SAMPLE_STATUS), featureId).length, 15);
});

test('a Gladys value becomes the control frame the firmware reads', () => {
  assert.deepEqual(controlFrame('power', 1), { power: true });
  assert.deepEqual(controlFrame('power', '0'), { power: false });
  assert.deepEqual(controlFrame('mode', AC_MODE.COOLING), { mode: 'C' });
  assert.deepEqual(controlFrame('fan', AC_FAN_SPEED.QUIET), { fan: 'Q' });
  assert.deepEqual(controlFrame('temp', 21.3), { temp: 21.5 }, 'half degrees');
  assert.deepEqual(controlFrame('econo', 1), { econo: true });
  assert.throws(() => controlFrame('home', 20), /cannot be controlled/);
  assert.throws(() => controlFrame('nope', 1), /cannot be controlled/);
  assert.throws(() => controlFrame('mode', 9), /Invalid value/);
  assert.throws(() => controlFrame('power', 2), /Invalid value/);
  assert.throws(() => controlFrame('temp', 'warm'), /Invalid value/);
});

test('a refused control shows as an unchanged value', () => {
  assert.ok(frameApplied({ mode: 'C' }, { mode: 'C' }));
  assert.ok(!frameApplied({ mode: 'C' }, { mode: 'H' }));
  assert.ok(!frameApplied({ econo: true }, {}), 'a unit without the option');
  assert.ok(frameApplied({ temp: 40 }, { temp: 32 }), 'the firmware clamps the set point');
  assert.ok(
    frameApplied({ power: false }, { power: true, mode: 'F' }),
    'fanrun: the fan runs on before the unit stops',
  );
});
