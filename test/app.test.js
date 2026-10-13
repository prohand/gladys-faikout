// -----------------------------------------------------------------------------
// The whole integration (src/app.js) against the SDK's fake Gladys and fake
// Faikout units: discovery, states, commands, transport badges, scene events.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { AC_MODE } from '../src/faikout/protocol.js';
import { TRIGGERS } from '../src/faikout/manager.js';
import { createMemoryStore } from '../src/faikout/store.js';
import { FakeUnit, createFakeNetwork } from './helpers/fakeFaikout.js';

const DEVICE_ID = 'ext:test-integration:faikout:30aea4a1b2c3';

async function boot({ units = 'Salon=10.0.0.5', net, store = createMemoryStore() } = {}) {
  if (!net) {
    net = createFakeNetwork();
    net.add('10.0.0.5');
  }
  const gladys = createFakeGladys({ config: { units, poll_frequency: 600 } });
  const { manager } = createApp(gladys, { clientFactory: net.clientFactory, store });
  await gladys.connect();
  const close = async () => {
    manager.close();
    await gladys.disconnect();
  };
  return { gladys, manager, net, store, unit: net.units.get('10.0.0.5'), close };
}

// Create in Gladys the device the integration discovered, like a user would.
async function createDevice(gladys, id = DEVICE_ID) {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === id);
  await gladys.fake.deviceCreated(device);
  return gladys.fake.devices.find((d) => d.external_id === id);
}

const featureOf = (device, key) => device.features.find((f) => f.external_id.endsWith(`:${key}`));

async function poll(manager) {
  await manager.refreshAll();
  await manager.flush();
}

test('one device per unit, named as configured, with the features its status carries', async () => {
  const { gladys, close } = await boot();
  try {
    const devices = gladys.fake.discoveredDevices;
    assert.equal(devices.length, 1);
    const [device] = devices;
    assert.equal(device.external_id, DEVICE_ID, 'keyed by the MAC address');
    assert.equal(device.name, 'Salon');
    assert.deepEqual(device.params, [
      { name: 'host', value: '10.0.0.5' },
      { name: 'model', value: 'FTXM25R' },
    ]);
    const keys = device.features.map((f) => f.external_id.split(':').at(-1));
    assert.deepEqual(keys, [
      'power',
      'mode',
      'temp',
      'fan',
      'swingh',
      'swingv',
      'econo',
      'powerful',
      'quiet',
      'home',
      'outside',
      'inlet',
      'liquid',
      'hum',
      'consumption',
    ]);
    assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  } finally {
    await close();
  }
});

test('states and badges wait for the device to exist in Gladys, then come at once', async () => {
  const { gladys, close } = await boot();
  try {
    assert.equal(gladys.fake.states.length, 0, 'no state for a device not created');
    assert.equal(gladys.fake.transports.length, 0);
    await createDevice(gladys);
    assert.equal(gladys.fake.lastState(`${DEVICE_ID}:power`), 1);
    assert.equal(gladys.fake.lastState(`${DEVICE_ID}:mode`), AC_MODE.HEATING);
    assert.equal(gladys.fake.lastState(`${DEVICE_ID}:home`), 21.5);
    assert.equal(gladys.fake.transports.at(-1).transport, 'local');
  } finally {
    await close();
  }
});

test('a Gladys command reaches the unit, its state follows, and no "outside" event fires', async () => {
  const { gladys, manager, unit, close } = await boot();
  try {
    const device = await createDevice(gladys);
    const ack = await gladys.fake.setValue(device, featureOf(device, 'mode'), AC_MODE.COOLING);
    assert.equal(ack.success, true, ack.error);
    assert.equal(unit.status.mode, 'C');
    assert.equal(unit.frames.at(-1), '{"mode":"C"}');
    assert.equal(gladys.fake.lastState(`${DEVICE_ID}:mode`), AC_MODE.COOLING);
    await poll(manager);
    assert.equal(gladys.fake.sceneEvents.length, 0);
  } finally {
    await close();
  }
});

