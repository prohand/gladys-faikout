import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { createMemoryStore } from '../src/faikout/store.js';
import { OVERVIEW_WIDGET, UNIT_WIDGET } from '../src/widgets.js';
import { FakeUnit, createFakeNetwork } from './helpers/fakeFaikout.js';

const DEVICE_ID = 'ext:test-integration:faikout:30aea4a1b2c3';

async function boot(units = 'Salon=10.0.0.5, 10.0.0.6') {
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  net.add('10.0.0.6', new FakeUnit({ mac: '30AEA4000001', name: 'Bedroom' })).reachable = false;
  const gladys = createFakeGladys({ config: { units, poll_frequency: 600 } });
  const { manager } = createApp(gladys, {
    clientFactory: net.clientFactory,
    store: createMemoryStore(),
  });
  await gladys.connect();
  return {
    gladys,
    manager,
    unit,
    close: async () => {
      manager.close();
      await gladys.disconnect();
    },
  };
}

const getContent = async (gladys, key, settings = {}, units = 'metric') => {
  const ack = await gladys.fake.widgetGet(key, { settings, language: 'en', units });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
};

test('the unit widget is rendered exactly as sent, tiles bound to published features', async () => {
  const { gladys, close } = await boot();
  try {
    const content = await getContent(gladys, UNIT_WIDGET, { device: DEVICE_ID });
    assert.deepEqual(validateWidgetContent(content), []);
    const featureIds = new Set(
      gladys.fake.discoveredDevices.flatMap((d) => d.features.map((f) => f.external_id)),
    );
    const bound = content.components.filter((c) => c.device_feature);
    assert.equal(bound.length, 6, '4 live tiles and the On/Off buttons');
    for (const component of bound) {
      assert.ok(featureIds.has(component.device_feature), component.device_feature);
    }
    const rows = content.components.find((c) => c.type === 'status').items;
    assert.equal(rows[0].label, 'Salon');
    assert.deepEqual(rows[0].value, { en: 'Online', fr: 'En ligne' });
    assert.deepEqual(rows[1].value, { en: 'Heating', fr: 'Chauffage' });
  } finally {
    await close();
  }
});

test('the unit widget shows Faikout auto and defrost when they run', async () => {
  const { gladys, manager, unit, close } = await boot();
  try {
    unit.status.autor = 1.5;
    unit.status.autot = 21;
    unit.status.antifreeze = true;
    await manager.refreshAll();
    const content = await getContent(gladys, UNIT_WIDGET, { device: DEVICE_ID }, 'imperial');
    assert.deepEqual(validateWidgetContent(content), []);
    const rows = content.components.find((c) => c.type === 'status').items;
    assert.ok(rows.some((r) => r.value === '70 °F ± 1.5'));
    assert.ok(rows.some((r) => r.color === 'warning' && r.value.en === 'In progress'));
  } finally {
    await close();
  }
});

test('the unit widget without a unit, or with an unreachable one, stays valid', async () => {
  const { gladys, unit, manager, close } = await boot();
  try {
    const empty = await getContent(gladys, UNIT_WIDGET, {});
    assert.deepEqual(validateWidgetContent(empty), []);
    assert.equal(empty.components[0].type, 'text');

    unit.reachable = false;
    await manager.refreshAll();
    const down = await getContent(gladys, UNIT_WIDGET, { device: DEVICE_ID });
    assert.deepEqual(validateWidgetContent(down), []);
    const rows = down.components.find((c) => c.type === 'status').items;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].color, 'danger');
  } finally {
    await close();
  }
});

test('the overview lists every unit', async () => {
  const { gladys, close } = await boot();
  try {
    const content = await getContent(gladys, OVERVIEW_WIDGET);
    assert.deepEqual(validateWidgetContent(content), []);
    const rows = content.components.find((c) => c.type === 'status').items;
    assert.deepEqual(
      rows.map((r) => [r.label, r.value.en]),
      [
        ['Salon', 'Heating · 21.5 °C'],
        ['10.0.0.6', 'Unreachable'],
      ],
    );
  } finally {
    await close();
  }
});

test('the overview with no unit, or more than ten, stays valid', async () => {
  const { gladys, close } = await boot('');
  try {
    assert.deepEqual(validateWidgetContent(await getContent(gladys, OVERVIEW_WIDGET)), []);
    const many = Array.from({ length: 12 }, (_, i) => `10.0.1.${i + 1}`).join(',');
    await gladys.fake.configUpdated({ units: many, poll_frequency: 600 });
    const content = await getContent(gladys, OVERVIEW_WIDGET);
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components.find((c) => c.type === 'status').items.length, 10);
    assert.equal(content.components.find((c) => c.type === 'text').text.en, 'And 2 more');
  } finally {
    await close();
  }
});

test('the Refresh buttons read the units again', async () => {
  const { gladys, unit, close } = await boot();
  try {
    const before = unit.frames.length;
    const one = await gladys.fake.widgetAction(UNIT_WIDGET, 'refresh', { device: DEVICE_ID });
    assert.equal(one.success, true, one.error);
    const all = await gladys.fake.widgetAction(OVERVIEW_WIDGET, 'refresh');
    assert.equal(all.success, true, all.error);
    assert.equal(unit.frames.length, before + 2);
    const bad = await gladys.fake.widgetAction(UNIT_WIDGET, 'explode', { device: DEVICE_ID });
    assert.equal(bad.success, false);
  } finally {
    await close();
  }
});

test('a change the widgets show nudges them', async () => {
  const { gladys, manager, unit, close } = await boot();
  try {
    const before = gladys.fake.widgetRefreshes.length;
    await manager.refreshAll();
    await manager.flush();
    assert.equal(gladys.fake.widgetRefreshes.length, before, 'nothing changed, no nudge');
    unit.status.power = false;
    await manager.refreshAll();
    await manager.flush();
    assert.deepEqual(gladys.fake.widgetRefreshes.slice(before).sort(), [
      OVERVIEW_WIDGET,
      UNIT_WIDGET,
    ]);
  } finally {
    await close();
  }
});
