import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { createMemoryStore } from '../src/faikout/store.js';
import { LANGUAGES } from '../src/labels.js';
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

// Every multi-language text of a widget content is written in every language.
function assertEveryLanguage(node, path = 'content') {
  if (Array.isArray(node)) {
    node.forEach((item, i) => assertEveryLanguage(item, `${path}[${i}]`));
  } else if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      assert.deepEqual(Object.keys(node).sort(), [...LANGUAGES].sort(), path);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      assertEveryLanguage(value, `${path}.${key}`);
    }
  }
}

test('the unit widget is rendered exactly as sent, tiles and chart bound to published features', async () => {
  const { gladys, close } = await boot();
  try {
    const content = await getContent(gladys, UNIT_WIDGET, { device: DEVICE_ID });
    assert.deepEqual(validateWidgetContent(content), []);
    assert.ok(content.components.length <= 8, 'within the content budget');
    const featureIds = new Set(
      gladys.fake.discoveredDevices.flatMap((d) => d.features.map((f) => f.external_id)),
    );
    const tiles = content.components.filter((c) => c.type === 'value');
    assert.deepEqual(
      tiles.map((t) => t.label.fr),
      ['Pièce', 'Consigne', 'Extérieur', 'Puissance'],
    );
    const chart = content.components.find((c) => c.type === 'chart');
    assert.equal(chart.interval, 'last-day');
    assert.deepEqual(
      chart.device_features.map((id) => id.split(':').pop()),
      ['home', 'temp', 'outside'],
    );
    const bound = [
      ...content.components.filter((c) => c.device_feature).map((c) => c.device_feature),
      ...chart.device_features,
    ];
    assert.equal(bound.length, 8, '4 live tiles, 3 curves and the power button');
    for (const id of bound) {
      assert.ok(featureIds.has(id), id);
    }
    const power = content.components.find((c) => c.type === 'button' && c.device_feature);
    assert.deepEqual([power.label.fr, power.value], ['Éteindre', 0]);
    const rows = content.components.find((c) => c.type === 'status').items;
    assert.deepEqual(
      rows.map((r) => [r.label.fr, r.value.fr]),
      [
        ['État', 'En marche'],
        ['Mode', 'Chauffage'],
        ['Ventilation', 'Auto'],
        ['Volets', 'Verticaux'],
        ['Modes confort', 'Aucun'],
      ],
    );
  } finally {
    await close();
  }
});

test('the unit widget follows power, flaps and comfort modes', async () => {
  const { gladys, manager, unit, close } = await boot();
  try {
    Object.assign(unit.status, { power: false, swingv: false, econo: true, quiet: true });
    await manager.refreshAll();
    const content = await getContent(gladys, UNIT_WIDGET, { device: DEVICE_ID });
    assert.deepEqual(validateWidgetContent(content), []);
    const rows = Object.fromEntries(
      content.components.find((c) => c.type === 'status').items.map((r) => [r.label.en, r.value]),
    );
    assert.deepEqual(rows.State, { en: 'Off', fr: 'Arrêtée', de: 'Aus', es: 'Apagado' });
    assert.deepEqual(rows.Mode, { en: 'Heating', fr: 'Chauffage', de: 'Heizen', es: 'Calor' });
    assert.deepEqual(rows.Flaps, { en: 'Fixed', fr: 'Fixes', de: 'Fest', es: 'Fijas' });
    assert.deepEqual(rows['Comfort modes'], {
      en: 'Econo, Quiet',
      fr: 'Éco, Silence',
      de: 'Eco, Leise',
      es: 'Eco, Silencio',
    });
    assertEveryLanguage(content);
    const power = content.components.find((c) => c.type === 'button' && c.device_feature);
    assert.deepEqual([power.label.fr, power.value], ['Allumer', 1]);
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
    assert.deepEqual(rows[0].value, {
      en: 'Unreachable',
      fr: 'Injoignable',
      de: 'Nicht erreichbar',
      es: 'Inaccesible',
    });
    assertEveryLanguage(empty);
    assertEveryLanguage(down);
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
    assertEveryLanguage(content);
    assert.equal(rows[0].value.de, 'Heizen · 21.5 °C');
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
    assertEveryLanguage(content);
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