test('a command the unit does not apply fails with a reason', async () => {
  const { gladys, unit, close } = await boot();
  try {
    const device = await createDevice(gladys);
    unit.refuse.add('econo');
    const ack = await gladys.fake.setValue(device, featureOf(device, 'econo'), 1);
    assert.equal(ack.success, false);
    assert.match(ack.error, /did not apply/);
    const bad = await gladys.fake.setValue(device, featureOf(device, 'home'), 20);
    assert.equal(bad.success, false, 'a sensor is not a control');
  } finally {
    await close();
  }
});

test('a change made with the remote fires changed_outside, with the new values', async () => {
  const { gladys, manager, unit, close } = await boot();
  try {
    await createDevice(gladys);
    unit.status.mode = 'C';
    unit.status.temp = 24;
    await poll(manager);
    const events = gladys.fake.sceneEvents.filter((e) => e.key === TRIGGERS.CHANGED_OUTSIDE);
    assert.deepEqual(
      events.map((e) => e.data.what),
      ['mode', 'temp'],
    );
    assert.deepEqual(events[0].data, {
      device: DEVICE_ID,
      what: 'mode',
      power: true,
      mode: 'cool',
      temperature: 24,
      fan: 'auto',
    });
    assert.equal(gladys.fake.lastState(`${DEVICE_ID}:temp`), 24);
  } finally {
    await close();
  }
});

test('Faikout auto moving the set point by itself is not a change "outside Gladys"', async () => {
  const { gladys, manager, unit, close } = await boot();
  try {
    unit.status.control = true;
    await poll(manager);
    unit.status.temp = 28;
    unit.status.mode = 'C';
    await poll(manager);
    assert.equal(gladys.fake.sceneEvents.length, 0);
  } finally {
    await close();
  }
});

test('a unit that stops answering turns unreachable, fires link_changed, and comes back', async () => {
  const { gladys, manager, unit, close } = await boot();
  try {
    await createDevice(gladys);
    unit.reachable = false;
    await gladys.fake.action('test_connection');
    assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
    assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
      key: TRIGGERS.LINK_CHANGED,
      data: { device: DEVICE_ID, state: 'offline', reason: 'unreachable' },
    });
    assert.equal(gladys.fake.connectionStatus.connected, false);

    unit.reachable = true;
    await poll(manager);
    assert.equal(gladys.fake.transports.at(-1).transport, 'local');
    assert.deepEqual(gladys.fake.sceneEvents.at(-1).data.state, 'online');
  } finally {
    await close();
  }
});

test('an air conditioner silent behind its Faikout shows a degraded badge', async () => {
  const { gladys, manager, unit, close } = await boot();
  try {
    await createDevice(gladys);
    unit.status.online = false;
    await poll(manager);
    const badge = gladys.fake.transports.at(-1);
    assert.equal(badge.transport, 'local');
    assert.equal(badge.degraded, true);
    assert.equal(gladys.fake.sceneEvents.at(-1).data.reason, 'aircon');
  } finally {
    await close();
  }
});

test('defrost start and end fire defrost_changed', async () => {
  const { gladys, manager, unit, close } = await boot();
  try {
    unit.status.antifreeze = true;
    await poll(manager);
    unit.status.antifreeze = false;
    await poll(manager);
    assert.deepEqual(
      gladys.fake.sceneEvents.map((e) => [e.key, e.data.state]),
      [
        [TRIGGERS.DEFROST_CHANGED, 'started'],
        [TRIGGERS.DEFROST_CHANGED, 'ended'],
      ],
    );
  } finally {
    await close();
  }
});

test('a unit switched off at start-up keeps its device, from what was remembered', async () => {
  const store = createMemoryStore();
  const first = await boot({ store });
  await first.close();
  assert.equal(store.data['10.0.0.5'].mac, '30aea4a1b2c3');

  const net = createFakeNetwork();
  net.add('10.0.0.5').reachable = false;
  const { gladys, close } = await boot({ net, store });
  try {
    assert.equal(gladys.fake.discoveredDevices[0]?.external_id, DEVICE_ID);
    assert.equal(gladys.fake.discoveredDevices[0].features.length, 15);
    assert.equal(gladys.fake.connectionStatus.connected, false);
  } finally {
    await close();
  }
});

