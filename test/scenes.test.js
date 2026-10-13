import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { FAN_NAMES, MODE_NAMES } from '../src/faikout/protocol.js';
import { createMemoryStore } from '../src/faikout/store.js';
import { climateFrame } from '../src/scenes.js';
import { createFakeNetwork } from './helpers/fakeFaikout.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const DEVICE_ID = 'ext:test-integration:faikout:30aea4a1b2c3';

const optionsOf = (list, key, field) =>
  manifest[list]
    .find((entry) => entry.key === key)
    .fields.find((f) => f.key === field)
    .options.map((o) => o.value);

async function boot() {
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  const gladys = createFakeGladys({ config: { units: '10.0.0.5', poll_frequency: 600 } });
  const { manager } = createApp(gladys, {
    clientFactory: net.clientFactory,
    store: createMemoryStore(),
  });
  await gladys.connect();
  return {
    gladys,
    unit,
    close: async () => {
      manager.close();
      await gladys.disconnect();
    },
  };
}

test('the scene options are exactly the modes and fan speeds the code knows', () => {
  assert.deepEqual(
    optionsOf('scene_actions', 'set_climate', 'mode').sort(),
    Object.values(MODE_NAMES).sort(),
  );
  assert.deepEqual(
    optionsOf('scene_actions', 'set_climate', 'fan').sort(),
    Object.values(FAN_NAMES).sort(),
  );
});

test('set_climate builds one frame from the filled fields only', () => {
  assert.deepEqual(climateFrame({ power: 'on', mode: 'cool', temperature: 23.2, fan: 'quiet' }), {
    power: true,
    mode: 'C',
    temp: 23,
    fan: 'Q',
  });
  assert.deepEqual(climateFrame({ power: '', mode: null, temperature: undefined }), {});
  assert.throws(() => climateFrame({ mode: 'warm' }), /Invalid mode/);
  assert.throws(() => climateFrame({ power: 'maybe' }), /Invalid power/);
  assert.throws(() => climateFrame({ fan: '9' }), /Invalid fan/);
  assert.throws(() => climateFrame({ temperature: 'hot' }), /Invalid temperature/);
});

test('set_climate drives the unit and returns its new state', async () => {
  const { gladys, unit, close } = await boot();
  try {
    const ack = await gladys.fake.sceneAction('set_climate', {
      device: DEVICE_ID,
      power: 'on',
      mode: 'cool',
      temperature: 24,
    });
    assert.equal(ack.success, true, ack.error);
    assert.equal(unit.frames.at(-1), '{"power":true,"mode":"C","temp":24}');
    assert.equal(ack.data.outputs.mode, 'cool');
    assert.equal(ack.data.outputs.target_temperature, 24);
    assert.equal(ack.data.outputs.online, true);

    const empty = await gladys.fake.sceneAction('set_climate', { device: DEVICE_ID });
    assert.equal(empty.success, false);
    const unknown = await gladys.fake.sceneAction('set_climate', { device: 'nope', power: 'on' });
    assert.equal(unknown.success, false);
  } finally {
    await close();
  }
});

test('set_faikout_auto writes the target and range', async () => {
  const { gladys, unit, close } = await boot();
  try {
    const ack = await gladys.fake.sceneAction('set_faikout_auto', {
      device: DEVICE_ID,
      target: 21.25,
      range: 0.5,
    });
    assert.equal(ack.success, true, ack.error);
    assert.equal(unit.frames.at(-1), '{"autot":21.3,"autor":0.5}');
    assert.deepEqual(ack.data.outputs, { enabled: true });
    const off = await gladys.fake.sceneAction('set_faikout_auto', {
      device: DEVICE_ID,
      target: 21,
      range: 0,
    });
    assert.deepEqual(off.data.outputs, { enabled: false });
  } finally {
    await close();
  }
});

test('read_status answers online: false instead of failing', async () => {
  const { gladys, unit, close } = await boot();
  try {
    const ok = await gladys.fake.sceneAction('read_status', { device: DEVICE_ID });
    assert.deepEqual(ok.data.outputs, {
      online: true,
      power: true,
      mode: 'heat',
      target_temperature: 22,
      room_temperature: 21.5,
      outside_temperature: 8,
      humidity: 45,
    });
    unit.reachable = false;
    const down = await gladys.fake.sceneAction('read_status', { device: DEVICE_ID });
    assert.equal(down.success, true);
    assert.deepEqual(down.data.outputs, { online: false });
  } finally {
    await close();
  }
});