test('a saved configuration adds and removes units', async () => {
  const net = createFakeNetwork();
  net.add('10.0.0.5');
  net.add('10.0.0.6', new FakeUnit({ mac: '30AEA4000001', name: 'Bedroom' }));
  const { gladys, close } = await boot({ net });
  try {
    await gladys.fake.configUpdated({ units: '10.0.0.6', poll_frequency: 600 });
    assert.deepEqual(
      gladys.fake.discoveredDevices.map((d) => d.name),
      ['Bedroom'],
      'named by the unit itself when the configuration gives no name',
    );
    await gladys.fake.configUpdated({ units: '', poll_frequency: 600 });
    assert.deepEqual(gladys.fake.discoveredDevices, []);
    assert.equal(gladys.fake.connectionStatus.connected, false);
  } finally {
    await close();
  }
});

test('the same unit typed by IP and by name is one device', async () => {
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  net.add('guestac.lan', unit);
  const { gladys, close } = await boot({ net, units: '10.0.0.5, guestac.lan' });
  try {
    assert.equal(gladys.fake.discoveredDevices.length, 1);
  } finally {
    await close();
  }
});

test('Test the connection says what answered', async () => {
  const net = createFakeNetwork();
  net.add('10.0.0.5');
  net.add('10.0.0.6').reachable = false;
  const { gladys, close } = await boot({ net, units: 'Salon=10.0.0.5, 10.0.0.6, n o' });
  try {
    const ack = await gladys.fake.action('test_connection');
    assert.equal(ack.success, true);
    const { en, fr } = ack.data.message;
    assert.match(
      en,
      /✓ Salon \(10\.0\.0\.5\): OK \(FTXM25R, protocol S21\) — Heating, room 21\.5 °C/,
    );
    assert.match(en, /✗ 10\.0\.0\.6 \(10\.0\.0\.6\): no answer/);
    assert.match(en, /Ignored, not an address: n o/);
    assert.match(fr, /Chauffage, pièce 21\.5 °C/);
  } finally {
    await close();
  }
});

test('a web password: told when missing, used once typed, at once', async () => {
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  unit.password = 's3cret';
  const { gladys, close } = await boot({ net });
  try {
    assert.deepEqual(gladys.fake.discoveredDevices, []);
    assert.equal(gladys.fake.connectionStatus.connected, false);
    assert.match(gladys.fake.connectionStatus.message.en, /web password/);
    const ack = await gladys.fake.action('test_connection');
    assert.match(ack.data.message.en, /✗ Salon \(10\.0\.0\.5\): web password missing or wrong/);
    assert.match(ack.data.message.fr, /mot de passe web absent ou faux/);

    await gladys.fake.configUpdated({
      units: 'Salon=10.0.0.5',
      password: 's3cret',
      poll_frequency: 600,
    });
    assert.equal(gladys.fake.discoveredDevices.length, 1);
    assert.equal(gladys.fake.connectionStatus.connected, true);
  } finally {
    await close();
  }
});

test('a changed web password drops the socket opened with the old one', async () => {
  const { gladys, manager, unit, close } = await boot();
  try {
    const before = manager.units.get('10.0.0.5').client;
    unit.password = 'new';
    await gladys.fake.configUpdated({
      units: 'Salon=10.0.0.5',
      password: 'new',
      poll_frequency: 600,
    });
    const after = manager.units.get('10.0.0.5').client;
    assert.notEqual(after, before);
    assert.equal(after.password, 'new');
    await poll(manager);
    assert.equal(manager.units.get('10.0.0.5').link, 'online');
  } finally {
    await close();
  }
});

test('a scan request reads the units and publishes the devices again', async () => {
  const { gladys, unit, close } = await boot();
  try {
    const before = unit.frames.length;
    await gladys.fake.scanRequest();
    assert.equal(unit.frames.length, before + 1);
    assert.equal(gladys.fake.discoveredDevices.length, 1);
  } finally {
    await close();
  }
});
